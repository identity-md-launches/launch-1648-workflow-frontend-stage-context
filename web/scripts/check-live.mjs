import {
  createPublicClient,
  http,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  parseAbi,
} from "viem";
import { readFile, writeFile } from "node:fs/promises";
import { inputs, root } from "./manifest.mjs";
import { resolve } from "node:path";
const { handoff, chain } = await inputs();
const rpc = process.argv[2];
if (!rpc)
  throw Error(
    "Pass the worker RPC endpoint as the single argument. It is never written into output.",
  );
const client = createPublicClient({ transport: http(rpc, { batch: true }) });
const chainId = await client.getChainId();
if (chainId !== handoff.chainId) throw Error("RPC chain mismatch");
const block = await client.getBlock();
const contracts = [];
for (const c of handoff.contracts) {
  const code = await client.getCode({ address: c.address });
  if (!code || code === "0x") throw Error(`Empty code: ${c.name}`);
  contracts.push({
    name: c.name,
    address: c.address,
    codeBytes: (code.length - 2) / 2,
    codeKeccak: keccak256(code),
  });
}
const nft = handoff.contracts.find((c) => c.name === "BrandGenesisNFT");
const abi = JSON.parse(
  await readFile(resolve(root, "web/public/abi/BrandGenesisNFT.json"), "utf8"),
);
const values = {};
for (const name of [
  "VOTE_END",
  "VIMD",
  "SEATS",
  "ART_A",
  "ART_B",
  "ART_C",
  "totalMinted",
  "totalBurned",
  "totalVoteMints",
  "totalBurnMints",
  "BURN_AMOUNT",
  "votingOpen",
])
  values[name] = await client.readContract({
    address: nft.address,
    abi,
    functionName: name,
    blockNumber: block.number,
  });
values.votes = await Promise.all(
  [0, 1, 2].map((i) =>
    client.readContract({
      address: nft.address,
      abi,
      functionName: "votes",
      args: [i],
      blockNumber: block.number,
    }),
  ),
);
for (const [field, contract] of [
  ["VIMD", "LaunchToken"],
  ["ART_A", "FinalistArtA"],
  ["ART_B", "FinalistArtB"],
  ["ART_C", "FinalistArtC"],
])
  if (
    values[field].toLowerCase() !==
    handoff.contracts.find((c) => c.name === contract).address.toLowerCase()
  )
    throw Error(`Binding mismatch ${field}`);
const artABI = JSON.parse(
  await readFile(resolve(root, "web/public/abi/FinalistArtA.json"), "utf8"),
);
const art = [];
for (const letter of ["A", "B", "C"]) {
  const c = handoff.contracts.find((c) => c.name === `FinalistArt${letter}`);
  const svg = await client.readContract({
    address: c.address,
    abi: artABI,
    functionName: "logomark",
  });
  const local = await readFile(
    resolve(
      root,
      `web/public/guides/finalist-${letter.toLowerCase()}/logomark.svg`,
    ),
    "utf8",
  );
  if (svg !== local) throw Error(`On-chain mark mismatch ${letter}`);
  art.push({ name: c.name, exactBytesMatch: true });
}
const poolId = keccak256(
  encodeAbiParameters(
    parseAbiParameters(
      "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
    ),
    [handoff.poolKey],
  ),
);
const protocol = [];
for (const [name, address] of Object.entries(chain.network.uniswapV4)) {
  if (typeof address !== "string") continue;
  const code = await client.getCode({ address });
  protocol.push({ name, address, codeBytes: code ? (code.length - 2) / 2 : 0 });
  if (!code || code === "0x") throw Error(`Missing protocol code ${name}`);
}
const stateViewAbi = parseAbi([
  "function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns (uint128)",
]);
const [slot0, liquidity] = await Promise.all([
  client.readContract({
    address: chain.network.uniswapV4.stateView,
    abi: stateViewAbi,
    functionName: "getSlot0",
    args: [poolId],
    blockNumber: block.number,
  }),
  client.readContract({
    address: chain.network.uniswapV4.stateView,
    abi: stateViewAbi,
    functionName: "getLiquidity",
    args: [poolId],
    blockNumber: block.number,
  }),
]);
const pairedABI = parseAbi([
  "function symbol() view returns(string)",
  "function decimals() view returns(uint8)",
]);
const pair = chain.network.pairToken;
const [pairSymbol, pairDecimals] = await Promise.all(
  ["symbol", "decimals"].map((functionName) =>
    client.readContract({
      address: pair.address,
      abi: pairedABI,
      functionName,
      blockNumber: block.number,
    }),
  ),
);
if (pairSymbol !== pair.symbol || Number(pairDecimals) !== pair.decimals)
  throw Error("Live paired token metadata mismatch");
let quote;
try {
  const quoterABI = parseAbi([
    "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256,uint256)",
  ]);
  const simulated = await client.simulateContract({
    address: chain.network.uniswapV4.quoter,
    abi: quoterABI,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: handoff.poolKey,
        zeroForOne:
          pair.address.toLowerCase() ===
          handoff.poolKey.currency0.toLowerCase(),
        exactAmount: 10n ** BigInt(pair.decimals),
        hookData: "0x",
      },
    ],
    blockNumber: block.number,
  });
  quote = {
    kind: "eth_call only",
    amountIn: "1 IMD",
    amountOutRaw: simulated.result[0],
    gasEstimate: simulated.result[1],
  };
} catch (error) {
  quote = {
    kind: "eth_call only",
    unavailable: true,
    reason: error.shortMessage ?? "Quote simulation reverted",
  };
}
const result = {
  checkedAt: new Date().toISOString(),
  source: chain.network.rpcUrls[0],
  chainId,
  blockNumber: String(block.number),
  blockHash: block.hash,
  blockTimestamp: String(block.timestamp),
  contracts,
  bindingsAndState: values,
  art,
  protocol,
  poolId,
  poolState: {
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
    protocolFee: slot0[2],
    lpFee: slot0[3],
    liquidity,
  },
  pair: { address: pair.address, symbol: pairSymbol, decimals: pairDecimals },
  quote,
  transactionsBroadcast: 0,
  limitations: [
    "Read-only verification; no funded wallet action, approval, vote, mint, burn, transfer or live swap was broadcast.",
    "RPC checks confirm nonempty code and binding reads, not a complete independent runtime-bytecode audit.",
  ],
};
await writeFile(
  resolve(root, "docs/frontend/live-read-check.json"),
  JSON.stringify(result, (_, v) => (typeof v === "bigint" ? String(v) : v), 2) +
    "\n",
);
console.log(
  JSON.stringify(
    {
      chainId,
      block: String(block.number),
      contracts: contracts.length,
      art: art.length,
      state: values,
      transactionsBroadcast: 0,
    },
    (_, v) => (typeof v === "bigint" ? String(v) : v),
    2,
  ),
);
