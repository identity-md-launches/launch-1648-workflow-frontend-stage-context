import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  keccak256,
  toBytes,
  isAddress,
  getAddress,
  type Abi,
  type Address,
} from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClient } from "@tanstack/react-query";

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}
export interface Deployment {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: unknown[];
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken: {
      address: Address;
      symbol: string;
      name: string;
      decimals: number;
    };
    otherPairTokens?: {
      address: Address;
      symbol: string;
      name: string;
      decimals: number;
    }[];
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
  assets: { path: string; sha256: string }[];
}
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  return value;
}
export function hashABI(abi: Abi) {
  return keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
}
export function safePath(path: string) {
  return (
    typeof path === "string" &&
    !path.startsWith("/") &&
    !path.includes("..") &&
    !path.includes(":") &&
    !path.includes("\\")
  );
}
export async function loadDeployment() {
  const response = await fetch("./imd-deployment.json", { cache: "no-cache" });
  if (!response.ok)
    throw Error(
      "Deployment configuration could not be loaded. Reload this page.",
    );
  const deployment = (await response.json()) as Deployment;
  if (
    deployment.version !== 1 ||
    !deployment.network ||
    deployment.chainId !== deployment.network.chainId ||
    !deployment.network.rpcUrls.length
  )
    throw Error(
      "Deployment network configuration is invalid. Transactions are disabled.",
    );
  if (
    new Set(deployment.contracts.map((c) => c.name)).size !==
    deployment.contracts.length
  )
    throw Error("Duplicate contract configuration.");
  const contracts: Record<string, { address: Address; abi: Abi }> = {};
  await Promise.all(
    deployment.contracts.map(async (c) => {
      if (!isAddress(c.address) || !safePath(c.abiPath))
        throw Error(`Invalid deployment entry: ${c.name}`);
      const res = await fetch(`./${c.abiPath}`);
      if (!res.ok)
        throw Error(`Unable to load the ${c.name} ABI. Reload to retry.`);
      const abi = (await res.json()) as Abi;
      if (!Array.isArray(abi) || hashABI(abi) !== c.abiHash)
        throw Error(
          `ABI verification failed for ${c.name}. Transactions are disabled.`,
        );
      contracts[c.name] = { address: getAddress(c.address), abi };
    }),
  );
  for (const name of [
    "LaunchToken",
    "BrandGenesisNFT",
    "FinalistArtA",
    "FinalistArtB",
    "FinalistArtC",
  ])
    if (!contracts[name]) throw Error(`Missing contract: ${name}`);
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: deployment.network.explorer },
    },
    testnet: deployment.network.testnet,
  });
  const transport = fallback(
    deployment.network.rpcUrls.map((url) =>
      http(url, {
        batch: { batchSize: 64, wait: 15 },
        retryCount: 1,
        timeout: 12000,
      }),
    ),
    { rank: false, retryCount: 1 },
  );
  const client = createPublicClient({ chain, transport });
  const walletConfig = createConfig({
    chains: [chain],
    connectors: [injected()],
    multiInjectedProviderDiscovery: true,
    transports: { [chain.id]: transport },
  });
  return {
    deployment,
    contracts,
    chain,
    client,
    walletConfig,
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
    }),
  };
}
export type Runtime = Awaited<ReturnType<typeof loadDeployment>>;
