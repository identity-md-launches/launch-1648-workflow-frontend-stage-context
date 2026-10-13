import { useEffect, useRef, useState } from "react";
import {
  encodeAbiParameters,
  formatUnits,
  keccak256,
  parseAbiParameters,
  zeroAddress,
  type Address,
} from "viem";
import { useApp } from "./state";
import {
  erc20Abi,
  permit2Abi,
  quoterAbi,
  routerAbi,
  stateViewAbi,
  encodeSwap,
  minimumOut,
  parseAmount,
  poolType,
  readableError,
  slippageBps,
} from "./protocol";
import {
  Amount,
  AddressLink,
  RequireWallet,
  TxStatus,
  useClock,
  useReady,
} from "./components";

interface Quote {
  amountIn: bigint;
  amountOut: bigint;
  min: bigint;
  expires: number;
  input: Address;
  output: Address;
  account: Address;
  slippage: string;
}
interface Funds {
  balance: bigint;
  ercAllowance: bigint;
  permitAmount: bigint;
  expiration: number;
}
export function Trade() {
  const app = useApp();
  const ready = useReady();
  const now = useClock();
  const pool = app.runtime.deployment.poolKey;
  const network = app.runtime.deployment.network;
  const token = app.runtime.contracts.LaunchToken;
  const pair = pool
    ? [network.pairToken, ...(network.otherPairTokens ?? [])].find((p) =>
        [pool.currency0.toLowerCase(), pool.currency1.toLowerCase()].includes(
          p.address.toLowerCase(),
        ),
      )
    : undefined;
  const [buy, setBuy] = useState(true);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<Quote>();
  const [quoting, setQuoting] = useState(false);
  const [stepping, setStepping] = useState(false);
  const stepLock = useRef(false);
  const [funds, setFunds] = useState<Funds>();
  const [error, setError] = useState("");
  const [protocolVerified, setProtocolVerified] = useState(false);
  const [liquidity, setLiquidity] = useState<bigint>();
  const [slotFee, setSlotFee] = useState<number>();
  const version = useRef(0);
  const input = buy ? pair?.address : token.address;
  const output = buy ? token.address : pair?.address;
  const inputSymbol = buy ? pair?.symbol : (app.snapshot?.symbol ?? "VIMD");
  const outputSymbol = buy ? (app.snapshot?.symbol ?? "VIMD") : pair?.symbol;
  const inputDecimals = buy ? pair?.decimals : app.snapshot?.decimals;
  const outputDecimals = buy ? app.snapshot?.decimals : pair?.decimals;
  const fresh =
    !!quote &&
    quote.expires > now &&
    quote.input === input &&
    quote.account === app.account.address &&
    quote.slippage === slippage;
  useEffect(() => {
    version.current++;
    setQuote(undefined);
    setFunds(undefined);
    setError("");
  }, [amount, slippage, buy, app.account.address, app.account.chainId]);
  useEffect(() => {
    let active = true;
    async function verify() {
      try {
        if (!pool || !pair)
          throw Error(
            "This release does not have a vetted paired currency. Trading is unavailable.",
          );
        for (const address of [
          network.uniswapV4.quoter,
          network.uniswapV4.universalRouter,
          network.uniswapV4.permit2,
          network.uniswapV4.stateView,
          pair.address,
          pool.hooks,
        ]) {
          if (address === zeroAddress) continue;
          const code = await app.runtime.client.getCode({ address });
          if (!code || code === "0x")
            throw Error(
              "A configured pool contract has no code. Trading is disabled.",
            );
        }
        const [decimals, symbol] = await Promise.all([
          app.runtime.client.readContract({
            address: pair.address,
            abi: erc20Abi,
            functionName: "decimals",
          }),
          app.runtime.client.readContract({
            address: pair.address,
            abi: erc20Abi,
            functionName: "symbol",
          }),
        ]);
        if (Number(decimals) !== pair.decimals || symbol !== pair.symbol)
          throw Error(
            "The paired token does not match the network configuration. Trading is disabled.",
          );
        const id = keccak256(
          encodeAbiParameters(parseAbiParameters(poolType), [pool]),
        );
        const [slot, liq] = await Promise.all([
          app.runtime.client.readContract({
            address: network.uniswapV4.stateView,
            abi: stateViewAbi,
            functionName: "getSlot0",
            args: [id],
          }),
          app.runtime.client.readContract({
            address: network.uniswapV4.stateView,
            abi: stateViewAbi,
            functionName: "getLiquidity",
            args: [id],
          }),
        ]);
        if (slot[0] === 0n)
          throw Error(
            "The attested pool is not initialized. Trading is unavailable.",
          );
        if (active) {
          setProtocolVerified(true);
          setLiquidity(liq);
          setSlotFee(slot[3]);
        }
      } catch (e) {
        if (active) {
          setProtocolVerified(false);
          setError(readableError(e));
        }
      }
    }
    void verify();
    return () => {
      active = false;
    };
  }, [app.runtime, pool, pair, network]);
  async function readFunds(currency: Address, owner: Address) {
    const [balance, ercAllowance, permit] = await Promise.all([
      app.runtime.client.readContract({
        address: currency,
        abi: currency === token.address ? token.abi : erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      }),
      app.runtime.client.readContract({
        address: currency,
        abi: currency === token.address ? token.abi : erc20Abi,
        functionName: "allowance",
        args: [owner, network.uniswapV4.permit2],
      }),
      app.runtime.client.readContract({
        address: network.uniswapV4.permit2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [owner, currency, network.uniswapV4.universalRouter],
      }),
    ]);
    return {
      balance: balance as bigint,
      ercAllowance: ercAllowance as bigint,
      permitAmount: permit[0],
      expiration: Number(permit[1]),
    };
  }
  async function getQuote() {
    setError("");
    setQuote(undefined);
    setQuoting(true);
    const current = ++version.current;
    try {
      if (
        !pool ||
        !input ||
        !output ||
        inputDecimals === undefined ||
        !app.account.address ||
        !app.walletOK ||
        !protocolVerified ||
        !ready
      )
        throw Error(
          "Connect on the verified network before requesting a quote.",
        );
      const amountIn = parseAmount(amount, inputDecimals);
      const bps = slippageBps(slippage);
      const [result, allowances] = await Promise.all([
        app.runtime.client.simulateContract({
          address: network.uniswapV4.quoter,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey: pool,
              zeroForOne: input.toLowerCase() === pool.currency0.toLowerCase(),
              exactAmount: amountIn,
              hookData: "0x",
            },
          ],
          account: app.account.address,
        }),
        readFunds(input, app.account.address),
      ]);
      if (result.result[0] === 0n)
        throw Error(
          "The pool returned no output. Try a smaller amount or check liquidity.",
        );
      if (current === version.current) {
        setFunds(allowances);
        setQuote({
          amountIn,
          amountOut: result.result[0],
          min: minimumOut(result.result[0], bps),
          expires: Date.now() + 60000,
          input,
          output,
          account: app.account.address,
          slippage,
        });
      }
    } catch (e) {
      if (current === version.current) setError(readableError(e));
    } finally {
      setQuoting(false);
    }
  }
  const needsERC = !!quote && !!funds && funds.ercAllowance < quote.amountIn;
  const needsPermit =
    !!quote &&
    !!funds &&
    (funds.permitAmount < quote.amountIn ||
      funds.expiration < Math.floor(now / 1000) + 120);
  async function nextStep() {
    setError("");
    if (
      !quote ||
      !input ||
      !pool ||
      !fresh ||
      !app.account.address ||
      stepLock.current
    )
      return;
    stepLock.current = true;
    setStepping(true);
    try {
      // Re-read both allowances for every step; no optimistic local allowance updates.
      const updated = await readFunds(input, app.account.address);
      setFunds(updated);
      if (updated.balance < quote.amountIn)
        throw Error(
          `Insufficient ${inputSymbol}. Choose a smaller input amount.`,
        );
      if (quote.expires <= Date.now())
        throw Error("This quote expired. Request a fresh quote.");
      let ok = false;
      if (updated.ercAllowance < quote.amountIn)
        ok = await app.transact({
          key: "swap-token-approve",
          label: `Approve ${inputSymbol} to Permit2`,
          address: input,
          abi: input === token.address ? token.abi : erc20Abi,
          functionName: "approve",
          args: [network.uniswapV4.permit2, quote.amountIn],
        });
      else if (
        updated.permitAmount < quote.amountIn ||
        updated.expiration < Math.floor(Date.now() / 1000) + 120
      )
        ok = await app.transact({
          key: "swap-permit",
          label: "Authorize router spending",
          address: network.uniswapV4.permit2,
          abi: permit2Abi,
          functionName: "approve",
          args: [
            input,
            network.uniswapV4.universalRouter,
            quote.amountIn,
            Math.floor(Date.now() / 1000) + 1800,
          ],
        });
      else {
        const swap = encodeSwap(
          pool,
          input,
          quote.amountIn,
          quote.min,
          BigInt(Math.floor(Date.now() / 1000) + 300),
          network.uniswapV4.extendedSwapParams ?? false,
        );
        ok = await app.transact({
          key: "swap",
          label: `Swap ${inputSymbol} for ${outputSymbol}`,
          address: network.uniswapV4.universalRouter,
          abi: routerAbi,
          functionName: "execute",
          args: swap.args,
          value: swap.value,
        });
        if (ok) setQuote(undefined);
      }
      if (ok) setFunds(await readFunds(input, app.account.address));
    } catch (e) {
      setError(readableError(e));
    } finally {
      stepLock.current = false;
      setStepping(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>Trade for a keepsake.</h1>
        <p>
          Swap {pair?.symbol ?? "the paired token"} and VIMD in this release’s
          Uniswap v4 pool.
        </p>
      </div>
      <div className="trade-layout">
        <section className="form-surface" aria-labelledby="trade-title">
          <div className="section-heading">
            <h2 id="trade-title">{buy ? "Get VIMD" : "Sell VIMD"}</h2>
            <button
              className="button"
              disabled={app.pending || quoting || stepping}
              onClick={() => {
                setBuy(!buy);
                setAmount("");
              }}
            >
              Reverse pair ⇄
            </button>
          </div>
          <label htmlFor="swap-input">You pay ({inputSymbol})</label>
          <input
            id="swap-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            disabled={app.pending || stepping}
            aria-describedby="swap-error"
            aria-invalid={!!error && !!amount}
          />
          <div className="slippage-row">
            <label htmlFor="slippage">Slippage limit (%)</label>
            <input
              id="slippage"
              inputMode="decimal"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              disabled={app.pending || stepping}
              aria-describedby="slippage-help"
            />
          </div>
          <p className="control-note" id="slippage-help">
            0.1–5%. Quote valid for 60 seconds.
          </p>
          <RequireWallet>
            <button
              className="button full"
              disabled={
                !ready ||
                !protocolVerified ||
                quoting ||
                app.pending ||
                liquidity === 0n
              }
              onClick={() => void getQuote()}
            >
              {quoting
                ? "Requesting quote…"
                : quote
                  ? "Refresh quote"
                  : "Get quote"}
            </button>
          </RequireWallet>
          <p id="swap-error" className="error-text" role="alert">
            {error}
          </p>
          {quote && (
            <>
              <dl className="data-list">
                <div>
                  <dt>Estimated receive</dt>
                  <dd>
                    <Amount
                      value={quote.amountOut}
                      decimals={outputDecimals}
                      symbol={outputSymbol}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Minimum receive</dt>
                  <dd>
                    <Amount
                      value={quote.min}
                      decimals={outputDecimals}
                      symbol={outputSymbol}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Your input balance</dt>
                  <dd>
                    <Amount
                      value={funds?.balance}
                      decimals={inputDecimals}
                      symbol={inputSymbol}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Quote</dt>
                  <dd>
                    {fresh
                      ? `${Math.ceil((quote.expires - now) / 1000)} seconds left`
                      : "Expired; refresh above"}
                  </dd>
                </div>
              </dl>
              <p className="control-note">
                Rate: 1 {inputSymbol} ≈{" "}
                {Number(formatUnits(quote.amountOut, outputDecimals ?? 18)) /
                  Number(formatUnits(quote.amountIn, inputDecimals ?? 18))}{" "}
                {outputSymbol}
              </p>
              {funds && funds.balance < quote.amountIn ? (
                <p className="notice">
                  Your {inputSymbol} balance is too low for this amount.
                </p>
              ) : (
                <button
                  className="button primary full"
                  disabled={
                    !ready ||
                    !fresh ||
                    app.pending ||
                    stepping ||
                    !protocolVerified
                  }
                  onClick={() => void nextStep()}
                >
                  {stepping && !app.pending
                    ? "Checking allowances…"
                    : app.pending
                      ? `${app.tx?.key === "swap" ? "Swapping" : "Approving"}…`
                      : needsERC
                        ? `1. Approve ${inputSymbol} to Permit2`
                        : needsPermit
                          ? "2. Authorize router for this amount"
                          : `3. Swap ${inputSymbol} for ${outputSymbol}`}
                </button>
              )}
            </>
          )}
          <TxStatus />
          <p className="muted">
            USD context unavailable. Approvals and swaps each cost ETH gas.
            ERC-20 swaps send no ETH value beyond network fees.
          </p>
        </section>
        <aside className="trade-details">
          <h2>Know the route</h2>
          <p>
            This is a single-pool swap. Both approval steps use only your input
            amount. Router permission expires after 30 minutes.
          </p>
          <ol className="steps">
            <li>Approve the input token to Permit2.</li>
            <li>Authorize the Universal Router in Permit2.</li>
            <li>
              Review the minimum receive amount and sign the simulated swap.
            </li>
          </ol>
          <dl className="data-list">
            <div>
              <dt>Pool fee</dt>
              <dd>{pool ? `${pool.fee / 10000}%` : "Unavailable"}</dd>
            </div>
            <div>
              <dt>Reported LP fee</dt>
              <dd>
                {slotFee !== undefined ? `${slotFee / 10000}%` : "Loading…"}
              </dd>
            </div>
            <div>
              <dt>Liquidity</dt>
              <dd>
                {liquidity === undefined
                  ? "Loading…"
                  : liquidity === 0n
                    ? "No active liquidity"
                    : "Active"}
              </dd>
            </div>
          </dl>
          <p>
            Quotes may fail if this pool has no usable liquidity. No transaction
            is requested until a simulation succeeds.
          </p>
          <AddressLink
            address={network.uniswapV4.universalRouter}
            label="Universal Router"
          />
          <AddressLink address={network.uniswapV4.permit2} label="Permit2" />
          {pool && (
            <details>
              <summary>View the attested pool key</summary>
              <pre>{JSON.stringify(pool, null, 2)}</pre>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
