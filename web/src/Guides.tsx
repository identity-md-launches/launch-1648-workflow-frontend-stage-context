import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { finalists, Mark } from "./components";
import { useApp } from "./state";

export function Guides({ id }: { id?: string }) {
  const app = useApp();
  const selected = finalists.find((f) => f.id === id);
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setMarkdown("");
    setError("");
    if (selected)
      fetch(`./guides/finalist-${selected.id}/BRAND_GUIDELINES.md`)
        .then((res) => {
          if (!res.ok)
            throw Error("The guide could not be loaded. Reload to retry.");
          return res.text();
        })
        .then((text) => {
          if (active) setMarkdown(text);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selected]);
  if (!selected)
    return (
      <>
        <div className="page-heading">
          <h1>Three ways to belong.</h1>
          <p>Explore the ideas, systems and assets behind each proposal.</p>
        </div>
        <FinalistGallery guides />
      </>
    );
  const base = `./guides/finalist-${selected.id}/`;
  const winner = app.snapshot?.winner === finalists.indexOf(selected);
  const downloads = [
    ["logomark.svg", "Logomark SVG"],
    ["wordmark.svg", "Outlined wordmark"],
    ["lockup.svg", "Horizontal lockup"],
    ["logomark-mono.svg", "One-color SVG"],
    ["logomark-reversed.svg", "Reversed SVG"],
    ["logomark-512.png", "512 px PNG"],
    ["favicon.ico", "Favicon"],
    ["colors.json", "Colors JSON"],
    ["tokens.css", "CSS tokens"],
    ["identity.json", "Identity JSON"],
    ["BRAND_GUIDELINES.md", "Markdown guide"],
  ];
  return (
    <>
      <a className="back-link" href="#/guides">
        ← All finalists
      </a>
      <div className={`guide-hero art-${selected.id}`}>
        <div>
          <h1>{selected.name}</h1>
          <p>{selected.concept}</p>
          <p>
            {winner
              ? "Community Brand Guidelines for IMD v1.0"
              : `Finalist ${selected.id.toUpperCase()} · Edition 1`}
          </p>
        </div>
        <Mark id={selected.id} />
      </div>
      <div className="guide-layout">
        <article
          className={`guide-content guide-${selected.id}`}
          aria-label={`${selected.name} brand guidelines`}
        >
          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : !markdown ? (
            <p role="status">Loading the guide…</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h2>{children} brand guidelines</h2>,
                h2: ({ children }) => <h2>{children}</h2>,
                h3: ({ children }) => <h3>{children}</h3>,
                img: ({ src, alt }) => (
                  <img
                    src={src?.startsWith("http") ? undefined : `${base}${src}`}
                    alt={alt ?? ""}
                    loading="lazy"
                  />
                ),
              }}
            >
              {markdown}
            </ReactMarkdown>
          )}
        </article>
        <aside className="guide-downloads">
          <h2>Make it your own.</h2>
          <p>Original assets. Local files. Free to use under CC0.</p>
          <div className="download-list">
            {downloads.map(([file, label]) => (
              <a key={file} href={`${base}${file}`} download>
                {label}
                <span aria-hidden="true">↓</span>
              </a>
            ))}
          </div>
          <div className="swatches">
            {selected.colors.map((color) => (
              <div key={color}>
                <span style={{ background: color }} />
                <code>{color}</code>
              </div>
            ))}
          </div>
          <p>
            Display: {selected.font}
            <br />
            Text: DM Sans
          </p>
          <a className="button" href="#/">
            Back to the vote ↗
          </a>
        </aside>
      </div>
    </>
  );
}
export function FinalistGallery({ guides = false }: { guides?: boolean }) {
  const app = useApp();
  const state = app.snapshot;
  const total = state?.votes.reduce((sum, v) => sum + v, 0n);
  const result = state?.winner ?? state?.leader;
  return (
    <div className="finalist-gallery">
      {finalists.map((f, i) => (
        <article className={`finalist-card finalist-${f.id}`} key={f.id}>
          <a
            className={`artboard art-${f.id}`}
            href={`#/guides/${f.id}`}
            aria-label={`Explore ${f.name} brand guidelines`}
          >
            <span className="art-label">
              {f.id.toUpperCase()}
              <span> / 03</span>
            </span>
            <Mark id={f.id} />
            <span className="art-caption">{f.concept}</span>
            <span className="art-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
          <div className="card-heading">
            <h3>{f.name}</h3>
            {!guides && (
              <span className="vote-count">
                {state
                  ? `${state.votes[i].toLocaleString()} votes`
                  : "Votes loading…"}
              </span>
            )}
          </div>
          <p>{f.description}</p>
          {!guides && (
            <>
              <div className="vote-meter" aria-hidden="true">
                <span
                  style={{
                    width:
                      total && total > 0n
                        ? `${Number((state!.votes[i] * 10000n) / total) / 100}%`
                        : "0%",
                  }}
                />
              </div>
              <p className="result-label">
                {state && result === i
                  ? state.winner !== null
                    ? "Community winner"
                    : "Provisional leader"
                  : "Finalist " + f.id.toUpperCase()}
              </p>
            </>
          )}
          <a className="guide-link" href={`#/guides/${f.id}`}>
            Explore {f.name} <span aria-hidden="true">↗</span>
          </a>
        </article>
      ))}
    </div>
  );
}
