# Third-party materials

Original frontend work and new guide kits are CC0-1.0. Existing logomarks are copied exactly from the pinned contract source.

The locally served **DM Sans**, **Space Grotesk**, **Fraunces** and **Space Mono** fonts come from their `@fontsource` packages; each package's full SIL Open Font License is copied beside the WOFF2 assets in `public/fonts/` and `dist/fonts/`. Outlined wordmarks use the named display face. Font licenses are not replaced by CC0.

Runtime packages are React / React DOM (MIT), wagmi (MIT), viem (MIT), TanStack Query (MIT), react-markdown (MIT) and remark-gfm (MIT), with their transitive package licenses. The exact installed versions and dependency graph are pinned in `package-lock.json`. Build tooling is not shipped as dependency archives.

The assignment's pinned Better Interface guidance (MIT / Apache-2.0) and eth-frontend-ux guidance (MIT) informed implementation and review. Their supplied license records are preserved in `docs/frontend/BETTER-INTERFACE-LICENSE.txt` and `docs/frontend/ETH-UX-LICENSE.txt`.

Protocol implementation references consulted for encoding and simulation:

- [Uniswap v4 swap routing](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/routing)
- [viem wallet client](https://viem.sh/docs/clients/wallet)

Deployment and protocol addresses come exclusively from the supplied handoff and network data, never these documentation pages.
