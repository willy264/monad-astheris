//! ACID durable replay protection. redb runs on blocking threads, never on Tokio workers.
use anyhow::{anyhow, ensure, Context, Result};
use redb::{Database, DatabaseError, ReadableTable, TableDefinition};
use serde::{de::DeserializeOwned, Serialize};
use std::{path::Path, sync::Arc};

const RECORDS: TableDefinition<&str, &[u8]> = TableDefinition::new("records");

#[derive(Clone)]
pub struct Store(Arc<Database>);

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        ensure!(
            path.file_name().is_some() && !path.as_os_str().is_empty(),
            "DATABASE_PATH must name a database file"
        );
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let metadata = std::fs::metadata(parent).map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => anyhow!("DATABASE_PATH parent directory is missing; mount the persistent disk or create the chosen local directory before startup. No directory or replacement database was created"),
            _ => anyhow!("DATABASE_PATH parent directory is inaccessible; check mount and filesystem permissions"),
        })?;
        ensure!(
            metadata.is_dir(),
            "DATABASE_PATH parent must be a directory"
        );
        // Never create parent directories or select a fallback path: an absent durable
        // mount must not silently become an empty ephemeral payment/replay journal.
        let db = Database::create(path).map_err(|error| match error {
            DatabaseError::DatabaseAlreadyOpen => anyhow!("DATABASE_PATH is locked by another process; run one daemon instance per journal with exclusive relayer keys"),
            _ => anyhow!("DATABASE_PATH could not be opened; check file permissions, disk space and journal integrity. Preserve the existing journal for reconciliation"),
        })?;
        let tx = db.begin_write()?;
        tx.open_table(RECORDS)?;
        tx.commit()?;
        Ok(Self(Arc::new(db)))
    }

    pub async fn get<T: DeserializeOwned + Send + 'static>(
        &self,
        key: String,
    ) -> Result<Option<T>> {
        let db = self.0.clone();
        tokio::task::spawn_blocking(move || {
            let tx = db.begin_read()?;
            let table = tx.open_table(RECORDS)?;
            let result = table
                .get(key.as_str())?
                .map(|bytes| {
                    serde_json::from_slice(bytes.value()).context("stored record corrupted")
                })
                .transpose();
            result
        })
        .await?
    }

    pub async fn put<T: Serialize>(&self, key: String, value: &T) -> Result<()> {
        let db = self.0.clone();
        let bytes = serde_json::to_vec(value)?;
        tokio::task::spawn_blocking(move || -> Result<()> {
            let tx = db.begin_write()?;
            {
                tx.open_table(RECORDS)?
                    .insert(key.as_str(), bytes.as_slice())?;
            }
            tx.commit()?;
            Ok(())
        })
        .await?
    }

    /// Atomically reserve a request/payment ID; persisted before any external side effect.
    pub async fn reserve<T: Serialize>(&self, key: String, value: &T) -> Result<bool> {
        let db = self.0.clone();
        let bytes = serde_json::to_vec(value)?;
        tokio::task::spawn_blocking(move || -> Result<bool> {
            let tx = db.begin_write()?;
            {
                let mut table = tx.open_table(RECORDS)?;
                if table.get(key.as_str())?.is_some() {
                    return Ok(false);
                }
                table.insert(key.as_str(), bytes.as_slice())?;
            }
            tx.commit()?;
            Ok(true)
        })
        .await?
    }

    /// On restart, make interrupted jobs explicit without rebroadcasting or recharging.
    pub async fn mark_interrupted_jobs(&self) -> Result<usize> {
        let db = self.0.clone();
        tokio::task::spawn_blocking(move || -> Result<usize> {
            let tx = db.begin_write()?;
            let mut updates = Vec::new();
            {
                let mut table = tx.open_table(RECORDS)?;
                for entry in table.iter()? {
                    let (key,value) = entry?;
                    if !key.value().starts_with("job:") { continue; }
                    let mut job: serde_json::Value = serde_json::from_slice(value.value())?;
                    let status = job["status"].as_str().unwrap_or("").to_owned();
                    if matches!(status.as_str(),"accepted"|"settlement_pending") {
                        job["error"] = serde_json::json!(format!("daemon restarted during {status}; reconcile persisted broadcast intents, transaction receipts and payment before resolving"));
                        job["status"] = serde_json::json!("reconciliation_required");
                        updates.push((key.value().to_owned(),serde_json::to_vec(&job)?));
                    }
                }
                for (key,value) in &updates { table.insert(key.as_str(),value.as_slice())?; }
            }
            tx.commit()?;
            Ok(updates.len())
        }).await?
    }

    /// Reserve payment, job and signed material in one transaction. Any conflict leaves
    /// every new record untouched, so a losing concurrent request cannot burn a voucher.
    pub async fn reserve_all(&self, records: Vec<(String, serde_json::Value)>) -> Result<bool> {
        let db = self.0.clone();
        let records: Vec<(String, Vec<u8>)> = records
            .into_iter()
            .map(|(key, value)| Ok((key, serde_json::to_vec(&value)?)))
            .collect::<Result<_>>()?;
        tokio::task::spawn_blocking(move || -> Result<bool> {
            let tx = db.begin_write()?;
            {
                let mut table = tx.open_table(RECORDS)?;
                for (key, _) in &records {
                    if table.get(key.as_str())?.is_some() {
                        return Ok(false);
                    }
                }
                for (key, value) in &records {
                    table.insert(key.as_str(), value.as_slice())?;
                }
            }
            tx.commit()?;
            Ok(true)
        })
        .await?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_database_parent_is_actionable_and_not_created() {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path().join("unmounted-volume");
        let error = Store::open(parent.join("state.redb"))
            .err()
            .unwrap()
            .to_string();
        assert!(error.contains("DATABASE_PATH parent directory is missing"));
        assert!(error.contains("persistent disk"));
        assert!(!parent.exists());
    }

    #[test]
    fn database_lock_conflict_preserves_the_existing_journal() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.redb");
        let first = Store::open(&path).unwrap();
        let error = Store::open(&path).err().unwrap().to_string();
        assert!(error.contains("DATABASE_PATH is locked"));
        drop(first);
        assert!(Store::open(&path).is_ok());
    }

    #[test]
    fn database_path_rejects_a_file_as_parent() {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path().join("not-a-directory");
        std::fs::write(&parent, b"keep these bytes").unwrap();
        let error = Store::open(parent.join("state.redb"))
            .err()
            .unwrap()
            .to_string();
        assert!(error.contains("DATABASE_PATH parent must be a directory"));
        assert_eq!(std::fs::read(parent).unwrap(), b"keep these bytes");
    }
    #[tokio::test]
    async fn interrupted_jobs_are_explicitly_quarantined_after_restart() {
        let dir = tempfile::tempdir().unwrap();
        let db = Store::open(dir.path().join("state.redb")).unwrap();
        db.put(
            "job:1".into(),
            &serde_json::json!({"status":"accepted","result":null}),
        )
        .await
        .unwrap();
        db.put(
            "job:2".into(),
            &serde_json::json!({"status":"settlement_pending","result":{"executionTx":"known"}}),
        )
        .await
        .unwrap();
        db.put("job:3".into(), &serde_json::json!({"status":"completed"}))
            .await
            .unwrap();
        assert_eq!(db.mark_interrupted_jobs().await.unwrap(), 2);
        let recovered = db
            .get::<serde_json::Value>("job:2".into())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(recovered["status"], "reconciliation_required");
        assert_eq!(recovered["result"]["executionTx"], "known");
        assert_eq!(
            db.get::<serde_json::Value>("job:3".into())
                .await
                .unwrap()
                .unwrap()["status"],
            "completed"
        );
    }

    #[tokio::test]
    async fn canonical_task_reservation_prevents_rebilling_after_new_authorization() {
        let dir = tempfile::tempdir().unwrap();
        let db = Store::open(dir.path().join("state.redb")).unwrap();
        assert!(db
            .reserve_all(vec![
                ("task:salt".into(), serde_json::json!("request:1")),
                ("job:1".into(), serde_json::json!(1)),
                ("payment:1".into(), serde_json::json!(1))
            ])
            .await
            .unwrap());
        assert!(!db
            .reserve_all(vec![
                ("task:salt".into(), serde_json::json!("request:2")),
                ("job:2".into(), serde_json::json!(2)),
                ("payment:2".into(), serde_json::json!(2))
            ])
            .await
            .unwrap());
        assert!(db.get::<u64>("payment:2".into()).await.unwrap().is_none());
        assert!(db.get::<u64>("job:2".into()).await.unwrap().is_none());
    }
    #[tokio::test]
    async fn replay_reservation_is_atomic_and_survives_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.redb");
        let db = Store::open(&path).unwrap();
        let (a, b) = tokio::join!(
            db.reserve("payment:1".into(), &1u64),
            db.reserve("payment:1".into(), &2u64)
        );
        assert_ne!(a.unwrap(), b.unwrap());
        drop(db);
        let db = Store::open(path).unwrap();
        assert!(!db.reserve("payment:1".into(), &3u64).await.unwrap());
    }

    #[tokio::test]
    async fn duplicate_job_does_not_consume_a_different_payment() {
        let dir = tempfile::tempdir().unwrap();
        let db = Store::open(dir.path().join("state.redb")).unwrap();
        assert!(db
            .reserve_all(vec![
                ("job:1".into(), serde_json::json!(1)),
                ("payment:1".into(), serde_json::json!(1))
            ])
            .await
            .unwrap());
        assert!(!db
            .reserve_all(vec![
                ("job:1".into(), serde_json::json!(2)),
                ("payment:2".into(), serde_json::json!(2))
            ])
            .await
            .unwrap());
        assert!(db.get::<u64>("payment:2".into()).await.unwrap().is_none());
    }
}
