import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useConnect, useDisconnect, useWalletClient } from "wagmi";
import {
  createWalletClient,
  custom,
  getAddress,
  encodeFunctionData,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import type { Runtime } from "./config";
import { erc20Abi, isContractRevert, readableError, seatAbi } from "./protocol";

export interface Snapshot {
  votes: bigint[];
  end: bigint;
  timestamp: bigint;
  block: bigint;
  updated: number;
  totalMinted: bigint;
  totalBurned: bigint;
  voteMints: bigint;
  burnMints: bigint;
  burnAmount: bigint;
  seats: Address;
  leader: number | null;
  winner: number | null;
  decimals: number;
  symbol: string;
}
export interface Seat {
  id: bigint;
  voted: boolean;
}
export interface NFT {
  id: bigint;
  name: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
}
export interface Transaction {
  key: string;
  phase:
    | "simulating"
    | "signing"
    | "confirming"
    | "confirmed"
    | "error"
    | "unknown";
  message: string;
  hash?: Hash;
}
export interface Action {
  key: string;
  label: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export async function readSnapshot(runtime: Runtime): Promise<Snapshot> {
  const block = await runtime.client.getBlock();
  const { address, abi } = runtime.contracts.BrandGenesisNFT;
  const read = (functionName: string, args: readonly unknown[] = []) =>
    runtime.client.readContract({
      address,
      abi,
      functionName,
      args,
      blockNumber: block.number,
    });
  const [
    end,
    totalMinted,
    totalBurned,
    voteMints,
    burnMints,
    burnAmount,
    seats,
    decimals,
    symbol,
    ...votes
  ] = await Promise.all([
    read("VOTE_END"),
    read("totalMinted"),
    read("totalBurned"),
    read("totalVoteMints"),
    read("totalBurnMints"),
    read("BURN_AMOUNT"),
    read("SEATS"),
    runtime.client.readContract({
      ...runtime.contracts.LaunchToken,
      functionName: "decimals",
      blockNumber: block.number,
    }),
    runtime.client.readContract({
      ...runtime.contracts.LaunchToken,
      functionName: "symbol",
      blockNumber: block.number,
    }),
    ...[0, 1, 2].map((i) => read("votes", [i])),
  ]);
  let leader: number | null = null,
    winner: number | null = null;
  try {
    if (block.timestamp < BigInt(end as bigint))
      leader = Number(await read("leader"));
    else winner = Number(await read("winner"));
  } catch (e) {
    if (!votes.every((v) => v === 0n) || !isContractRevert(e)) throw e;
  }
  return {
    end: end as bigint,
    timestamp: block.timestamp,
    block: block.number,
    updated: Date.now(),
    totalMinted: totalMinted as bigint,
    totalBurned: totalBurned as bigint,
    voteMints: voteMints as bigint,
    burnMints: burnMints as bigint,
    burnAmount: burnAmount as bigint,
    seats: seats as Address,
    decimals: Number(decimals),
    symbol: String(symbol),
    votes: votes as bigint[],
    leader,
    winner,
  };
}
export async function verifyContracts(runtime: Runtime) {
  if ((await runtime.client.getChainId()) !== runtime.deployment.chainId)
    throw Error("The RPC returned the wrong chain. Transactions are disabled.");
  for (const c of runtime.deployment.contracts) {
    const code = await runtime.client.getCode({ address: c.address });
    if (!code || code === "0x")
      throw Error(
        `No deployed code found for ${c.name}. Transactions are disabled.`,
      );
  }
  const nft = runtime.contracts.BrandGenesisNFT;
  const names = ["VIMD", "ART_A", "ART_B", "ART_C"];
  const expected = [
    "LaunchToken",
    "FinalistArtA",
    "FinalistArtB",
    "FinalistArtC",
  ];
  const addresses = await Promise.all(
    names.map((functionName) =>
      runtime.client.readContract({ ...nft, functionName }),
    ),
  );
  addresses.forEach((value, i) => {
    if (
      String(value).toLowerCase() !==
      runtime.contracts[expected[i]].address.toLowerCase()
    )
      throw Error(
        "Deployed contract bindings do not match this release. Transactions are disabled.",
      );
  });
}
export async function scanOwned(
  runtime: Runtime,
  address: Address,
  contract: Address,
  abi: Abi,
  start: number,
  end: number,
  onProgress: (done: number) => void,
  signal: AbortSignal,
): Promise<bigint[]> {
  const owned: bigint[] = [];
  const blockNumber = await runtime.client.getBlockNumber();
  for (let first = start; first <= end; first += 64) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const ids = Array.from({ length: Math.min(64, end - first + 1) }, (_, i) =>
      BigInt(first + i),
    );
    const results = await Promise.allSettled(
      ids.map((id) =>
        runtime.client.readContract({
          address: contract,
          abi,
          functionName: "ownerOf",
          args: [id],
          blockNumber,
        }),
      ),
    );
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        if (String(result.value).toLowerCase() === address.toLowerCase())
          owned.push(ids[i]);
      } else if (!isContractRevert(result.reason))
        throw Error(
          "The ownership scan was interrupted by an RPC error. Retry to scan every id.",
        );
    });
    onProgress(Math.min(first + 63, end) - start + 1);
  }
  return owned;
}
export function decodeMetadata(uri: string, id: bigint): NFT {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix))
    throw Error("This NFT returned unsupported metadata.");
  const metadata = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(uri.slice(prefix.length)), (c) => c.charCodeAt(0)),
    ),
  );
  if (
    typeof metadata.name !== "string" ||
    !metadata.image?.startsWith("data:image/svg+xml;base64,") ||
    !Array.isArray(metadata.attributes)
  )
    throw Error("This NFT returned invalid metadata.");
  return {
    id,
    name: metadata.name,
    image: metadata.image,
    attributes: metadata.attributes,
  };
}

function useAppState(runtime: Runtime) {
  const account = useAccount();
  const { data: wallet } = useWalletClient();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [verified, setVerified] = useState(false);
  const [readError, setReadError] = useState("");
  const [balance, setBalance] = useState<bigint>();
  const [allowance, setAllowance] = useState<bigint>();
  const [walletError, setWalletError] = useState("");
  const [tx, setTx] = useState<Transaction>();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const unresolved = useRef<{ action: Action; hash: Hash } | undefined>(
    undefined,
  );
  const [checkingConfirmation, setCheckingConfirmation] = useState(false);
  const [refreshId, setRefreshId] = useState(0);
  const accountRef = useRef(account.address);
  accountRef.current = account.address;
  const refreshing = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const walletOK =
    account.isConnected && account.chainId === runtime.deployment.chainId;
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const state = await readSnapshot(runtime);
      setSnapshot(state);
      setReadError("");
      const current = accountRef.current;
      if (current) {
        const [b, a] = await Promise.all([
          runtime.client.readContract({
            ...runtime.contracts.LaunchToken,
            functionName: "balanceOf",
            args: [current],
          }),
          runtime.client.readContract({
            ...runtime.contracts.LaunchToken,
            functionName: "allowance",
            args: [current, runtime.contracts.BrandGenesisNFT.address],
          }),
        ]);
        if (current === accountRef.current) {
          setBalance(b as bigint);
          setAllowance(a as bigint);
        }
      }
    } catch (e) {
      setReadError(readableError(e));
    } finally {
      refreshing.current = false;
    }
  }, [runtime]);
  const verify = useCallback(async () => {
    setVerified(false);
    try {
      await verifyContracts(runtime);
      setVerified(true);
      await refresh();
    } catch (e) {
      setReadError(readableError(e));
    }
  }, [runtime, refresh]);
  useEffect(() => {
    void verify();
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [verify, refresh]);
  useEffect(() => {
    setBalance(undefined);
    setAllowance(undefined);
    setWalletError("");
    void refresh();
  }, [account.address, account.chainId, refresh]);
  async function connectWallet(connector = connect.connectors[0]) {
    setWalletError("");
    setConnecting(true);
    try {
      if (!connector || !(await connector.getProvider()))
        throw Error(
          "No browser wallet was found. Install an Ethereum wallet, then reload this page.",
        );
      await connect.connectAsync({ connector });
    } catch (e) {
      setWalletError(readableError(e));
    } finally {
      setConnecting(false);
    }
  }
  async function switchNetwork() {
    setWalletError("");
    setConnecting(true);
    try {
      const provider = (await account.connector?.getProvider()) as
        | {
            request: (args: {
              method: string;
              params?: unknown[];
            }) => Promise<unknown>;
          }
        | undefined;
      if (!provider)
        throw Error("Reconnect your browser wallet to switch networks.");
      const request = {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${runtime.deployment.chainId.toString(16)}` }],
      };
      try {
        await provider.request(request);
      } catch (error) {
        const err = error as {
          code?: number;
          message?: string;
          data?: { originalError?: { code?: number } };
        };
        if (
          (err.code === 4902 ||
            err.data?.originalError?.code === 4902 ||
            /unknown chain|unrecognized chain|not added/i.test(
              err.message ?? "",
            )) &&
          runtime.deployment.walletAddChain
        ) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [runtime.deployment.walletAddChain],
          });
          await provider.request(request);
        } else throw error;
      }
    } catch (e) {
      setWalletError(readableError(e));
    } finally {
      setConnecting(false);
    }
  }
  async function settleReceipt(
    action: Action,
    receipt: Awaited<ReturnType<typeof runtime.client.getTransactionReceipt>>,
  ) {
    const confirmed = await runtime.client.getTransaction({
      hash: receipt.transactionHash,
    });
    unresolved.current = undefined;
    if (receipt.status !== "success")
      throw Error(
        "The transaction reverted. No action was completed. Review it on the explorer.",
      );
    if (
      confirmed.to?.toLowerCase() !== action.address.toLowerCase() ||
      confirmed.input !==
        encodeFunctionData({
          abi: action.abi,
          functionName: action.functionName,
          args: action.args,
        }) ||
      confirmed.value !== (action.value ?? 0n)
    )
      throw Error(
        "The transaction was replaced or cancelled. Refresh state before trying again.",
      );
    await refresh();
    setRefreshId((n) => n + 1);
    setTx({
      key: action.key,
      phase: "confirmed",
      message: `${action.label} confirmed.`,
      hash: receipt.transactionHash,
    });
  }
  async function checkConfirmation() {
    const active = unresolved.current;
    if (!active || checkingConfirmation) return;
    setCheckingConfirmation(true);
    try {
      const receipt = await runtime.client.getTransactionReceipt({
        hash: active.hash,
      });
      await settleReceipt(active.action, receipt);
    } catch (e) {
      setTx({
        key: active.action.key,
        phase: unresolved.current ? "unknown" : "error",
        message: unresolved.current
          ? "Confirmation is still unavailable. Check the explorer, then check again. Other actions remain locked."
          : readableError(e),
        hash: active.hash,
      });
    } finally {
      setCheckingConfirmation(false);
      if (!unresolved.current) {
        locked.current = false;
        setPending(false);
      }
    }
  }
  async function transact(action: Action) {
    if (locked.current) return false;
    locked.current = true;
    setPending(true);
    setTx({
      key: action.key,
      phase: "simulating",
      message: `Checking ${action.label.toLowerCase()}…`,
    });
    try {
      if (
        !account.address ||
        !walletOK ||
        !verified ||
        readError ||
        !snapshot ||
        Date.now() - snapshot.updated >= 20000
      )
        throw Error(
          "Connect on the verified deployment network and refresh chain data before continuing.",
        );
      const signer = account.address;
      const provider = await account.connector?.getProvider();
      if (!provider) throw Error("Reconnect your wallet before continuing.");
      const walletClient =
        wallet ??
        createWalletClient({
          account: signer,
          chain: runtime.chain,
          transport: custom(provider as Parameters<typeof custom>[0]),
        });
      if ((await walletClient.getChainId()) !== runtime.deployment.chainId)
        throw Error(`Switch your wallet to ${runtime.chain.name} first.`);
      const { request } = await runtime.client.simulateContract({
        address: action.address,
        abi: action.abi,
        functionName: action.functionName,
        args: action.args,
        account: signer,
        value: action.value,
      });
      if (accountRef.current !== signer)
        throw Error("The connected account changed. Review the action again.");
      setTx({
        key: action.key,
        phase: "signing",
        message: `Confirm ${action.label.toLowerCase()} in your wallet.`,
      });
      const hash = await walletClient.writeContract({
        ...request,
        chain: runtime.chain,
        account: signer,
      });
      unresolved.current = { action, hash };
      setTx({
        key: action.key,
        phase: "confirming",
        message: `${action.label}: waiting for confirmation…`,
        hash,
      });
      const receipt = await runtime.client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180000,
        onReplaced: (replacement) => {
          unresolved.current = { action, hash: replacement.transaction.hash };
          setTx({
            key: action.key,
            phase: "confirming",
            message:
              replacement.reason === "cancelled"
                ? "Replacement detected; checking cancellation…"
                : "Replacement transaction detected; waiting for confirmation…",
            hash: replacement.transaction.hash,
          });
        },
      });
      await settleReceipt(action, receipt);
      return true;
    } catch (e) {
      setTx((previous) => ({
        key: action.key,
        phase: unresolved.current ? "unknown" : "error",
        message: unresolved.current
          ? "Confirmation is unavailable. Check the explorer, then check confirmation. Other actions remain locked to prevent a duplicate."
          : readableError(e),
        hash:
          unresolved.current?.hash ??
          (previous?.key === action.key ? previous.hash : undefined),
      }));
      return false;
    } finally {
      if (!unresolved.current) {
        locked.current = false;
        setPending(false);
      }
    }
  }
  return {
    runtime,
    account,
    connectors: connect.connectors,
    connectWallet,
    disconnect: () => disconnect.disconnect(),
    switchNetwork,
    connecting,
    walletError,
    snapshot,
    verified,
    readError,
    refresh,
    verify,
    balance,
    allowance,
    walletOK,
    tx,
    pending,
    transact,
    checkConfirmation,
    checkingConfirmation,
    refreshId,
  };
}
const AppContext = createContext<ReturnType<typeof useAppState> | null>(null);
export function AppProvider({
  runtime,
  children,
}: {
  runtime: Runtime;
  children: ReactNode;
}) {
  const value = useAppState(runtime);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw Error("AppProvider missing");
  return value;
}
export function shortAddress(address: Address) {
  return `${getAddress(address).slice(0, 6)}…${getAddress(address).slice(-4)}`;
}
