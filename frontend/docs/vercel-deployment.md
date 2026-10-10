# Deploy the frontend on Vercel

Import `willy264/monad-astheris`, select `frontend` as the **Root Directory**, and use the **Next.js** framework with **Node.js 24.x**. Leave the output directory at the framework default. The Rust daemon is deployed separately on Render.

The committed [`vercel.json`](../vercel.json) runs installation and the production build with **pnpm 10.32.1**, matching CI and `package.json`. It overrides dashboard install/build commands. Installation uses the frozen lockfile, including the three reviewed dependency patches. Vercel's automatic pnpm selection can choose a different major version for the same lockfile format; see its [package-manager documentation](https://vercel.com/docs/package-managers). Do not remove the patches or regenerate the lockfile to bypass an installation error.

The Dynamic MetaMask connector includes `@metamask/connect-multichain@1.1.0`, whose published bundles import `debug` without declaring it. `pnpm.packageExtensions` supplies that missing runtime dependency specifically for this version. Keep this extension and its lockfile entry together: an unrelated hoisted copy can hide the error locally, while a different installation layout fails with `Can't resolve 'debug'`. Review whether an upstream release declares the dependency before removing the extension.

Configure the public contract addresses from the [verified deployment manifest](../../contracts/deployments/10143.json), the Monad RPC URLs, `DEPLOYMENT_BLOCK`, and the settings described in [`frontend/.env.example`](../.env.example). Public values beginning with `NEXT_PUBLIC_` are embedded during the build; redeploy after changing them. Set variables for **Preview** as well as **Production** when testing a pull request against live testnet data.

The Dynamic project is already the public default; [wallet setup](wallet-setup.md) explains allowed origins and passkey configuration. Leave `DEMO_ENABLED=false` until the separately hosted daemon, task signer and payment policy are ready. Hosted Envio credentials are optional server-only settings; without them the dashboard labels its RPC data source. Never add private signing keys to Vercel's frontend configuration.

For **Live demo is not available yet**, follow the [live demo setup guide](live-demo-setup.md). It includes the exact public deployment/payment values checked on October 10, the recovered Render service status and the remaining Vercel, signer and website-review requirements.

For a failed deployment, open its **Build Logs** and record the first error plus the Node/pnpm versions. A successful CI build verifies the source under CI's environment; it does not verify Vercel's environment or deployment settings. If authentication is needed to inspect logs, share only the relevant error text, never credentials. After a successful deployment, check `/api/overview`, `/api/agents?page=0`, the MCP endpoint and the three dashboard pages before marking production verified.
