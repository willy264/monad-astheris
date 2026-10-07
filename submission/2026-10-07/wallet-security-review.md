# Wallet website classification: review pending

Observed October 7, 2026 from user-provided MetaMask screenshots. No support report has been submitted and no security provider has cleared the domain. Wallet connection, signing and the physical passkey demonstration should remain paused on this site while the classification is investigated.

## Confirmed observations

| Item | Observation | Limit |
| --- | --- | --- |
| Website warning | MetaMask labels `monad-astheris.vercel.app` malicious during connection and displays a phishing/wallet-draining warning. | The screenshots do not identify the underlying detection rule or provider. |
| Independent domain scan | A read-only request to MetaMask's domain-scanning API returned HTTP 200 and `recommendedAction: "BLOCK"` at 22:08 UTC. [Saved response](metamask-domain-scan.json). | This independently reproduces the classification, but the response does not disclose its cause. |
| Sign-in request | The visible request uses Monad Testnet, the `/agents` URL and the name `uiriamuzu`; estimated changes show none. | Only the visible portion of the message is available. This is not evidence that the site or every request is safe. |
| Dynamic configuration | One successful public-settings read for environment `5ee665e4-6f64-43c1-9537-99d989371a80` returned sandbox mode and `general.displayName: "uiriamuzu"`. | The unexpected name is confirmed; its role in the security classification is unknown. |
| Application source | At revision `c4d73a9fb7686d95af7d381eea5ccd427b448241`, the provider does not override the sign-in statement. Installed Dynamic 5.9.2 prioritizes its server display name over the app-name fallback. | Adding only a local `appName` would not replace this configured display name. |
| Public phishing list | A bounded check of MetaMask's `eth-phishing-detect` list at revision `3bd2d471` found no exact domain or blocked parent-domain match. | MetaMask uses additional security signals/providers. List absence does not clear the warning. |
| Source triage | A bounded frontend review found the expected delegation writes and explicit task/payment signatures, without handwritten seed/private-key collection or unexpected remote script injection patterns. | This is not a full dependency, deployed-bundle, account or infrastructure security audit. |

## Remediation

1. Cancel the flagged connection/signature requests. Do not use the warning override or disable protection to complete the demonstration. MetaMask's [security guidance](https://support.metamask.io/configure/wallet/security-alerts/) directs users to avoid connecting or signing when a site is classified malicious.
2. In the intended Dynamic project, select the environment matching the UUID above. Under **Settings → General**, change **Display Name** to **Aetheris**. Check the project's intended ownership/configuration before making that change. [Dynamic documents this field](https://docs.dynamic.xyz/developer-dashboard/general) as the name referenced in the SDK. This dashboard correction is pending; it does not resolve the MetaMask classification.
3. Request a manual URL-classification review using [MetaMask's official support](https://support.metamask.io/) and **Continue without wallet**. Include the screenshots and public links below. MetaMask's guidance distinguishes URL review through support from transaction-alert reporting.
4. Record the support case reference and substantive review outcome. Investigate any identified issue, verify the actual deployed build/configuration, and only then repeat the device ceremony once the security concern is resolved. A renamed project, different domain or successful build is not clearance.

## Prepared support request — not sent

Subject: Please investigate malicious website classification for monad-astheris.vercel.app

I maintain Aetheris, a Monad Testnet application. MetaMask currently labels our website `https://monad-astheris.vercel.app` malicious when connecting a wallet and displays a phishing/wallet-draining warning. Please review this URL and identify the reason or detection source so we can investigate and remediate it. We are not assuming the classification is incorrect.

- Network shown: Monad Testnet, chain ID 10143.
- Affected route: `https://monad-astheris.vercel.app/agents`.
- Source repository: <https://github.com/willy264/monad-astheris>.
- Reviewed source revision: `c4d73a9fb7686d95af7d381eea5ccd427b448241`.
- Deployment manifest: <https://github.com/willy264/monad-astheris/blob/c4d73a9fb7686d95af7d381eea5ccd427b448241/contracts/deployments/10143.json>.
- Router: <https://testnet.monadscan.com/address/0xac4a33521b32122c9f014eac8800144dd9aa5ebe>.
- Authentication provider: Dynamic; public environment ID `5ee665e4-6f64-43c1-9537-99d989371a80`.
- Configuration discrepancy: the sign-in text says `uiriamuzu`. A public settings check confirmed that name is configured in Dynamic. Correction is pending; we do not know whether this relates to the classification.
- Screenshots: attach the original malicious-site connection warning and sign-in request supplied by the project owner. Add the affected MetaMask/browser versions if available.
- Independent observation: on October 7 at 22:08 UTC, `GET https://dapp-scanning.api.cx.metamask.io/v2/scan?url=monad-astheris.vercel.app` returned HTTP 200 with `{"hostname":"monad-astheris.vercel.app","recommendedAction":"BLOCK"}`.

Wallet interaction on this domain has been paused for investigation. Please advise what further non-sensitive evidence is needed. No recovery phrases, private keys, active authentication/payment signatures or service credentials are included in this report.
