import { useEffect, useRef, useState } from "react";
import { seatAbi, readableError } from "./protocol";
import { scanOwned, useApp, type Seat } from "./state";
import {
  FinalistPicker,
  RequireWallet,
  TxStatus,
  finalists,
  useClock,
  useReady,
} from "./components";

export function Vote() {
  const app = useApp();
  const ready = useReady();
  const now = useClock();
  const [finalist, setFinalist] = useState(0);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selected, setSelected] = useState("");
  const [scan, setScan] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  const end = app.snapshot?.end;
  const closed =
    end !== undefined &&
    (app.snapshot!.timestamp >= end ||
      Number(app.snapshot!.timestamp) + (now - app.snapshot!.updated) / 1000 >=
        Number(end));
  useEffect(() => {
    controller.current?.abort();
    setSeats([]);
    setSelected("");
    setScanned(false);
    setScan(false);
    setError("");
    return () => controller.current?.abort();
  }, [app.account.address, app.account.chainId, app.refreshId]);
  async function findSeats() {
    if (!app.account.address || !app.snapshot) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setScan(true);
    setProgress(0);
    setError("");
    setScanned(false);
    setSeats([]);
    try {
      const owned = await scanOwned(
        app.runtime,
        app.account.address,
        app.snapshot.seats,
        seatAbi,
        0,
        1999,
        (n) => {
          if (!abort.signal.aborted) setProgress(n);
        },
        abort.signal,
      );
      const found: Seat[] = [];
      for (let i = 0; i < owned.length; i += 64) {
        const ids = owned.slice(i, i + 64);
        found.push(
          ...(await Promise.all(
            ids.map(async (id) => ({
              id,
              voted: (await app.runtime.client.readContract({
                ...app.runtime.contracts.BrandGenesisNFT,
                functionName: "seatVoted",
                args: [id],
              })) as boolean,
            })),
          )),
        );
      }
      if (abort.signal.aborted) return;
      setSeats(found);
      setSelected(found.find((s) => !s.voted)?.id.toString() ?? "");
      setScanned(true);
    } catch (e) {
      if (!abort.signal.aborted) setError(readableError(e));
    } finally {
      if (!abort.signal.aborted) setScan(false);
    }
  }
  async function vote() {
    if (!selected || closed) return;
    const success = await app.transact({
      key: "vote",
      label: `Vote for ${finalists[finalist].name}`,
      ...app.runtime.contracts.BrandGenesisNFT,
      functionName: "vote",
      args: [BigInt(selected), finalist],
    });
    if (success) {
      setSeats((items) =>
        items.map((s) =>
          s.id.toString() === selected ? { ...s, voted: true } : s,
        ),
      );
      setSelected("");
    }
  }
  return (
    <section className="vote-panel" id="vote" aria-labelledby="vote-title">
      <div className="section-heading">
        <h2 id="vote-title">
          {closed ? "Edition 1 is closed" : "Cast your seat vote"}
        </h2>
        <span className="number">01 / Vote</span>
      </div>
      {closed ? (
        <>
          <p>
            Voting has ended. Explore the community result and collect a
            finalist below.
          </p>
          <a className="button primary" href="#/collect">
            Explore collector mints <span aria-hidden="true">↗</span>
          </a>
        </>
      ) : (
        <>
          <FinalistPicker
            value={finalist}
            onChange={setFinalist}
            disabled={app.pending}
          />
          <p className="control-note">
            One seat, one vote. Your vote mints a Genesis NFT.
          </p>
          <RequireWallet>
            {!scanned ? (
              <button
                className="button primary full"
                disabled={!ready || scan || app.pending}
                onClick={() => void findSeats()}
              >
                {scan
                  ? `Finding seats… ${progress.toLocaleString()} / 2,000`
                  : "Find my seats"}
              </button>
            ) : (
              <>
                <label htmlFor="seat">Your seat</label>
                <select
                  id="seat"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  disabled={app.pending}
                >
                  <option value="">Choose an unused seat</option>
                  {seats.map((s) => (
                    <option
                      value={String(s.id)}
                      key={String(s.id)}
                      disabled={s.voted}
                    >
                      Seat #{String(s.id)} ·{" "}
                      {s.voted ? "Already voted" : "Ready to vote"}
                    </option>
                  ))}
                </select>
                {seats.length === 0 ? (
                  <p>
                    No seats found in this wallet. Anyone can use{" "}
                    <a href="#/collect">Collect</a>.
                  </p>
                ) : (
                  <p className="control-note">
                    {seats.filter((s) => !s.voted).length} available ·{" "}
                    {seats.filter((s) => s.voted).length} already voted
                  </p>
                )}
                <button
                  className="button primary full"
                  disabled={
                    !ready ||
                    !selected ||
                    app.pending ||
                    !seats.some((s) => String(s.id) === selected && !s.voted)
                  }
                  onClick={() => void vote()}
                >
                  {app.pending && app.tx?.key === "vote"
                    ? "Submitting vote…"
                    : `Vote for ${finalists[finalist].name}`}
                </button>
                <button
                  className="text-button"
                  disabled={scan || app.pending}
                  onClick={() => void findSeats()}
                >
                  Refresh all seats
                </button>
              </>
            )}
          </RequireWallet>
          {scan && (
            <progress
              aria-label="Seat scan progress"
              max={2000}
              value={progress}
            />
          )}
        </>
      )}
      <p className="error-text" role="alert">
        {error}
      </p>
      <TxStatus action="vote" />
      <div className="vote-footnote">
        <span>Seat holders decide</span>
        <a href="#/about">How voting works ↗</a>
      </div>
    </section>
  );
}
