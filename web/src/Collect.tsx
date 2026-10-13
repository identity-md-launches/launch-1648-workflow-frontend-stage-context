import { useEffect, useRef, useState } from "react";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { decodeMetadata, scanOwned, useApp, type NFT } from "./state";
import { readableError } from "./protocol";
import {
  AddressLink,
  Amount,
  ConfirmDialog,
  FinalistPicker,
  RequireWallet,
  TxStatus,
  finalists,
  useReady,
} from "./components";

export function Collect() {
  const app = useApp();
  const ready = useReady();
  const [finalist, setFinalist] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const burn = app.snapshot?.burnAmount;
  const approved =
    burn !== undefined && app.allowance !== undefined && app.allowance >= burn;
  const canAfford =
    burn !== undefined && app.balance !== undefined && app.balance >= burn;
  const full = app.snapshot !== undefined && app.snapshot.burnMints >= 2000n;
  async function approve() {
    if (burn === undefined) return;
    await app.transact({
      key: "collect-approve",
      label: "Approve collector mint",
      ...app.runtime.contracts.LaunchToken,
      functionName: "approve",
      args: [app.runtime.contracts.BrandGenesisNFT.address, burn],
    });
  }
  async function mint() {
    if (
      await app.transact({
        key: "mint",
        label: `Collect ${finalists[finalist].name}`,
        ...app.runtime.contracts.BrandGenesisNFT,
        functionName: "mint",
        args: [finalist],
      })
    )
      setConfirm(false);
  }
  useEffect(
    () => setConfirm(false),
    [app.account.address, app.account.chainId, app.refreshId],
  );
  return (
    <>
      <div className="page-heading">
        <h1>Collect an identity.</h1>
        <p>
          Keep a piece of Edition 1. Collector mints are{" "}
          <strong>not votes</strong>.
        </p>
      </div>
      <div className="collect-layout">
        <section className="form-surface" aria-labelledby="collect-title">
          <h2 id="collect-title">Mint a Genesis NFT</h2>
          <FinalistPicker
            value={finalist}
            onChange={setFinalist}
            name="collect-finalist"
            disabled={app.pending}
          />
          <dl className="data-list">
            <div>
              <dt>Mint cost</dt>
              <dd>
                <Amount value={burn} />
              </dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>Permanently burned</dd>
            </div>
            <div>
              <dt>Your balance</dt>
              <dd>
                <Amount value={app.balance} decimals={app.snapshot?.decimals} />
              </dd>
            </div>
            <div>
              <dt>Collector mints</dt>
              <dd>
                {app.snapshot
                  ? `${app.snapshot.burnMints.toLocaleString()} / 2,000`
                  : "Loading…"}
              </dd>
            </div>
          </dl>
          <p>
            Burned VIMD cannot be recovered. This mints one NFT for your wallet
            and does not change the vote count.
          </p>
          <p className="muted">
            USD context unavailable. Ethereum network fees are additional.
          </p>
          {full ? (
            <p className="notice">All collector mints have been used.</p>
          ) : (
            <RequireWallet>
              {!canAfford ? (
                <>
                  <p className="notice">
                    {app.balance === undefined
                      ? "Loading your balance…"
                      : "You need 50,000 VIMD to collect."}
                  </p>
                  <a className="button" href="#/trade">
                    Trade IMD for VIMD ↗
                  </a>
                </>
              ) : (
                <button
                  className="button primary full"
                  disabled={
                    !ready ||
                    app.pending ||
                    burn === undefined ||
                    app.allowance === undefined
                  }
                  onClick={() => (approved ? setConfirm(true) : void approve())}
                >
                  {app.pending
                    ? app.tx?.key === "collect-approve"
                      ? "Approving mint…"
                      : "Transaction in progress…"
                    : approved
                      ? "Burn 50,000 VIMD & mint"
                      : "Approve 50,000 VIMD"}
                </button>
              )}
            </RequireWallet>
          )}
          <p className="control-note">
            {approved
              ? "Approval confirmed. Review the burn before signing."
              : "Step 1: approve the exact cost. Step 2: burn and mint."}
          </p>
          <TxStatus />
        </section>
        <aside className={`collect-art art-${finalists[finalist].id}`}>
          <img
            src={`./guides/finalist-${finalists[finalist].id}/logomark.svg`}
            alt={`${finalists[finalist].name} collector artwork`}
            width="256"
            height="256"
          />
          <div>
            <h2>{finalists[finalist].name}</h2>
            <p>Visual Identity Genesis · Edition 1</p>
            <a href={`#/guides/${finalists[finalist].id}`}>
              Read the {finalists[finalist].name} guide ↗
            </a>
          </div>
        </aside>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Burn VIMD to collect?"
        button="Burn 50,000 VIMD & mint"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void mint()}
        busy={app.pending}
      >
        <p>
          You will permanently burn <strong>50,000 VIMD</strong> and receive one{" "}
          {finalists[finalist].name} Genesis NFT. This is not a vote. You also
          pay Ethereum network fees.
        </p>
      </ConfirmDialog>
      <Portfolio />
    </>
  );
}
export function Portfolio() {
  const app = useApp();
  const ready = useReady();
  const [tokens, setTokens] = useState<NFT[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [manage, setManage] = useState<NFT>();
  const [operation, setOperation] = useState<"burn" | "transfer" | "approve">(
    "burn",
  );
  const [recipient, setRecipient] = useState("");
  const [invalid, setInvalid] = useState("");
  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    abort.current?.abort();
    setTokens([]);
    setComplete(false);
    setScanning(false);
    setManage(undefined);
    setError("");
    return () => abort.current?.abort();
  }, [app.account.address, app.account.chainId, app.refreshId]);
  async function loadNFTs() {
    if (!app.account.address || !app.snapshot) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setScanning(true);
    setProgress(0);
    setComplete(false);
    setError("");
    setTokens([]);
    try {
      const { address, abi } = app.runtime.contracts.BrandGenesisNFT;
      const ids = await scanOwned(
        app.runtime,
        app.account.address,
        address,
        abi,
        1,
        Number(app.snapshot.totalMinted),
        (n) => {
          if (!controller.signal.aborted) setProgress(n);
        },
        controller.signal,
      );
      const found: NFT[] = [];
      for (let i = 0; i < ids.length; i += 32)
        found.push(
          ...(await Promise.all(
            ids
              .slice(i, i + 32)
              .map(async (id) =>
                decodeMetadata(
                  String(
                    await app.runtime.client.readContract({
                      address,
                      abi,
                      functionName: "tokenURI",
                      args: [id],
                    }),
                  ),
                  id,
                ),
              ),
          )),
        );
      if (!controller.signal.aborted) {
        setTokens(found);
        setComplete(true);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(readableError(e));
    } finally {
      if (!controller.signal.aborted) setScanning(false);
    }
  }
  async function manageNFT() {
    if (!manage || !app.account.address) return;
    setInvalid("");
    if (
      operation !== "burn" &&
      (!isAddress(recipient.trim()) ||
        recipient.trim().toLowerCase() === zeroAddress)
    ) {
      setInvalid("Enter a valid, nonzero Ethereum address.");
      return;
    }
    const target = recipient.trim() as Address;
    const functionName =
      operation === "burn"
        ? "burn"
        : operation === "transfer"
          ? "safeTransferFrom"
          : "approve";
    const args =
      operation === "burn"
        ? [manage.id]
        : operation === "transfer"
          ? [app.account.address, getAddress(target), manage.id]
          : [getAddress(target), manage.id];
    if (
      await app.transact({
        key: "manage-nft",
        label:
          operation === "burn"
            ? "Burn NFT"
            : operation === "transfer"
              ? "Transfer NFT"
              : "Approve NFT operator",
        ...app.runtime.contracts.BrandGenesisNFT,
        functionName,
        args,
      })
    )
      setManage(undefined);
  }
  return (
    <section className="portfolio" aria-labelledby="portfolio-title">
      <div className="section-heading">
        <div>
          <h2 id="portfolio-title">Your Genesis collection</h2>
          <p>Art and attributes loaded from each NFT’s tokenURI.</p>
        </div>
        <RequireWallet>
          <button
            className="button"
            disabled={!ready || scanning || app.pending}
            onClick={() => void loadNFTs()}
          >
            {scanning
              ? `Reading NFTs… ${progress} / ${app.snapshot?.totalMinted ?? "…"}`
              : complete
                ? "Refresh NFTs"
                : "Load my NFTs"}
          </button>
        </RequireWallet>
      </div>
      <p className="error-text" role="alert">
        {error}
      </p>
      {complete && tokens.length === 0 && (
        <p>
          No Genesis NFTs found in this wallet. Vote with an eligible seat or
          collect a finalist to mint one.
        </p>
      )}
      <div className="nft-grid">
        {tokens.map((token) => (
          <article className="nft" key={String(token.id)}>
            <img src={token.image} alt={token.name} width="160" height="160" />
            <h3>{token.name}</h3>
            <dl>
              {token.attributes.map((a) => (
                <div key={a.trait_type}>
                  <dt>{a.trait_type}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
            <button
              className="button"
              disabled={app.pending}
              onClick={() => {
                setManage(token);
                setOperation("burn");
                setRecipient("");
                setInvalid("");
              }}
            >
              Manage NFT #{String(token.id)}
            </button>
          </article>
        ))}
      </div>
      <ConfirmDialog
        open={!!manage}
        title={`Manage Genesis #${manage?.id ?? ""}`}
        button={
          operation === "burn"
            ? "Permanently burn NFT"
            : operation === "transfer"
              ? "Transfer NFT"
              : "Approve this NFT"
        }
        onCancel={() => setManage(undefined)}
        onConfirm={() => void manageNFT()}
        busy={app.pending}
      >
        <label htmlFor="nft-operation">Action</label>
        <select
          id="nft-operation"
          value={operation}
          onChange={(e) => setOperation(e.target.value as typeof operation)}
          disabled={app.pending}
        >
          <option value="burn">Burn NFT</option>
          <option value="transfer">Transfer NFT</option>
          <option value="approve">Approve a single NFT operator</option>
        </select>
        {operation === "burn" ? (
          <p>
            Permanently destroy this NFT. No VIMD is returned. Its vote and the
            seat’s used status stay unchanged.
          </p>
        ) : (
          <>
            <p>
              {operation === "transfer"
                ? "The recipient will own this NFT. This does not transfer the seat or change its vote."
                : "This address will be allowed to transfer or burn this NFT. Only approve an address you trust."}
            </p>
            <label htmlFor="nft-recipient">
              {operation === "transfer"
                ? "Recipient address"
                : "Operator address"}
            </label>
            <input
              id="nft-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!invalid}
              aria-describedby="recipient-error"
              disabled={app.pending}
            />
            {isAddress(recipient) && <AddressLink address={recipient} />}
            <p id="recipient-error" className="error-text" role="alert">
              {invalid}
            </p>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
