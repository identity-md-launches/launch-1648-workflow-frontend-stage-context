# VisualIdentity.md frontend

An independent community proposal for IMD's visual identity. This assignment adds the website, complete downloadable guide kits, and validation evidence to the already deployed Edition 1 contracts. It neither deploys contracts nor publishes a website.

## Run and reproduce

Requires Node 22+ and npm. Keep the Git history containing source revision `7c060a691aba13496cb29487b6fac0dffeef6556`; the build reads that revision's ABI exports and compares their canonical Keccak hashes with the handoff.

```sh
npm ci --prefix web
npm --prefix web run dev
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
npm --prefix web run check:export
npm --prefix web run preview
```

The production export is **repository-root `dist/`**. Host its contents as static files. Vite uses `base: './'`; hash routes work under gateway subpaths with no rewrite server. `npm run build` emits the final manifest *after* Vite, then checks every file hash and ABI binding. Never edit `dist/` by hand. After any asset change, rebuild before committing. The publisher consumes the committed export without rebuilding.

The build itself performs no network calls. Installation from the lockfile was also tested with `npm ci --offline` using the worker's populated npm cache. A fresh machine needs registry access once, or its own populated cache; dependency archives, caches and node_modules are intentionally not committed. The root Foundry files and deployed sources remain untouched.

## Deployment configuration

`dist/imd-deployment.json` is the only **runtime** source for contract addresses, chain, pool key, protocol addresses, RPC URLs and ABI paths. `src/config.ts` fetches it, loads all five ABI arrays and checks each canonical Keccak hash before constructing the viem client or wagmi config. There is no second compiled address map.

`deployment/handoff.json` and `deployment/network.json` preserve the public pinned inputs for reproducible export generation after `.imd/reads/` is removed. `scripts/manifest.mjs` checks the ABIs against `git show <sourceCommit>:docs/abi/<Contract>.json`. Canonicalization recursively sorts object keys, preserves array order, serializes compact JSON and hashes UTF-8 bytes with Keccak-256 (not SHA3-256). Asset hashes are SHA-256 of final raw bytes; the inventory excludes only the manifest itself.

Source commit: `7c060a691aba13496cb29487b6fac0dffeef6556`  
Launch: `c1e47f7d-ddb1-43d6-9f94-df75cedf728f`  
Chain: Ethereum, `1`  
Attestation: `aaba9c763c7dcc960287585854ec7e1efe4f224a2321340d54224e267bcc7e27`

| Contract | Deployed address |
| --- | --- |
| LaunchToken | `0x931fd96a22bca8e1008d18ed827d5c042932be17` |
| FinalistArtA | `0xdb9d147d629633daf8ff42b0cb47a6207349fea9` |
| FinalistArtB | `0x693667971a5d9a4bc60f5f08792d4609035c998b` |
| FinalistArtC | `0x63ebde72aeff3b67affe16f0a514a6ccce489b4d` |
| BrandGenesisNFT | `0xe603facf4677ba4b06ad6ac01f025b74b7a96c11` |

The seat collection is read from `BrandGenesisNFT.SEATS`, not maintained as another runtime map. The approved value is `0x0000ec93127baa929e58e97dd0095a2bfb38ec1d`. Art and token immutable bindings, chain id and nonempty deployed contract code are checked before actions are enabled.

## Wallet and transaction behavior

- Browser-injected wallets and EIP-6963 discovered providers use wagmi. No WalletConnect project id was supplied, so no QR connector or invented id is used.
- On an unknown-chain switch error, the app sends exactly the handoff's `walletAddChain`, then switches again. Wrong-network state disables actions.
- Reads use the public RPC list in the network block, with ordered failover, bounded retries and JSON-RPC batches. State refreshes every five seconds while visible. No secret or worker-local RPC URL is bundled.
- Seat discovery reads `ownerOf` for every id 0–1999 in bounded groups at a pinned block; then reads `seatVoted` for owned seats. A transport failure produces an incomplete-scan error, never a misleading empty-wallet result. Account changes abort and clear scans.
- NFT discovery scans ids 1–`totalMinted` and decodes each owned NFT's on-chain Base64 `tokenURI`. Burn and transfer require explicit review. Single-NFT approval is also available in the management dialog.
- Every write is simulated before requesting a wallet signature, locked through receipt confirmation, and followed by state refresh. Uncertain confirmations remain locked and offer a check-confirmation control. A replacement is checked against the intended target, calldata and value. There is no application backend or stored signing key.
- Collector approvals authorize exactly the on-chain `BURN_AMOUNT`, then a separate mint call burns 50,000 VIMD. Collector mints are never votes. Genesis NFT burns return no tokens and leave votes and seat use unchanged.
- Trading uses only the handoff pool key and network's quoter, Universal Router, StateView and Permit2. ERC-20 input first approves Permit2, then authorizes the router for the exact amount for 30 minutes. Each step re-reads allowance. Quotes expire in 60 seconds, slippage is 0.1–5%, execution deadline is five minutes, and the router receives `0x10` / `0x060c0f`. ERC-20 swaps send zero ETH value. The alternate six-field swap tuple is supported when network configuration declares it.
- Contract reverts, wallet rejection, missing code, insufficient balance, mint caps, disconnected state and expired quotes have visible feedback. Amounts use token decimals; input precision is validated without rounding. USD prices are not invented.

The deployed pool fee is **1.25%**, copied from the handoff, despite older workflow wording of 1%. The site discloses that difference. Fee recipient routing is not independently attested by this frontend. This is an immutable contest, so there is no owner setup panel or invented admin role. Generic ERC-20 transfers and liquidity management are outside this voting-and-collecting UI.

## Guide kits

The pinned source contained only `art/finalist-{a,b,c}/logomark.svg`, not complete earlier guides. The frontend adds distinct, complete guide kits around the **exact deployed marks** and clearly records this provenance. It does not claim these are missing earlier independently authored documents.

Each `public/guides/finalist-*` contains the exact mark, monochrome/reversed variants, outlined wordmark, horizontal lockup, 512 px PNG, ICO favicon, palette JSON, identity JSON, CSS tokens and complete Markdown guidelines. Large PNG assets live only in `kits/png/`, outside the static export. `scripts/assets.mjs` rebuilds all these assets using the pinned marks, installed OFL font files, opentype.js and sharp. Local WOFF2 fonts and their licenses are included in the export. Brand assets and original site code are CC0; font and package licenses retain their own terms.

## Validation

```sh
# From the repository root; keep browser binaries outside delivered source.
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node web/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" npm --prefix web run test:browser

# When the pinned probe is supplied by the assignment:
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" \
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline

# Optional read-only chain check; provide an approved public/worker RPC yourself.
node web/scripts/check-live.mjs "$VALIDATION_RPC"
```

The browser test manages its own local server in one bounded foreground process and serves the export at `/preview/`. It mocks all wallet transactions and RPC calls. It writes evidence under `docs/frontend/`. Live-read evidence names the public source and never records the worker relay.

See [validation](../docs/frontend/VALIDATION.md), [design system](../docs/DESIGN.md), and the machine-readable evidence beside them. The root `DESIGN.md` requested by general acceptance text was not written because this assignment explicitly permits only `web/**`, `dist/**` and `docs/**`; `docs/DESIGN.md` is the scoped substitute.

Unperformed checks are explicit in validation. No real-money swap, vote, approval, mint, NFT burn or transfer was broadcast. No publication, IPFS pin, named entrypoint or independent control-plane validation is claimed. Absolute Open Graph URLs must be supplied by the publisher after a domain/gateway is known; this unhosted export uses a local relative PNG.
