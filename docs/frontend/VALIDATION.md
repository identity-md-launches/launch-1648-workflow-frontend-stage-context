# Worker validation record

Status: **Source, static export and validation complete within the explicit frontend write scope; local commit blocked by read-only Git metadata**, with limitations below. This is the contributor's own evidence, not independent verification or an audit.

## Scope and authoritative inputs

Reviewed the production `dist/` export and React/TypeScript source under `web/`. The UI covers home/voting, guides index, three guide routes, collection, NFT management, trading and rules/contracts. It uses the pinned handoff at source revision `7c060a691aba13496cb29487b6fac0dffeef6556`, and the supplied Ethereum network block.

Changes stay in `web/**`, `dist/**` and `docs/**`, with the explicitly allowed `web/.gitignore`. Contract source, root configuration, existing ABIs and libraries were preserved. The general request for root `DESIGN.md` conflicts with the explicit write budget; the implemented design document is **`docs/DESIGN.md`** instead.

The upstream source bundle contains the three logomarks but no full prior guide documents, wordmarks or kits. This contribution supplies complete guide kits built around the exact deployed marks, and discloses the provenance in the site, guides and README. It does not claim the added guides were independently produced in earlier stages. The handoff's 1.25% pool fee takes precedence over the workflow's older 1% wording.

## Executed checks

| Check | Result / evidence |
| --- | --- |
| TypeScript | `npm --prefix web run typecheck` passes; also required by every production build. |
| Production build | `npm --prefix web run build` passes. Relative base, local fonts and hash routing; manifest generated after the final export. |
| Dependency reproducibility | `npm ci --offline --no-audit --no-fund --cache /tmp/visual-identity-npm-cache --prefix test/scratch/offline-install` passed from copied package/lock files using the populated worker cache. No cache or node_modules is delivered. |
| Focused tests | `npm --prefix web test`: **7 passing tests**. ABI hash/tamper checks; exact decimal parsing and uint128 limits; slippage; ERC-20/native and five-/six-field swap encodings; full ownership range; interrupted/cancelled scans; metadata decoding and error translation. |
| Browser interactions | `PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node web/tests/browser.mjs`: **28 passing checks**, recorded in `browser-checks.json`. Uses the production export at `/preview/`, not the development server. All RPC and wallet transaction responses are mocked. |
| Pinned design probe | `PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline`: **16/16 pass**, in `design-probe.json`. External RPC traffic is blocked for this design-only probe. |
| Deployment / ABI / asset validation | `npm --prefix web run check:export` passes: exact handoff contract set, names, addresses, identifiers, ABI canonical Keccak hashes, unchanged network/walletAddChain/poolKey, relative paths, complete SHA-256 inventory, asset count and size limits. |
| Live reads | `scripts/check-live.mjs` used the approved worker relay; `live-read-check.json` names the supplied public Ethereum source as required. Chain id 1; nonempty code for all five deployed contracts and six protocol contracts; correct immutable token/art bindings; all three on-chain marks equal the source/export bytes. |
| Live pool observability | StateView reports initialized price, nonzero active liquidity and 12,500 LP fee units (1.25%). Paired token returns IMD / 18 decimals. A quoter `eth_call` for 1 IMD succeeded. No signing or transaction submission was used. |
| Static hosting | Production files were served from a subpath. All guide downloads returned nonempty local bytes. No browser script errors or missing local resources were observed. |

The live snapshot is pinned in its JSON evidence: block 26,186,384, with its hash and timestamp. It is an observation at that block, not a promise of future liquidity or results. Vote counts and NFT counts were zero at that snapshot; interactive screenshots use clearly documented mocked data to exercise richer states.

Build warnings are limited to third-party pure-annotation removal and a roughly 815 kB uncompressed main JavaScript chunk (about 250 kB gzip). npm reports an older transitive React peer range and deprecated optional connector dependencies; the chosen injected connector and tested bundle work. Asset checks also verify the 90 repository-only PNGs, ICO headers, 512 px downloads, palettes, path-only SVGs and exact public-source/export bytes. The main export is approximately 1.1 MB and well within the 8 MiB site limit. There is no vendored npm registry.

## Interaction coverage

The browser suite checks the 390 px first screen, disconnected/missing-wallet errors, accessible home semantics, all eight routes at 320/390/768/1440, guide downloads, 200% text enlargement, exact unknown-chain add/switch parameters, and complete seat enumeration including ids 0 and 1999.

Transaction cases cover rejected votes, simulation reverts preventing signing, successful selected-seat/finalist voting, exact collector approvals locked through confirmation, mint review/cancellation, collector mint with unchanged votes, tokenURI rendering, NFT burn with preserved votes/seat state, recipient validation and safe NFT transfer, single-NFT operator approval, uncertain confirmation recovery without a second send, both exact Permit2 approvals, router execution with zero ETH for ERC-20 input, reverse quoting, quote expiry, excess precision, account changes, insufficient balances, exhausted caps, a maximum uint256 displayed balance, closed zero-vote and nonzero-vote outcomes, and missing deployed code.

For transactions, mocked wallet requests are decoded and asserted against the actual exported configuration. Tests never use the test wallet address as a runtime deployment value. Success tests wait for a receipt and subsequent reads; no real mainnet funds or transactions were used.

## Better Interface review: six domains

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | Checked | Native radio groups, labels, buttons, select, dialog and landmarks; skip link; route focus; persistent errors/status; unique dialog labels. Keyboard-focused finalist state inspected in `keyboard-focus.png`. axe detected no A/AA violations on home. Native screen-reader sessions and every dialog state with assistive technology were not performed. |
| Layout | Checked | All eight routes at 320, 390, 768 and 1440; no document-level horizontal overflow. Main action is visible at 390 × 844. Maximum uint256 balance fits at 320; full addresses wrap on the contracts page. Text enlargement to 200% was tested; browser-native zoom and physical devices were not. |
| Writing | Checked | Explicit separation of vote versus paid collector mint; provisional leader and final/no-winner labels; readable recovery for rejection and RPC failure; no invented prices, official endorsement or audit. Consequences appear before irreversible writes. |
| Typography | Checked | Local font loads with zero failed local resources; at most five rendered sizes on the home probe, two font families and three weights. Short headings, body measure, tabular counts and readable input sizes. Guide display faces remain specific to their identity sections. |
| Colors | Checked | All measured solid text pairs meet 4.5:1 normal / 3:1 large. Measured examples from the probe: headline on page 13.22:1; control note on white 6.76:1; white on primary button 6.39:1. Artwork is assessed as artwork, not a substitute for labels. Only the implemented light theme was reviewed. |
| UI | Checked | Hover/focus/selected/disabled, loading/progress, empty/error, pending and confirmation states. Native dialogs handle modal background and focus. No page-load motion, no `transition: all`, no infinite animation under reduced motion; no shadows plus borders or nested cards. Slow-motion animation-panel review is not applicable to the short optional hover/press transitions and was not performed. |

The supplied browser connector returned `Transport closed` even on `about:blank`. Local Playwright Chromium was installed into the excluded scratch directory and used successfully instead. Screenshots were actually generated and visually inspected. The accessibility tree and axe results are not a claim of screen-reader testing or full WCAG conformance.

## Findings corrected before delivery

| Severity | Source / reproduction | Correction and recheck |
| --- | --- | --- |
| High | `web/src/state.tsx:415` / `:441`: an unavailable confirmation after wallet submission could otherwise release the action lock without knowing the outcome. | Preserve the submitted hash and lock, show check-confirmation recovery, and validate receipt target/calldata/value. The mocked lookup failure recovered with no second send. |
| Medium | `web/src/Trade.tsx:266`: allowance reads precede signing and can leave a click window while awaiting RPC. | A synchronous step guard and visible checking state cover the reads; every step re-reads allowances and uses the exact input amount. Swap tests pass. |
| Medium | `web/src/components.tsx:153` / `:345`: multiple dialog instances need distinct accessible title ids. | React `useId` labels each native dialog. Home axe and dialog interactions pass. |
| Medium | `web/src/Vote.tsx:13` and `web/src/App.tsx`: vote-end presentation must follow chain time rather than an independently skewed device date. | Derive display countdown from the latest block timestamp plus elapsed time. Writes still require fresh reads and successful on-chain simulation. Closed-window cases pass. |
| Medium | `web/src/Vote.tsx:40` / `web/src/state.tsx:175`: ownership errors must not become a false empty-seat result. | Only contract reverts are treated as absent ids; transport errors abort the scan with a retry message. Tests cover complete ranges, interruption and cancellation. |
| Medium | `web/scripts/assets.mjs:121`: the first contact sheet showed Keystone’s cross blending into the one-color center. | Corrected the monochrome and reversed color assignment to retain the cross without changing geometry or the original deployed mark. Regenerated the source-only raster kit and export, then visually rechecked the contact sheet. |
| Low | Earlier guide kit files are absent from the supplied source. | Added complete scoped kits and clear provenance; exact on-chain/source marks are retained. Download and live-byte checks pass. |

No observed first-screen, overflow or repeated contrast defect remains in the reviewed states. The root design-document location is a scope exception, not a claim that the root file exists.

## Evidence files

- `browser-checks.json`: final mocked browser suite, viewports, checks and zero script/local-resource failures.
- `design-probe.json`: compact final pinned probe results.
- `live-read-check.json`: actual chain reads and read-only quote at the recorded block.
- `home-390.png`, `home-1440.png`: final production layout with mocked chain state.
- `guide-390.png`: the Orbit guide route and downloads at mobile width.
- `keyboard-focus.png`: visible focus on the finalist radio after keyboard navigation.
- `asset-contact-sheet.png`: generated asset review sheet; the repository PNG kit remains outside `dist/`.

## Limitations and unperformed checks

- `git add -A -- web dist docs` failed with `Unable to create .git/index.lock: Read-only file system`. No commit was created or claimed. All deliverable files remain in permitted paths for the network submission step. `submission-check.json` checks the prospective file tree, not a committed Git bundle.

- No live vote, approval, collector mint, NFT burn, transfer or swap was broadcast. Mocked transaction success is not a promise of mainnet execution. Gas estimates and market conditions can change.
- No independent byte-for-byte runtime audit is claimed. Runtime gating checks network id, nonempty code, canonical ABI binding and key immutable getter bindings.
- No IPFS publication, naming, immutable/named HTTP hash checks or independent verifier execution was performed. Those belong to the later publisher/control-plane stage.
- No funded browser wallet, WalletConnect mobile session, hardware wallet, smart-account adapter, native screen reader, Safari/Firefox, physical mobile device or native browser zoom was tested.
- ENS resolution is not added: no trusted registry/resolver was provided in the runtime network block. The site shows checksummed addresses with copy and explorer actions, and NFT recipient inputs accept validated Ethereum addresses. No unapproved resolver address is hard-coded.
- NFT management lists NFTs owned by the connected wallet. Direct discovery of NFTs for which the wallet is only an approved operator is not provided; the underlying contract still supports operator calls.
- Polling pauses in hidden tabs and resumes on its next five-second tick. Large seat/NFT scans are bounded but can take time on public endpoints; they run on request, not every poll. Public-provider availability, future rate limits and reorg behavior are not guaranteed.
- Absolute Open Graph URLs await a publication domain. The export includes all requested metadata and a local PNG referenced relatively, appropriate for an unknown gateway subpath.
- AI-created artwork is not a trademark clearance. The website clearly states community proposal status, permanent burn risk, seat concentration, transferable unused seats, contract-held seat limitations, uncertain future editions and the lack of a third-party audit.
