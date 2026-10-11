//! ACID durable replay protection. redb runs on blocking threads, never on Tokio workers.
use anyhow::{anyhow, ensure, Context, Result};
use redb::{Database, DatabaseError, Durability, ReadableTable, TableDefinition};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{path::Path, sync::Arc};

const RECORDS: TableDefinition<&str, &[u8]> = TableDefinition::new("records");

#[derive(Clone)]
pub struct Store(Arc<Database>);

/// Aggregate recovery metadata only: never expose signed requests or payment material.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySummary {
    pub jobs: usize,
    pub completed_jobs: usize,
    pub reconciliation_jobs: usize,
    pub payment_reservations: usize,
    pub settlement_intents: usize,
    pub batches: usize,
    pub broadcast_intents: usize,
    pub unresolved_signers: usize,
    pub access_requests: usize,
}

impl Store {
    #[cfg(test)]
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::open_checked(path, false, None)
    }

    pub fn open_checked(
        path: impl AsRef<Path>,
        require_existing: bool,
        mount_path: Option<&str>,
    ) -> Result<Self> {
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
        if let Some(mount_path) = mount_path {
            validate_mount(path, Path::new(mount_path))?;
        }
        // Never create parent directories or select a fallback path: an absent durable
        // mount must not silently become an empty ephemeral payment/replay journal.
        let open = if require_existing {
            ensure!(path.is_file(), "DATABASE_REQUIRE_EXISTING is enabled but the journal is missing; restore the original journal before startup. No replacement journal was created");
            Database::open(path)
        } else {
            Database::create(path)
        };
        let db = open.map_err(|error| match error {
            DatabaseError::DatabaseAlreadyOpen => anyhow!("DATABASE_PATH is locked by another process; run one daemon instance per journal with exclusive relayer keys"),
            _ => anyhow!("DATABASE_PATH could not be opened; check file permissions, disk space and journal integrity. Preserve the existing journal for reconciliation"),
        })?;
        let mut tx = db.begin_write()?;
        tx.set_durability(Durability::Immediate);
        tx.open_table(RECORDS)?;
        tx.commit()?;
        Ok(Self(Arc::new(db)))
    }

    /// A successful read alone does not establish that payment reservations can be committed.
    pub async fn health_check(&self) -> Result<()> {
        let db = self.0.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut tx = db.begin_write()?;
            tx.set_durability(Durability::Immediate);
            {
                tx.open_table(RECORDS)?
                    .insert("health:write-probe", b"true".as_slice())?;
            }
            tx.commit()?;
            Ok(())
        })
        .await?
    }

    pub async fn recovery_summary(&self) -> Result<RecoverySummary> {
        let db = self.0.clone();
        tokio::task::spawn_blocking(move || -> Result<RecoverySummary> {
            let tx = db.begin_read()?;
            let table = tx.open_table(RECORDS)?;
            let mut counts = RecoverySummary::default();
            for entry in table.iter()? {
                let (key, bytes) = entry?;
                let key = key.value();
                if key.starts_with("job:") {
                    let value: serde_json::Value = serde_json::from_slice(bytes.value())?;
                    counts.jobs += 1;
                    counts.completed_jobs += usize::from(value["status"] == "completed");
                    counts.reconciliation_jobs +=
                        usize::from(value["status"] == "reconciliation_required");
                } else if key.starts_with("payment:") {
                    counts.payment_reservations += 1;
                } else if key.starts_with("settlement-intent:") {
                    counts.settlement_intents += 1;
                } else if key.starts_with("merkle:") {
                    counts.batches += 1;
                } else if key.starts_with("access:") && key.contains(":request:") {
                    counts.access_requests += 1;
                }
                if key.ends_with(":broadcast-intent") {
                    counts.broadcast_intents += 1;
                } else if key.starts_with("relayer:") && key.ends_with(":broadcast-state") {
                    let value: serde_json::Value = serde_json::from_slice(bytes.value())?;
                    counts.unresolved_signers += usize::from(!value.is_null());
                }
            }
            Ok(counts)
        })
        .await?
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

    /// Read a bounded, lexically ordered index without exposing unrelated records.
    pub async fn scan_prefix<T: DeserializeOwned + Send + 'static>(
        &self,
        prefix: String,
        limit: usize,
    ) -> Result<Vec<T>> {
        self.scan_prefix_after(prefix, None, limit).await
    }

    pub async fn scan_prefix_after<T: DeserializeOwned + Send + 'static>(
        &self,
        prefix: String,
        after: Option<String>,
        limit: usize,
    ) -> Result<Vec<T>> {
        let db = self.0.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<T>> {
            let tx = db.begin_read()?;
            let table = tx.open_table(RECORDS)?;
            let mut values = Vec::new();
            let start = after.as_deref().unwrap_or(&prefix);
            ensure!(
                start.starts_with(&prefix),
                "index cursor is outside its prefix"
            );
            for entry in table.range(start..)? {
                let (key, value) = entry?;
                if after.is_some() && key.value() == start {
                    continue;
                }
                if !key.value().starts_with(&prefix) || values.len() == limit {
                    break;
                }
                values
                    .push(serde_json::from_slice(value.value()).context("stored index corrupted")?);
            }
            Ok(values)
        })
        .await?
    }

    /// Compare all guards and publish all replacements in one ACID transaction.
    /// Access decisions and their inbox copies must never diverge under concurrent requests.
    pub async fn compare_and_put(
        &self,
        guards: Vec<(String, Option<serde_json::Value>)>,
        records: Vec<(String, serde_json::Value)>,
    ) -> Result<bool> {
        let db = self.0.clone();
        tokio::task::spawn_blocking(move || -> Result<bool> {
            let tx = db.begin_write()?;
            {
                let mut table = tx.open_table(RECORDS)?;
                for (key, expected) in &guards {
                    let current = table
                        .get(key.as_str())?
                        .map(|value| serde_json::from_slice::<serde_json::Value>(value.value()))
                        .transpose()?;
                    if &current != expected {
                        return Ok(false);
                    }
                }
                for (key, value) in records {
                    let bytes = serde_json::to_vec(&value)?;
                    table.insert(key.as_str(), bytes.as_slice())?;
                }
            }
            tx.commit()?;
            Ok(true)
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

fn validate_mount(database: &Path, mount: &Path) -> Result<()> {
    ensure!(
        mount.is_absolute() && mount.parent().is_some(),
        "DATABASE_MOUNT_PATH must be an absolute non-root mount path"
    );
    let canonical_mount = mount.canonicalize().map_err(|_| {
        anyhow!("DATABASE_MOUNT_PATH is unavailable; attach the persistent disk before startup")
    })?;
    ensure!(
        canonical_mount.parent().is_some(),
        "DATABASE_MOUNT_PATH cannot resolve to the filesystem root"
    );
    let parent = database
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let canonical_database = if database.exists() {
        database.canonicalize()
    } else {
        parent
            .canonicalize()
            .map(|path| path.join(database.file_name().unwrap_or_default()))
    }
    .map_err(|_| anyhow!("DATABASE_PATH cannot be resolved within the configured mount"))?;
    ensure!(
        canonical_database.starts_with(&canonical_mount),
        "DATABASE_PATH must reside inside DATABASE_MOUNT_PATH; symlink escapes are not allowed"
    );
    #[cfg(target_os = "linux")]
    {
        let mounts = std::fs::read_to_string("/proc/self/mountinfo").map_err(|_| {
            anyhow!("cannot verify DATABASE_MOUNT_PATH against the Linux mount table")
        })?;
        ensure!(
            mount_is_listed(&mounts, &canonical_mount),
            "DATABASE_MOUNT_PATH is not mounted; refusing an empty directory on ephemeral storage"
        );
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    anyhow::bail!("DATABASE_MOUNT_PATH verification requires Linux; omit it only for local development and keep DATABASE_REQUIRE_EXISTING=true on retained journals")
}

#[cfg(any(target_os = "linux", test))]
fn mount_is_listed(mountinfo: &str, expected: &Path) -> bool {
    mountinfo
        .lines()
        .filter_map(|line| line.split_whitespace().nth(4))
        .any(|field| {
            let path = field
                .replace("\\040", " ")
                .replace("\\011", "\t")
                .replace("\\012", "\n")
                .replace("\\134", "\\");
            Path::new(&path) == expected
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retained_journal_must_exist_and_cannot_be_replaced_by_empty_storage() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("missing.redb");
        let error = Store::open_checked(&path, true, None)
            .err()
            .unwrap()
            .to_string();
        assert!(error.contains("DATABASE_REQUIRE_EXISTING"));
        assert!(!path.exists());
        std::fs::write(&path, b"not a database").unwrap();
        assert!(Store::open_checked(&path, true, None).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"not a database");
    }

    #[test]
    fn mount_validation_requires_exact_mount_and_decodes_linux_escaped_paths() {
        let mounts = "21 1 8:1 / /var/data rw - ext4 /dev/disk rw\n22 1 8:2 / /var/with\\040space rw - ext4 /dev/second rw\n";
        assert!(mount_is_listed(mounts, Path::new("/var/data")));
        assert!(mount_is_listed(mounts, Path::new("/var/with space")));
        assert!(!mount_is_listed(mounts, Path::new("/var")));
        assert!(!mount_is_listed(mounts, Path::new("/var/data/child")));
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("journal.redb");
        assert!(Store::open_checked(&path, false, Some(dir.path().to_str().unwrap())).is_err());
        assert!(
            !path.exists(),
            "ordinary directories must not masquerade as durable mounts"
        );
    }

    #[tokio::test]
    async fn health_commits_probe_and_concurrent_reservation_has_exactly_one_owner() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("retained.redb");
        let store = Store::open(&path).unwrap();
        store.health_check().await.unwrap();
        let mut workers = tokio::task::JoinSet::new();
        for index in 0..16 {
            let store = store.clone();
            workers.spawn(async move {
                store
                    .reserve_all(vec![
                        ("task:shared".into(), serde_json::json!(index)),
                        (format!("payment:{index}"), serde_json::json!(index)),
                        (
                            format!("job:{index}"),
                            serde_json::json!({"status":"completed"}),
                        ),
                    ])
                    .await
                    .unwrap()
            });
        }
        let mut winners = 0;
        while let Some(result) = workers.join_next().await {
            winners += usize::from(result.unwrap());
        }
        assert_eq!(winners, 1);
        drop(store);
        let restored = Store::open_checked(path, true, None).unwrap();
        assert_eq!(
            restored
                .get::<bool>("health:write-probe".into())
                .await
                .unwrap(),
            Some(true)
        );
        let counts = restored.recovery_summary().await.unwrap();
        assert_eq!(counts.jobs, 1);
        assert_eq!(counts.completed_jobs, 1);
        assert_eq!(counts.payment_reservations, 1);
    }

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
