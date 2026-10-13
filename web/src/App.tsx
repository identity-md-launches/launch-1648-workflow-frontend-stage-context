import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { useApp } from "./state";
import {
  AddressLink,
  WalletButton,
  TxStatus,
  countdown,
  finalists,
  useClock,
} from "./components";
import { Vote } from "./Vote";
import { Collect } from "./Collect";
import { Trade } from "./Trade";
import { Guides, FinalistGallery } from "./Guides";

function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("main")?.focus(),
      );
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}
export function App() {
  const app = useApp();
  const route = useRoute();
  const now = useClock();
  const state = app.snapshot;
  const closed = state ? state.timestamp >= state.end : false;
  const total = state?.votes.reduce((sum, v) => sum + v, 0n);
  const leader = state?.winner ?? state?.leader;
  const result = !state
    ? "Reading community results…"
    : total === 0n
      ? closed
        ? "No winner, no votes were cast"
        : "No votes yet"
      : closed
        ? `${finalists[state.winner!]?.name ?? "Result pending"} · Community Brand Guidelines for IMD v1.0`
        : `${finalists[leader!]?.name ?? "Result pending"} is the provisional leader`;
  useEffect(() => {
    const section = route.startsWith("/guides/")
      ? finalists.find((f) => route.endsWith(f.id))?.name
      : route === "/collect"
        ? "Collect"
        : route === "/trade"
          ? "Trade"
          : route === "/about"
            ? "About"
            : undefined;
    document.title = `${section ? section + " · " : ""}VisualIdentity.md · Edition 1`;
  }, [route]);
  return (
    <>
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.querySelector<HTMLElement>("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#/" aria-label="VisualIdentity.md home">
          <img src="./favicon.svg" alt="" width="30" height="30" />
          <span>
            VisualIdentity<span className="brand-extension">.md</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {[
            ["/", "Vote"],
            ["/guides", "Guides"],
            ["/collect", "Collect"],
            ["/trade", "Trade"],
          ].map(([href, label]) => (
            <a
              href={`#${href}`}
              key={href}
              aria-current={
                route === href ||
                (href === "/guides" && route.startsWith("/guides/"))
                  ? "page"
                  : undefined
              }
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="header-wallet">
          <WalletButton />
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {app.account.isConnected && !app.walletOK && (
          <div className="notice" role="status">
            Your wallet is on another network. Switch to{" "}
            {app.runtime.chain.name} using the button above.
          </div>
        )}
        {app.walletError && (
          <p className="error-text" role="alert">
            {app.walletError}
          </p>
        )}
        {route === "/" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <h1>
                  Choose IMD’s
                  <br />
                  next identity.
                </h1>
                <p>
                  Three visual identities. One community proposal.
                  <br className="desktop-break" /> Seat holders choose the
                  guide.
                </p>
                <div className="edition-line">
                  <span>Edition 1</span>
                  <span>Not official IMD branding</span>
                </div>
                <div className="hero-meta">
                  <span className="status-dot" aria-hidden="true" />
                  <span>
                    {state
                      ? countdown(
                          state.end,
                          Number(state.timestamp) +
                            (now - state.updated) / 1000,
                        )
                      : "Reading vote window…"}
                  </span>
                  <span>
                    {total !== undefined
                      ? `${total.toLocaleString()} seats voted`
                      : "Live on Ethereum"}
                  </span>
                </div>
              </div>
              <Vote />
            </section>
            <section
              className="finalists-section"
              aria-labelledby="finalists-title"
            >
              <div className="section-heading">
                <h2 id="finalists-title">Meet the finalists</h2>
                <p className="result-summary">{result}</p>
              </div>
              <FinalistGallery />
            </section>
            <section className="community-note">
              <h2>A proposal, freely shared.</h2>
              <div>
                <p>
                  These identities are for the IMD community to consider. The
                  team is free to adopt, change or ignore them. All original
                  artwork and guides are CC0.
                </p>
                <a href="#/about">Read the rules and risks ↗</a>
              </div>
            </section>
          </>
        ) : route === "/collect" ? (
          <Collect />
        ) : route === "/trade" ? (
          <Trade />
        ) : route.startsWith("/guides") ? (
          <Guides id={route.split("/")[2]} />
        ) : route === "/about" ? (
          <About />
        ) : (
          <div className="page-heading">
            <h1>Page not found.</h1>
            <a href="#/">Return to the vote</a>
          </div>
        )}
        {app.tx?.phase === "unknown" && <TxStatus />}
        <section className="chain-status" aria-label="Live chain status">
          <div>
            <span
              className={`status-dot ${app.readError ? "status-warning" : ""}`}
              aria-hidden="true"
            />
            <span>
              {app.readError
                ? "Live data unavailable"
                : app.verified
                  ? "Deployment verified"
                  : "Verifying deployment…"}
            </span>
            {state && (
              <span>
                Block {state.block.toLocaleString()} ·{" "}
                {Math.max(0, Math.floor((now - state.updated) / 1000))}s ago
              </span>
            )}
          </div>
          <button
            className="text-button"
            disabled={app.pending}
            onClick={() => void app.verify()}
          >
            Refresh chain data
          </button>
          {app.readError && (
            <p role="alert" className="error-text">
              {app.readError} Actions stay disabled until data refreshes.
            </p>
          )}
        </section>
      </main>
      <footer>
        <div className="footer-top">
          <a className="brand" href="#/">
            VisualIdentity.md
          </a>
          <span>Edition 1 · Ethereum</span>
          <a href="#/about">Rules & contracts ↗</a>
        </div>
        <p>
          A community proposal. No endorsement implied. Seat holders vote, not
          agents.
        </p>
        <div className="footer-bottom">
          <span>Original work CC0</span>
          <a href="./imd-deployment.json">Deployment record ↗</a>
          <a href="./site-information.md">Build & validation notes ↗</a>
        </div>
      </footer>
    </>
  );
}
function About() {
  const { runtime, snapshot } = useApp();
  const deployment = runtime.deployment;
  return (
    <>
      <div className="page-heading">
        <h1>A community decision.</h1>
        <p>
          VisualIdentity.md, Edition 1 is an independent proposal for IMD’s
          visual identity.
        </p>
      </div>
      <div className="about-layout">
        <article className="prose">
          <h2>One seat, one vote</h2>
          <p>
            identity.md seat owners can vote once for every seat they own,
            numbered 0 through 1999. Voting mints a Genesis NFT. Only the seat
            owner can call vote; delegated NFT operators cannot vote. Once a
            seat votes, it stays used even if it is sold or its Genesis NFT is
            burned.
          </p>
          <p>
            Voting ends seven days after deployment.{" "}
            {snapshot && (
              <>
                The contract’s deadline is{" "}
                <time
                  dateTime={new Date(Number(snapshot.end) * 1000).toISOString()}
                >
                  {new Date(Number(snapshot.end) * 1000).toUTCString()}
                </time>
                .
              </>
            )}{" "}
            The leader is provisional until then. Ties go to the lowest finalist
            index: A, then B, then C. With no votes, there is no winner.
          </p>
          <h2>Collecting is separate</h2>
          <p>
            Anyone can burn exactly 50,000 VIMD to mint one collector NFT, at
            any time. Collector mints never count as votes. There are up to
            2,000 vote mints and 2,000 collector mints, sharing token ids 1
            through 4,000.
          </p>
          <p>
            You can burn a Genesis NFT you own or are approved to manage. This
            returns no VIMD, changes no vote and does not reset a seat. The NFT
            has no owner-controlled settings, pause, upgrades or withdrawal
            function.
          </p>
          <h2>For the IMD team</h2>
          <p>
            All original artwork and guides are CC0. Adopt, adapt or ignore any
            part. No endorsement is implied. A community winner is a proposal,
            not a decision on behalf of IMD.
          </p>
          <h2>Risks to understand</h2>
          <ul>
            <li>
              These identities were made by AI agents. They have not been
              checked against registered trademarks.
            </li>
            <li>
              Burned VIMD is gone permanently. An NFT burn also cannot be
              undone.
            </li>
            <li>
              The deployed pool fee is{" "}
              {deployment.poolKey ? deployment.poolKey.fee / 10000 : "unknown"}
              %. The approved workflow described a 1% fee going to the paying
              wallet; the deployment handoff supersedes that percentage with
              1.25%. Fee recipient routing was not independently verified by
              this frontend.
            </li>
            <li>
              Seats are concentrated in a few hundred wallets, some holding
              dozens. Seats can be purchased before voting, and each id votes
              once.
            </li>
            <li>
              Contract-held seats may be unable to vote. This frontend connects
              browser wallets and does not provide a smart-account execution
              adapter.
            </li>
            <li>
              Future editions are not promised. Review was by the IMD review
              panel only, with no third-party audit.
            </li>
            <li>
              Swaps depend on liquidity. Token prices and network fees can
              change between a quote and confirmation.
            </li>
          </ul>
          <h2>Guide provenance</h2>
          <p>
            The pinned source supplied the three logomarks and their on-chain
            implementations. Full guide documents were absent. This website adds
            complete guide kits around those exact marks; it does not claim they
            are earlier independently authored guides.
          </p>
        </article>
        <aside className="contract-record">
          <h2>Deployed contracts</h2>
          <p>
            Addresses and ABIs are loaded from the same deployment record used
            by the application.
          </p>
          {deployment.contracts.map((c) => (
            <div className="contract-row" key={c.name}>
              <h3>{c.name}</h3>
              <AddressLink address={c.address} />
              <code>{getAddress(c.address)}</code>
              <a href={`./${c.abiPath}`} download>
                Download verified ABI ↓
              </a>
            </div>
          ))}
          {snapshot && (
            <div className="contract-row">
              <h3>Seat collection</h3>
              <AddressLink address={snapshot.seats} />
              <p>Read from BrandGenesisNFT.SEATS.</p>
            </div>
          )}
          <details>
            <summary>Release identifiers</summary>
            <dl>
              <dt>Launch</dt>
              <dd>{deployment.launchId}</dd>
              <dt>Source commit</dt>
              <dd>{deployment.sourceCommit}</dd>
              <dt>Attestation hash</dt>
              <dd>{deployment.attestationHash}</dd>
            </dl>
          </details>
          <p className="muted">
            Nonempty deployed code, chain id and contract bindings are checked
            at runtime. This is not a third-party security audit.
          </p>
        </aside>
      </div>
    </>
  );
}
