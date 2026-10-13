import { useEffect, useRef, useState, useId, type ReactNode } from "react";
import { formatUnits, getAddress, type Address } from "viem";
import { useApp, shortAddress } from "./state";

export const finalists = [
  {
    id: "a",
    name: "Keystone",
    concept: "A shared foundation",
    description: "Strong geometry. A common center.",
    colors: ["#1F2A6B", "#F26B4E", "#D7DCEF"],
    font: "Space Grotesk",
  },
  {
    id: "b",
    name: "Orbit",
    concept: "Independent, in connection",
    description: "An open network, with room for you.",
    colors: ["#0B3D3A", "#2EC4B6", "#F4F1DE"],
    font: "Fraunces",
  },
  {
    id: "c",
    name: "Lattice",
    concept: "Many seats, one system",
    description: "Individual contributions, clearly connected.",
    colors: ["#22223B", "#F2A900", "#CDCDE2"],
    font: "Space Mono",
  },
];
export function Mark({
  id,
  className = "",
}: {
  id: string;
  className?: string;
}) {
  return (
    <img
      className={className}
      src={`./guides/finalist-${id}/logomark.svg`}
      alt={`${finalists.find((f) => f.id === id)?.name ?? ""} logomark`}
      width="64"
      height="64"
    />
  );
}
export function Amount({
  value,
  decimals = 18,
  symbol = "VIMD",
}: {
  value?: bigint;
  decimals?: number;
  symbol?: string;
}) {
  if (value === undefined) return <span>Not loaded</span>;
  const full = formatUnits(value, decimals);
  return (
    <span className="amount" title={`${full} ${symbol}`}>
      {Number(full).toLocaleString("en-US", { maximumFractionDigits: 6 })}{" "}
      {symbol}
    </span>
  );
}
export function AddressLink({
  address,
  label,
}: {
  address: Address;
  label?: string;
}) {
  const { runtime } = useApp();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span className="address-group">
      <a
        href={`${runtime.deployment.network.explorer}/address/${getAddress(address)}`}
        target="_blank"
        rel="noreferrer"
        title={getAddress(address)}
      >
        {label ?? shortAddress(address)} <span aria-hidden="true">↗</span>
      </a>
      <button
        className="copy-button"
        aria-label={`Copy ${label ?? "address"}`}
        title={getAddress(address)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(getAddress(address));
            setCopied(true);
            setError(false);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            setError(true);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {error && (
        <small role="status">Copy this address: {getAddress(address)}</small>
      )}
    </span>
  );
}
export function WalletButton({ primary = false }: { primary?: boolean }) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  if (app.account.isConnected && app.walletOK)
    return (
      <>
        <button
          className={primary ? "button primary" : "button"}
          onClick={() => ref.current?.showModal()}
        >
          {shortAddress(app.account.address!)}
        </button>
        <WalletDialog dialogRef={ref} />
      </>
    );
  if (app.account.isConnected && !app.walletOK)
    return (
      <button
        className="button primary"
        disabled={app.connecting || app.pending}
        onClick={() => void app.switchNetwork()}
      >
        {app.connecting ? "Switching…" : `Switch to ${app.runtime.chain.name}`}
      </button>
    );
  return (
    <>
      <button
        className={primary ? "button primary" : "button"}
        disabled={app.connecting}
        onClick={() => ref.current?.showModal()}
      >
        {app.connecting ? "Connecting…" : "Connect wallet"}
      </button>
      <WalletDialog dialogRef={ref} />
    </>
  );
}
function WalletDialog({
  dialogRef,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  const app = useApp();
  const titleId = useId();
  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClick={(e) => e.stopPropagation()}
      aria-labelledby={titleId}
    >
      <div className="section-heading">
        <h2 id={titleId}>
          {app.account.isConnected ? "Connected wallet" : "Connect a wallet"}
        </h2>
        <button
          className="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close wallet dialog"
        >
          Close
        </button>
      </div>
      {app.account.address ? (
        <>
          <AddressLink address={app.account.address} />
          <p>
            Network:{" "}
            {app.account.chainId === app.runtime.chain.id
              ? app.runtime.chain.name
              : `chain ${app.account.chainId}`}
          </p>
          <button
            className="button"
            disabled={app.pending}
            onClick={() => {
              app.disconnect();
              dialogRef.current?.close();
            }}
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p>Use an Ethereum browser wallet. You control every signature.</p>
          <div className="wallet-options">
            {app.connectors.map((connector) => (
              <button
                className="button"
                disabled={app.connecting}
                key={connector.uid}
                onClick={async () => {
                  await app.connectWallet(connector);
                }}
              >
                {app.connecting
                  ? "Connecting…"
                  : `Connect ${connector.name === "Injected" ? "browser wallet" : connector.name}`}
              </button>
            ))}
          </div>
          <p className="muted">
            No wallet? Install a browser wallet or open this site in your
            wallet’s browser, then reload.
          </p>
        </>
      )}
      <p role="alert" className="error-text">
        {app.walletError}
      </p>
    </dialog>
  );
}
export function RequireWallet({ children }: { children: ReactNode }) {
  const app = useApp();
  if (app.account.isConnected && !app.walletOK)
    return (
      <p className="control-note">Switch networks using the button above.</p>
    );
  if (!app.walletOK) return <WalletButton primary />;
  return <>{children}</>;
}
export function TxStatus({ action }: { action?: string }) {
  const { tx, runtime, checkConfirmation, checkingConfirmation } = useApp();
  const relevant = tx && (!action || tx.key === action);
  return (
    <div
      className="tx-status"
      role={relevant && tx.phase === "error" ? "alert" : "status"}
    >
      {relevant && (
        <>
          <p className={tx.phase === "error" ? "error-text" : ""}>
            {tx.message}
          </p>
          {tx.hash && (
            <a
              href={`${runtime.deployment.network.explorer}/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          )}
          {tx.phase === "unknown" && (
            <button
              className="button"
              disabled={checkingConfirmation}
              onClick={() => void checkConfirmation()}
            >
              {checkingConfirmation ? "Checking…" : "Check confirmation"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function FinalistPicker({
  value,
  onChange,
  disabled = false,
  name = "finalist",
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <fieldset className="finalist-picker" disabled={disabled}>
      <legend>Choose a finalist</legend>
      <div>
        {finalists.map((f, i) => (
          <label key={f.id} className={value === i ? "selected" : ""}>
            <input
              type="radio"
              name={name}
              value={i}
              checked={value === i}
              onChange={() => onChange(i)}
            />
            <Mark id={f.id} />
            <span>{f.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
export function useReady() {
  const app = useApp();
  const now = useClock();
  return (
    app.verified &&
    !!app.snapshot &&
    !app.readError &&
    now - app.snapshot.updated < 20000
  );
}
export function countdown(end: bigint, timestamp: number) {
  const left = Math.max(0, Number(end) - timestamp);
  if (left <= 0) return "Voting closed";
  const days = Math.floor(left / 86400),
    hours = Math.floor((left % 86400) / 3600),
    minutes = Math.floor((left % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m left`;
}
export function ConfirmDialog({
  open,
  title,
  children,
  onCancel,
  onConfirm,
  busy,
  button,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  button: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="button-row">
        <button className="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="button danger" disabled={busy} onClick={onConfirm}>
          {busy ? "Processing…" : button}
        </button>
      </div>
      <TxStatus />
    </dialog>
  );
}
