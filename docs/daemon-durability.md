# Retaining and recovering the daemon journal

## October 12 inbox outage and restart correction

**Rollout recorded:** release `51b1ec2dd26cb4244c6b40d804f7048ca2dfca26` is active. Render maintenance `dep-db6lua2j9qps73cv9fl0` became live at `22:33:09Z`; the former writer was deactivated, and more than two minutes elapsed before activation. The same artifact was activated as `dep-db6m1ntg1s2s739ss4s0` at `22:36:38Z`, with platform health path `/live`. At `22:37:33Z`, `/live`, `/health` and `/v1/access-requests/config` returned 200. Tasks were enabled, batching was running, and both recent and historical scan cursors were advancing. The replacement reported an empty newly created temporary journal; this rollout did not recover earlier inbox requests or payment history.

Validation for this revision: 65 Rust tests, Clippy, formatting, 195 frontend tests, TypeScript and 73 shared ABI checks passed. All four [GitHub verification jobs](https://github.com/willy264/monad-astheris/actions/runs/38316855045), including the production frontend build, passed. A synthetic browser fixture exercising the real React Query/provider flow passed 25 desktop/mobile recovery checks. It used local fixture authentication and did not approve a live request.

Production browser verification beginning at `22:38:52Z` passed 21 read-only checks at 1440 and 390 pixels. Both access configuration endpoints matched the deployed chain/router/registry; public request and notification views showed wallet connection without outage banners, layout overflow or runtime exceptions. Vercel confirmed the exact release, and the production JavaScript contained the new refresh notice and review guard. No live inbox authentication, access request, approval, denial or payment was submitted during verification.

The release remained live through `22:43:15Z`, over six minutes after activation. Seven health samples from `22:39:12Z` to `22:42:17Z` returned 200 with a running worker and writable journal; both cursors advanced. At `22:41:49Z`, an existing-commitment RPC read failed during the second indexer reconciliation cycle. The new bounded retry recovered about 2.5 seconds later and reconciliation continued; no worker stop or restart was observed. This is a bounded observation, not an uptime guarantee.

At 21:59-22:03 UTC, Render logs showed a repeating sequence: the batch worker stopped, `/health` returned 503, Render shut down the instance, and the replacement created an empty temporary journal. The service used `/health` for its platform restart decision. This made a batch failure interrupt access requests and reset inbox history. The earlier wrapper discarded the underlying worker error, so its exact original cause remains unknown.

Use `/live` for Render's platform health check. It performs a committed local journal write with a three-second deadline and returns 503 on storage failure. It does not depend on the external RPC or batch worker. Continue monitoring `/health` separately: it still reports 503 for an unavailable RPC or stopped enabled worker. This prevents a batch-only failure from deliberately recycling a working inbox; it does not make the free filesystem durable. Render documents its routing and restart behavior in [HTTP health checks](https://render.com/docs/health-checks).

The worker now distinguishes read-only commitment/permission checks from uncertain publication. Transient reads before broadcast, or reads verifying an existing commitment with no locally recorded transaction, use the bounded read retry policy. Conflicting canonical state, journal errors and ambiguous broadcast/receipt outcomes still stop publication without advancing the failed checkpoint. Static stage, block/range and failure-category logs support investigation without exposing provider credentials.

After an outage, the frontend preserves cached requests but requires **Refresh inbox** before a new request or review decision. **Check availability** only checks public configuration; it does not make cached requests actionable, resume private polling, mark messages read or sign anything. If replacement erased a request, the requester must first check for an existing on-chain grant or uncertain approval, then send a fresh request if still needed. Never infer approval or denial from a disappeared inbox entry.

## Explicit free testnet deployment - October 12

The operator has chosen to keep Render free and accept temporary task/payment/inbox history. `TESTNET_EPHEMERAL_STORAGE=true` is an explicit exception for Monad Testnet x402 demonstrations; it is disabled by default. Use `DATABASE_PATH=aetheris.redb` and `DATABASE_REQUIRE_EXISTING=false`, without a mount. `/health` and `/v1/config` disclose the mode, whether the file was created or reopened, and the retention warning. The paid persistent-storage procedure below remains applicable when durable operation is required.

**Deployment recorded:** release `06fa439ab84f2f38414654124c04a7f62dee677d`, Render activation `dep-db6ij38m7kps73b5apj0`, became live at `2026-10-12T18:41:46Z`. The maintenance instance was verified before activation, and the prior signer deployment was deactivated. At `18:43:26Z`, [health](https://monad-astheris-daemon.onrender.com/health), backend/public access configuration and the frontend demo configuration returned HTTP 200. Health reported task admission enabled, batching running, a writable `ephemeral-testnet` journal and `startupState: created`. No old journal was exported or restored. This supersedes the old-code deployment blocker described in the historical observations below, but does not clear durable-storage acceptance. A brief empty 503 occurred immediately after activation before the successful checks.

This choice accepts that replacing the free instance may lose its local records. It does not claim an export, migration, recovered payment history or durable notifications. On-chain task shards, token payments, identity and delegations remain on-chain. Missing local records cannot reconstruct uncertain settlement outcomes; do not automatically resubmit old requests. A task salt already recorded on the router is rejected before payment verification or new dispatch when its local job is missing. Existing database corruption, configured mount checks, file locks, signature checks and interrupted-job quarantine remain enforced.

The release is rolled out in maintenance mode first (`TASK_SUBMISSION_ENABLED=false`, `BATCH_ENABLED=false`). Verify chain 10143, a writable journal reporting `ephemeral-testnet`, and the public access configuration. Wait for the previous process to retire before activating the same artifact with task submission and batching enabled. Keep one signer process and automatic deployment disabled. Free-host restarts can still erase inbox history; this deployment does not satisfy the durable-storage acceptance test below.

## Retained storage policy and earlier observations

The daemon already records task, payment, signer and Merkle state in one ACID redb database. Keep that database on a retained volume and give its signing keys to exactly one process. Moving the existing redb file to a Render persistent disk is the smallest change; replacing it with a hosted database would require a schema and concurrency migration with no benefit for the current single-instance workload.

**Production status, October 11, 2026 at 13:09 UTC: BLOCKED.** A read-only Render management query still reports plan `free`, no attached disk, and automatic deployment disabled. Local recovery tests and the new configuration guards do not establish durable production storage. No Render setting or running process was changed for this work.

## Latest service outage, October 11 at 15:20 UTC

**October 12 follow-up:** at `2026-10-12T12:23:50Z`, the same old deployment returned `/health` 200 with a running batch worker and paid submission enabled. This is a point-in-time recovery from the outage described below, not proof of durable storage or uninterrupted service. Render still reports the free plan with auto-deploy disabled. `/v1/access-requests/config` returns 404 because that deployment lacks the inbox API; the frontend proxy returns 503. Do not interpret a healthy worker as successful deployment of the access-request feature. The migration prerequisites below remain unresolved.

**Live task availability: FAIL.** Direct daemon `/health` and `/v1/config` returned empty HTTP 503 responses; the frontend `/api/demo/config` also returned 503 with `enabled: false`. The [sanitized management/log evidence](../submission/2026-10-11/final-readiness-daemon-latest.json) still identifies deployment `59b115336da2c9e5dedb79d7c17eb72d5f761a1c`, deployed at 00:50 UTC. The frontend release did not deploy the daemon.

The daemon logged `merkle_worker_failed` at 15:14:30 and 15:15:58 UTC. Render recorded a failed HTTP health check with status 503 at 15:16:48, with similar failures earlier in the day. One discovery-read retry warning preceded the first captured terminal error. The deployed wrapper discards the underlying error and logs only the static category, so the exact terminal cause is **unknown**. This evidence does not establish a cold start or exhaustion of the five-read-retry budget. Canonical-chain mismatches and uncertain publication outcomes must continue to stop the worker; they cannot be reclassified as harmless network failures without evidence.

The submission middleware on the deployed revision checks `TASK_SUBMISSION_ENABLED` separately from worker health. Health 503 is not proof that paid admission is disabled. Public Render routing was unavailable during this check; no task POST, signature, payment, restart or configuration change was attempted. The source was left unchanged for this incident.

Before recovery, the operator must establish maintenance admission and exclusive signer ownership, preserve the current journal, and inspect known request IDs, sender nonces, canonical transaction receipts, batch commitments and facilitator settlement records using read-only queries. Resolve uncertain outcomes before an approved restart or migration. Keep original records and backups; do not delete a cursor, replay reservation or broadcast intent to make startup succeed. The migration procedure below applies even if Render reports a deployment as `live`, because that label does not establish healthy execution or retained data.

## State that must survive

| Journal key family | Purpose |
| --- | --- |
| `task:`, `job:` | Canonical task identity, request ID, status, task transaction hashes and settled payment receipt. Renewing a signature must not create another paid execution. |
| `request:`, `payment-context:` | Original signed task/payment material required for investigation. Treat the entire database as sensitive. |
| `payment:` | Canonical EIP-3009 nonce/asset/payer or Graph Tally replay reservation. |
| `settlement-intent:` | Boundary written before asking the facilitator to settle. An intent without a durable receipt is an uncertain outcome, not permission to charge again. Older journal versions have no such marker; absence in an older record does not prove settlement was never attempted. |
| Transaction hashes, `:broadcast-intent`, `relayer:*:broadcast-state` | Nonce, calldata commitment and known hash or ambiguous broadcast state. |
| `batch:`, `merkle:`, Merkle cursors/progress | Batch transaction hashes, previously verified batch records and completed scan positions. |
| `access:` | Access requests, inbox decisions, read state and approval preparation. |

Job, task identity, payment replay key and signed input reservations are atomic. All writes use redb's immediate durability; state is committed before the corresponding external side effect. A process and OS file lock prevent two daemons from opening the same file. Per-relayer mutexes serialize task, batch and access-grant transactions within that process. These locks cannot protect the same key used on another host or in a browser.

## Required deployment configuration

Keep the existing Rust build/start commands in [daemon/README.md](../daemon/README.md). In the Render service configure:

```dotenv
DATABASE_PATH=/var/data/aetheris.redb
DATABASE_MOUNT_PATH=/var/data
DATABASE_REQUIRE_EXISTING=true
```

`DATABASE_MOUNT_PATH` must be an actual non-root Linux mount. The daemon checks `/proc/self/mountinfo` and rejects an ordinary empty directory, an unavailable mount, or a journal resolving outside it. Render requires both the mounted directory and an existing journal; startup cannot silently replace a missing file. Existing journal formats remain readable. Outside Render, local development can omit the mount setting and create a new journal, but retained environments should still set `DATABASE_REQUIRE_EXISTING=true`.

`GET /live` and `GET /health` perform a committed journal write probe and return 503 on failure/timeout. Configure the platform restart probe as `/live`; reserve `/health` for full dependency/worker monitoring. `journal.writable` describes that probe; `journal.mountVerified` describes the OS mount check, not a guarantee about the provider's storage hardware. `journal.startupRecovery` and the startup log report aggregate recovered record counts without returning signed material. A full disk or corrupt journal must stop work; never resolve it by deleting replay records.

Render supports disks only on paid services. A disk is available to one instance at runtime, and disk-backed deployments stop the previous instance before starting the replacement. Adding a disk itself triggers deployment: export and preserve the current journal first. See [Render disk documentation](https://render.com/docs/disks). The current public pricing lists entry compute at approximately **$7/month** plus **$0.25/GB/month** for disk; a 1 GB starting disk is about **$7.25/month** before other usage, taxes or workspace charges. Confirm the actual checkout price before purchasing. See [Render pricing](https://render.com/pricing).

Start with 1 GB only if the current journal and backup comfortably fit. Monitor actual file size and provider disk usage; alert at 70% and stop new work before exhaustion. Do not estimate capacity from task count alone: requests, access-message copies and journal page allocation vary. Increase capacity ahead of demand. Redb is the only added storage dependency; no hosted-database credentials or schema migration are needed.

## Migration and backup procedure

This procedure changes a running paid service and incurs hosting costs. The operator must schedule and approve the maintenance window. Do not restart the current ephemeral instance just to attach a disk before its journal has been preserved.

1. Confirm which live revision and `DATABASE_PATH` own the current journal. Capture public `/health` and known request IDs. Arrange a host-supported export method that can preserve the current container's file. Free Render does not provide the normal paid shell workflow; if no safe export is available, obtain a provider-assisted export before changing the plan or deploying. Do not call an empty replacement a migration.
2. Stop admission of new paid tasks and new access grants, stop batch publication, drain workers and establish exclusive signer ownership. The new daemon uses `TASK_SUBMISSION_ENABLED=false` to block both tasks and access-grant preparation/broadcast; use `BATCH_ENABLED=false` too. On an old revision this access-grant guard is absent, so block that endpoint at the service boundary or fully stop the old writer before handoff.
3. With the database closed and the container/file retained, copy the entire database to encrypted operator-controlled storage. Record a SHA-256 checksum, file size, timestamp, source revision and aggregate record counts. Do not put the database or signed records in GitHub/submission evidence. A file copied while redb is writing is not the supported backup procedure.
4. Attach the paid disk, restore the exact retained file to `/var/data/aetheris.redb` with owner-only access, and retain the untouched source backup. Keep both submission and batching disabled. Set the three database variables above and deploy the tested revision. If data cannot be exported or is already lost, halt migration and reconcile the missing history from on-chain receipts plus facilitator records; do not bypass the startup protection.
5. Compare startup recovery counts, known completed task/status/payment receipts, batch roots and scan positions with the source snapshot. Unknown transaction and settlement outcomes must be reconciled before permitting new work. Verify that only this process uses the relayer keys.
6. Rehearse a restart in maintenance mode; read the same records again and verify no extra facilitator settlement or transaction broadcast. Save sanitized health/log outputs and the revision. Only then enable paid submission and batching, subject to the separate site-security clearance and approved live test procedure.

Once on durable storage, take a cold application backup during each planned maintenance window and before deployment. Encrypt it, keep at least seven dated copies off-host, and test restoration to an isolated environment with no signing or external payment access. Never restore an old backup directly into a writer: later payments and relayer nonces may have progressed, so the restored journal must first be reconciled against chain/facilitator history. Provider disk snapshots are supplementary; the application backup and reconciliation are the recovery source.

## Interrupted work

On startup, `accepted` and `settlement_pending` jobs become `reconciliation_required`; known results and receipts stay intact. Completed jobs remain completed. Restart does not replay a task, settle a payment, or submit an uncertain transaction.

| Boundary | Safe recovery |
| --- | --- |
| Atomic reservation failed | No job/payment was accepted and no task side effect may proceed. Restore storage before retrying. |
| Job reserved; no broadcast intent | Inspect signed intent/deadline and current authority. Do not automatically replay an old request. |
| Broadcast intent exists, hash unknown | Treat submission as ambiguous. Locate the sender's recorded nonce on-chain and compare destination/calldata; check pending state. Do not reuse that nonce or clear its record because an RPC timed out. |
| Known transaction hash | Check canonical receipt, status, confirmations and exact task/batch/grant event before resolving. A reverted transaction consumed its nonce; it does not prove successful work. |
| Confirmed task; no settlement receipt | Keep execution readable. Check the settlement intent, exact EIP-3009 authorization nonce, token Transfer/AuthorizationUsed events and facilitator history. A missing HTTP response may hide a successful payment. |
| Completed task/payment | Return the retained receipt. Never settle again on reload/recovery. |
| Already committed batch | Reconstruct canonical task logs and compare finalized router commitment. Existing matching commitments are recognized without rebroadcast, even if a local transaction hash is missing. |

There is no general administrative endpoint that silently changes ambiguous paid jobs to completed. Manual reconciliation is deliberate until a separately reviewed automated policy exists. The new settlement marker improves visibility for new jobs; it cannot recreate evidence missing from old ephemeral instances.

## Local verification and production acceptance boundary

`cargo test --locked --offline --jobs 1` includes a real binary restart test in `daemon/tests/journal_restart.rs`. It provisions an isolated journal, starts the normal daemon with `DATABASE_REQUIRE_EXISTING=true`, confirms recovered records through HTTP, abruptly terminates the process, starts it again and confirms the same data. The RPC and facilitator are local fixtures that record every call; no public RPC, wallet signature or settlement occurs. The test also verifies a missing retained journal exits before any RPC/payment initialization. Unit tests separately cover file locking, concurrent atomic reservations, malformed storage, mount validation and batch reconciliation.

This demonstrates the application's restart behavior on the local retained filesystem. It does **not** claim that a Render disk is attached, that provider backups restore successfully, or that a live uncertain payment was reconciled. Production acceptance remains blocked until the operator performs the migration and records the restart evidence above.
