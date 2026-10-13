import {
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import type { PoolKey } from "./config";

// Protocol interfaces only. Every protocol address comes from imd-deployment.json.
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
export const seatAbi = parseAbi([
  "function ownerOf(uint256) view returns (address)",
]);
export const permit2Abi = parseAbi([
  "function allowance(address,address,address) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
  "error ExecutionFailed(uint256 commandIndex,bytes message)",
  "error TransactionDeadlinePassed()",
  "error V4TooLittleReceived(uint256 minAmountOutReceived,uint256 amountReceived)",
]);
export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);
export const poolType =
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export function parseAmount(input: string, decimals: number): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(input.trim()))
    throw Error("Enter a positive amount using digits and one decimal point.");
  if ((input.split(".")[1]?.length ?? 0) > decimals)
    throw Error(`Use no more than ${decimals} decimal places.`);
  const amount = parseUnits(input.trim(), decimals);
  if (amount <= 0n || amount > 2n ** 128n - 1n)
    throw Error("Enter an amount above zero and below the pool limit.");
  return amount;
}
export function slippageBps(input: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(input))
    throw Error("Use a slippage percentage between 0.1 and 5.");
  const bps = Math.round(Number(input) * 100);
  if (bps < 10 || bps > 500)
    throw Error("Use a slippage percentage between 0.1 and 5.");
  return BigInt(bps);
}
export function minimumOut(amount: bigint, bps: bigint) {
  return (amount * (10000n - bps)) / 10000n;
}
export function encodeSwap(
  pool: PoolKey,
  input: Address,
  amount: bigint,
  min: bigint,
  deadline: bigint,
  extended = false,
) {
  if (
    input.toLowerCase() !== pool.currency0.toLowerCase() &&
    input.toLowerCase() !== pool.currency1.toLowerCase()
  )
    throw Error("Input is not a currency in the attested pool.");
  const zeroForOne = input.toLowerCase() === pool.currency0.toLowerCase();
  const output = zeroForOne ? pool.currency1 : pool.currency0;
  const tuple = extended
    ? `${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData`
    : `${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData`;
  const swap = {
    poolKey: pool,
    zeroForOne,
    amountIn: amount,
    amountOutMinimum: min,
    ...(extended ? { minHopPriceX36: 0n } : {}),
    hookData: "0x",
  };
  const params: Hex[] = [
    encodeAbiParameters(parseAbiParameters(`(${tuple})`), [swap] as never),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [input, amount]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [output, min]),
  ];
  return {
    args: [
      "0x10",
      [
        encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
          "0x060c0f",
          params,
        ]),
      ],
      deadline,
    ] as const,
    value: input.toLowerCase() === zeroAddress ? amount : 0n,
    output,
    zeroForOne,
  };
}
export function readableError(error: unknown): string {
  const obj = error as {
    code?: number;
    message?: string;
    shortMessage?: string;
    cause?: unknown;
    data?: { errorName?: string };
  };
  const mappings: Record<string, string> = {
    VotingClosed: "Voting has ended. You can still collect a finalist.",
    SeatAlreadyVoted: "This seat has already voted. Select an unused seat.",
    NotSeatOwner: "This wallet no longer owns the seat. Refresh your seats.",
    InvalidSeat: "Choose a seat numbered 0 through 1999.",
    NoVotes: "No votes have been cast.",
    BurnMintCapReached: "All 2,000 collector mints have been used.",
    VoteMintCapReached: "All 2,000 vote mints have been used.",
    ERC20InsufficientBalance:
      "Your token balance is too low. Refresh your balance or choose a smaller amount.",
    ERC20InsufficientAllowance:
      "The allowance is too low. Approve the displayed amount first.",
    ERC721InsufficientApproval:
      "This wallet does not own this NFT or have permission to manage it.",
    ERC721NonexistentToken: "This NFT does not exist or was burned.",
    V4TooLittleReceived:
      "The quote changed beyond your slippage limit. Request a fresh quote.",
    TransactionDeadlinePassed: "The quote expired. Request a fresh quote.",
    ExecutionFailed:
      "The router simulation reverted. Refresh the quote and check liquidity and allowances.",
  };
  const visited = new Set<unknown>();
  let cursor = obj;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    if (
      cursor.code === 4001 ||
      /user rejected|user denied/i.test(cursor.message ?? "")
    )
      return "Request cancelled in your wallet. You can try again.";
    if (cursor.data?.errorName && mappings[cursor.data.errorName])
      return mappings[cursor.data.errorName];
    const text = cursor.shortMessage ?? cursor.message ?? "";
    for (const [name, message] of Object.entries(mappings))
      if (text.includes(name)) return message;
    cursor = cursor.cause as typeof cursor;
  }
  if (/insufficient funds/i.test(obj?.message ?? ""))
    return "Your wallet needs more ETH for network fees.";
  if (
    error instanceof Error &&
    !("shortMessage" in error) &&
    error.message.length < 240
  )
    return error.message;
  const summary = obj?.shortMessage
    ?.replace(/0x[a-fA-F0-9]{8,}/g, "[contract data]")
    .slice(0, 220);
  return summary
    ? `${summary} Refresh and try again.`
    : "The request could not complete. Check your connection and try again.";
}
export function isContractRevert(error: unknown): boolean {
  let e = error as { name?: string; message?: string; cause?: unknown };
  const seen = new Set();
  while (e && !seen.has(e)) {
    seen.add(e);
    if (
      e.name === "ContractFunctionRevertedError" ||
      /execution reverted/i.test(e.message ?? "")
    )
      return true;
    e = e.cause as typeof e;
  }
  return false;
}
