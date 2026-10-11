# Silent sponsor demonstrations

Packaged October 12, 2026 (Africa/Lagos). The folder retains the original audit date; each recording and evidence file includes its actual UTC timestamp.

| Video | Length | What it demonstrates |
| --- | --- | --- |
| [Envio demo](envio-demo.mp4) | 1:36.21 | Production task history, the scrollable shard map, selected task commitments, Merkle matches, the directory, HyperIndex handler, actual GraphQL data and independent chain verification |
| [Dynamic demo](dynamic-demo.mp4) | 1:09 | The production Dynamic login options, Aetheris delegation interface, shared provider, task/payment signing implementation and existing indexed receipts |

Both files are H.264 MP4, 1440 x 1000, 24 fps, with explanatory captions and **no audio track**. They meet the screenshot's two-minute limit. Full-file decoding completed without errors; representative frames were visually inspected for readable captions and real page content. Recording manifests contain timestamps, scene descriptions, dimensions, durations and SHA-256 hashes.

These are recordings of the public production site, with cuts between scenes and explicitly labeled source/evidence cards. The Envio clip includes the deployed sticky navbar and bounded shard map. No authentication success, passkey ceremony, payment, task execution or new blockchain transaction was fabricated. The Dynamic clip demonstrates the real UI and implementation; **it does not demonstrate a freshly authenticated signing session**. Its final card states this limitation and the existing paid-service readiness issue.

## Upload and paste the links

**Neither video is hosted on Loom or Vimeo yet.** No authenticated upload connection is available in this workspace. The MP4 files are ready for the account holder to upload; the portal needs the resulting HTTPS video links, not these repository/file paths.

1. In Vimeo, select **New > Upload**, then choose the appropriate MP4. Vimeo documents uploads for all plans; account storage limits still apply.
2. Set a viewing option that lets judges open the shared link without requesting access. Choose public or an available share-link option appropriate to your plan.
3. Use the title and description below. Wait for processing, then open the copied link in a signed-out/private browser window and confirm playback.
4. Paste the Envio link into Envio's optional video field and the Dynamic link into Dynamic's optional video field.

Vimeo instructions: [Upload a video](https://help.vimeo.com/hc/en-us/articles/18774922216721-How-to-upload-a-video-to-Vimeo/). If using Loom instead, choose **New Video > Upload a video**; [video imports require an eligible paid plan](https://support.atlassian.com/loom/docs/upload-or-import-videos/). Configure [link sharing](https://support.atlassian.com/loom/docs/share-your-recording/) and verify signed-out playback. These account requirements are why a hosted URL remains a manual step; no credentials should be added to the repository.

**Envio title:** Aetheris - Envio HyperIndex on Monad Testnet

**Envio description:** Silent walkthrough of Aetheris's real indexed agent/task history. HyperIndex consumes registry and router events; GraphQL powers the directory, task lanes and Merkle commitment display. The recording includes one timestamped GraphQL record independently matched to canonical execution and commitment receipts, reconstructed root and router storage. All displayed executions are historical; this recording submits no transaction. Source and evidence: https://github.com/willy264/monad-astheris/tree/main/submission/2026-10-11/bounty-videos

**Dynamic title:** Aetheris - Dynamic authentication and wallet integration

**Dynamic description:** Silent walkthrough of the production Dynamic sign-in options, separate agent-permission interface, shared provider and actual task/payment signing implementation. Existing on-chain results are shown as historical evidence. No wallet login, physical passkey ceremony or fresh payment is performed in this recording. Current limitations are stated in the video and readiness documentation. Source: https://github.com/willy264/monad-astheris/blob/main/docs/bounty-submission-answers.md

## Evidence and scope

- [Bounty answers and selection report](../../../docs/bounty-submission-answers.md): keep Envio and Dynamic; defer/remove CRE, Privy and both Mera categories. The portal selections have not been edited.
- [Envio recording manifest](envio-recording.json) and [captured production response](envio-live-evidence.json).
- [Direct GraphQL and chain proof](envio-graphql-chain-proof.json): nine checks against the same Agent #1 shard shown in the clip, including canonical finalized receipts, execution event fields, reconstructed Merkle root and finalized router storage. It is a timestamped one-task verification, not a fresh full-history audit.
- [Dynamic recording manifest](dynamic-recording.json) and [captured production response](dynamic-live-evidence.json).
- [Production layout check](../bounty-layout-production.json): 39 checks at desktop and mobile widths. The report retains the earlier initialization-related failures and the subsequent successful recheck.

No CRE clip was produced because there is no successful official CLI simulation or DON deployment to record. No Privy/Mera qualification was invented. These sponsor-specific clips do not replace the main technical demonstration and separate pitch video fields in the [submission package](../submission-package.md).
