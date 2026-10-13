import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  type Address,
} from "viem";
import {
  encodeSwap,
  minimumOut,
  parseAmount,
  slippageBps,
  readableError,
  poolType,
} from "../src/protocol";
import { hashABI } from "../src/config";
import { decodeMetadata, scanOwned } from "../src/state";
import type { Runtime, PoolKey } from "../src/config";
const handoff = JSON.parse(
  readFileSync(new URL("../deployment/handoff.json", import.meta.url), "utf8"),
);
const pool = handoff.poolKey as PoolKey;

test("All five canonical ABI hashes match the pinned handoff; mutations fail", () => {
  for (const contract of handoff.contracts) {
    const abi = JSON.parse(
      readFileSync(
        new URL(`../public/abi/${contract.name}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(hashABI(abi), contract.abiHash);
    assert.notEqual(hashABI(abi.slice(1)), contract.abiHash);
  }
});
test("Amounts reject zero, negative, scientific notation, rounding and uint128 overflow", () => {
  assert.equal(parseAmount("1.234567", 6), 1234567n);
  for (const input of ["0", "-1", "1e5", "1.0000001", "1,000", "NaN", ""])
    assert.throws(() => parseAmount(input, 6));
  assert.throws(() => parseAmount((2n ** 128n).toString(), 0));
  assert.equal(slippageBps("0.5"), 50n);
  assert.equal(minimumOut(123456n, 50n), 122838n);
  for (const input of ["0", "10", "-1", "0.501", "NaN"])
    assert.throws(() => slippageBps(input));
});
test("ERC20 swaps encode the exact handoff pool, currency direction, minimum and zero ETH", () => {
  for (const input of [pool.currency0, pool.currency1]) {
    const swap = encodeSwap(pool, input, 1000n, 900n, 123456n);
    assert.equal(swap.value, 0n);
    assert.equal(swap.args[0], "0x10");
    assert.equal(swap.args[2], 123456n);
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes,bytes[]"),
      swap.args[1][0],
    );
    assert.equal(actions, "0x060c0f");
    assert.equal(params.length, 3);
    const [decoded] = decodeAbiParameters(
      parseAbiParameters(
        `(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`,
      ),
      params[0],
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(decoded.poolKey).map(([k, v]) => [
          k,
          typeof v === "string" ? v.toLowerCase() : v,
        ]),
      ),
      pool,
    );
    assert.equal(decoded.zeroForOne, input === pool.currency0);
    assert.equal(decoded.amountIn, 1000n);
    assert.equal(decoded.amountOutMinimum, 900n);
    assert.equal(decoded.hookData, "0x");
    const [settle, cap] = decodeAbiParameters(
      parseAbiParameters("address,uint256"),
      params[1],
    );
    assert.equal(settle.toLowerCase(), input);
    assert.equal(cap, 1000n);
    const [take, min] = decodeAbiParameters(
      parseAbiParameters("address,uint256"),
      params[2],
    );
    assert.equal(take.toLowerCase(), swap.output);
    assert.equal(min, 900n);
  }
});
test("Extended swap tuples add a zero minHopPriceX36 and native inputs send exact value", () => {
  const nativePool = { ...pool, currency0: zeroAddress };
  const swap = encodeSwap(nativePool, zeroAddress, 10n, 7n, 42n, true);
  assert.equal(swap.value, 10n);
  const [, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    swap.args[1][0],
  );
  const [decoded] = decodeAbiParameters(
    parseAbiParameters(
      `(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`,
    ),
    params[0],
  );
  assert.equal(decoded.minHopPriceX36, 0n);
  assert.equal(decoded.hookData, "0x");
  assert.throws(() => encodeSwap(pool, zeroAddress, 1n, 1n, 1n));
});
test("Owner scans cover ids 0 through 1999 and report RPC failure as incomplete", async () => {
  const owner = pool.currency0;
  const seen: bigint[] = [];
  const runtime = {
    client: {
      getBlockNumber: async () => 12n,
      readContract: async ({ args }: { args: bigint[] }) => {
        seen.push(args[0]);
        return args[0] === 0n || args[0] === 1999n ? owner : pool.currency1;
      },
    },
  } as unknown as Runtime;
  const progress: number[] = [];
  const owned = await scanOwned(
    runtime,
    owner,
    pool.currency1,
    [],
    0,
    1999,
    (n) => progress.push(n),
    new AbortController().signal,
  );
  assert.deepEqual(owned, [0n, 1999n]);
  assert.equal(new Set(seen).size, 2000);
  assert.equal(progress.at(-1), 2000);
  const broken = {
    client: {
      getBlockNumber: async () => 12n,
      readContract: async () => {
        throw Error("HTTP 429");
      },
    },
  } as unknown as Runtime;
  await assert.rejects(
    scanOwned(
      broken,
      owner,
      pool.currency1,
      [],
      0,
      1999,
      () => {},
      new AbortController().signal,
    ),
    /interrupted/,
  );
});
test("Cancellation terminates scans and token metadata is decoded, not inserted as HTML", async () => {
  const abort = new AbortController();
  abort.abort();
  const runtime = {
    client: { getBlockNumber: async () => 12n },
  } as unknown as Runtime;
  await assert.rejects(
    scanOwned(
      runtime,
      pool.currency0,
      pool.currency1,
      [],
      0,
      1999,
      () => {},
      abort.signal,
    ),
    /Cancelled/,
  );
  const metadata = {
    name: "Genesis #1",
    image: "data:image/svg+xml;base64," + btoa("<svg/>"),
    attributes: [{ trait_type: "Type", value: "Vote" }],
  };
  assert.equal(
    decodeMetadata(
      "data:application/json;base64," + btoa(JSON.stringify(metadata)),
      1n,
    ).name,
    metadata.name,
  );
  assert.throws(() => decodeMetadata("https://untrusted.example/1", 1n));
});
test("Wallet rejections and contract errors produce actionable explanations", () => {
  assert.match(readableError({ cause: { code: 4001 } }), /cancelled/);
  assert.match(
    readableError({ data: { errorName: "SeatAlreadyVoted" } }),
    /unused seat/,
  );
  assert.match(
    readableError({ data: { errorName: "BurnMintCapReached" } }),
    /2,000/,
  );
});
