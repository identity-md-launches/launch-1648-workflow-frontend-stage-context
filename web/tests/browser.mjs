import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  parseAbi,
  toHex,
  zeroAddress,
  parseEther,
  decodeAbiParameters,
  parseAbiParameters,
} from "viem";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const manifest = JSON.parse(
  await readFile(resolve(root, "dist/imd-deployment.json"), "utf8"),
);
const contracts = Object.fromEntries(
  await Promise.all(
    manifest.contracts.map(async (c) => [
      c.name,
      {
        ...c,
        abi: JSON.parse(
          await readFile(resolve(root, "dist", c.abiPath), "utf8"),
        ),
      },
    ]),
  ),
);
const pool = manifest.poolKey,
  network = manifest.network;
const seatAddress = JSON.parse(
  await readFile(resolve(root, "web/deployment/handoff.json"), "utf8"),
).manifest.contracts.find((c) => c.contract === "BrandGenesisNFT")
  .constructorArgs[1];
const owner = "0x1234567890123456789012345678901234567890"; // Test-only wallet, never deployment config.
const other = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const ercAbi = parseAbi([
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function approve(address,uint256) returns(bool)",
]);
const permitAbi = parseAbi([
  "function allowance(address,address,address) view returns(uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address,address,uint160,uint48)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256,uint256)",
]);
const routerAbi = parseAbi(["function execute(bytes,bytes[],uint256) payable"]);
const viewAbi = parseAbi([
  "function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns(uint128)",
]);
const seatAbi = parseAbi(["function ownerOf(uint256) view returns(address)"]);
const report = {
  started: new Date().toISOString(),
  environment:
    "Chromium / Playwright; exported files at a gateway-style subpath",
  checks: [],
  screenshots: [],
  consoleErrors: [],
  localFailures: [],
  transactions:
    "All wallet transactions are mocked. No live transactions broadcast.",
};
const checked = (name, details) => {
  report.checks.push({ name, passed: true, details });
  console.log("PASS " + name);
};
const state = {
  block: 1000n,
  timestamp: BigInt(Math.floor(Date.now() / 1000)),
  closed: false,
  zeroVotes: false,
  votes: [2n, 1n, 0n],
  used: new Set([7n]),
  owners: new Map([
    [1n, owner],
    [2n, other],
  ]),
  nftFinalist: new Map([
    [1n, 0],
    [2n, 1],
  ]),
  totalMinted: 2n,
  burnMints: 0n,
  totalBurned: 0n,
  balance: parseEther("100000"),
  pairBalance: parseEther("1000000"),
  mintAllowance: 0n,
  ercAllowances: new Map(),
  permitAmounts: new Map(),
  reject: false,
  revert: "",
  rpcFail: false,
  emptyCode: false,
  send: [],
  calls: [],
  scanned: new Set(),
  receiptDelay: 0,
};
const hash = "0x" + "ab".repeat(32);
const receipts = new Map(),
  transactions = new Map();
const block = () => ({
  number: toHex(state.block),
  hash,
  parentHash: "0x" + "cd".repeat(32),
  timestamp: toHex(state.timestamp),
  nonce: "0x0000000000000000",
  sha3Uncles: "0x" + "00".repeat(32),
  logsBloom: "0x" + "00".repeat(256),
  transactionsRoot: hash,
  stateRoot: hash,
  receiptsRoot: hash,
  miner: owner,
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x100",
  gasLimit: "0x1c9c380",
  gasUsed: "0x100",
  baseFeePerGas: "0x3b9aca00",
  uncles: [],
  transactions: [],
  mixHash: hash,
});
function abiFor(to) {
  to = to.toLowerCase();
  const contract = Object.values(contracts).find(
    (c) => c.address.toLowerCase() === to,
  );
  if (contract) return contract.abi;
  if (to === seatAddress.toLowerCase()) return seatAbi;
  if (to === network.uniswapV4.permit2) return permitAbi;
  if (to === network.uniswapV4.quoter) return quoterAbi;
  if (to === network.uniswapV4.universalRouter) return routerAbi;
  if (to === network.uniswapV4.stateView) return viewAbi;
  return ercAbi;
}
function revert(name = "ERC721NonexistentToken", args = [1n]) {
  throw {
    code: 3,
    message: "execution reverted",
    data: encodeErrorResult({
      abi: contracts.BrandGenesisNFT.abi,
      errorName: name,
      args,
    }),
  };
}
function call(tx) {
  const abi = abiFor(tx.to),
    decoded = decodeFunctionData({ abi, data: tx.data }),
    f = decoded.functionName,
    args = decoded.args ?? [],
    to = tx.to.toLowerCase();
  state.calls.push({ to, f, args });
  let result;
  if (
    ["vote", "mint", "burn", "execute", "safeTransferFrom", "approve"].includes(
      f,
    ) &&
    state.revert
  )
    revert(state.revert, []);
  if (to === seatAddress.toLowerCase()) {
    state.scanned.add(args[0].toString());
    result = [0n, 7n, 1999n].includes(args[0]) ? owner : other;
  } else if (to === contracts.BrandGenesisNFT.address) {
    const stats = {
      VOTE_END: state.closed ? state.timestamp - 1n : state.timestamp + 604800n,
      VIMD: contracts.LaunchToken.address,
      SEATS: seatAddress,
      ART_A: contracts.FinalistArtA.address,
      ART_B: contracts.FinalistArtB.address,
      ART_C: contracts.FinalistArtC.address,
      totalMinted: state.totalMinted,
      totalBurned: state.totalBurned,
      totalVoteMints: state.votes.reduce((s, v) => s + v, 0n),
      totalBurnMints: state.burnMints,
      BURN_AMOUNT: parseEther("50000"),
      totalSupply: state.totalMinted - state.totalBurned,
    };
    if (f in stats) result = stats[f];
    else if (f === "votes")
      result = state.zeroVotes ? 0n : state.votes[args[0]];
    else if (f === "leader" || f === "winner") {
      if (state.zeroVotes) revert("NoVotes", []);
      result = state.votes.indexOf(
        state.votes.reduce((a, b) => (a > b ? a : b)),
      );
    } else if (f === "seatVoted") result = state.used.has(args[0]);
    else if (f === "ownerOf") {
      result = state.owners.get(args[0]);
      if (!result) revert();
    } else if (f === "tokenURI") {
      const id = args[0];
      if (!state.owners.has(id)) revert();
      const letter = ["a", "b", "c"][state.nftFinalist.get(id) ?? 0];
      const image = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1f2a6b"/><circle cx="32" cy="32" r="16" fill="#f26b4e"/></svg>`,
      ).toString("base64");
      const metadata = {
        name: `Visual Identity Genesis #${id}`,
        image: `data:image/svg+xml;base64,${image}`,
        attributes: [
          { trait_type: "Edition", value: "1" },
          { trait_type: "Finalist", value: letter.toUpperCase() },
          { trait_type: "Type", value: id === 1n ? "Vote" : "Burn" },
        ],
      };
      result =
        "data:application/json;base64," +
        Buffer.from(JSON.stringify(metadata)).toString("base64");
    } else if (
      ["vote", "mint", "burn", "safeTransferFrom", "approve"].includes(f)
    )
      return "0x";
    else if (f === "getApproved") result = zeroAddress;
    else if (f === "isApprovedForAll") result = false;
    else throw Error("Unhandled NFT call " + f);
  } else if (to === network.uniswapV4.permit2) {
    if (f === "allowance")
      result = [
        state.permitAmounts.get(args[1].toLowerCase()) ?? 0n,
        BigInt(Math.floor(Date.now() / 1000) + 1800),
        0n,
      ];
    else return "0x";
  } else if (to === network.uniswapV4.quoter)
    result = [args[0].exactAmount * 2n, 100000n];
  else if (to === network.uniswapV4.stateView)
    result = f === "getSlot0" ? [2n ** 96n, 0, 0, 12500] : 1000000n;
  else if (to === network.uniswapV4.universalRouter) return "0x";
  else if (f === "decimals") result = 18;
  else if (f === "symbol")
    result = to === contracts.LaunchToken.address ? "VIMD" : "IMD";
  else if (f === "balanceOf")
    result =
      to === contracts.LaunchToken.address ? state.balance : state.pairBalance;
  else if (f === "allowance")
    result =
      args[1].toLowerCase() === contracts.BrandGenesisNFT.address
        ? state.mintAllowance
        : (state.ercAllowances.get(to) ?? 0n);
  else if (f === "approve") result = true;
  else if (f === "logomark") result = "<svg/>";
  else throw Error("Unhandled call " + f);
  return encodeFunctionResult({ abi, functionName: f, result });
}
function send(tx) {
  if (state.reject) {
    state.reject = false;
    throw { code: 4001, message: "User rejected the request." };
  }
  const abi = abiFor(tx.to);
  const decoded = decodeFunctionData({ abi, data: tx.data });
  const { functionName: f, args = [] } = decoded;
  state.send.push({ tx, f, args });
  if (f === "vote") {
    if (state.used.has(args[0])) revert("SeatAlreadyVoted", [args[0]]);
    state.used.add(args[0]);
    state.votes[args[1]]++;
    state.totalMinted++;
    state.owners.set(state.totalMinted, owner);
    state.nftFinalist.set(state.totalMinted, args[1]);
  }
  if (f === "mint") {
    state.balance -= parseEther("50000");
    state.mintAllowance -= parseEther("50000");
    state.burnMints++;
    state.totalMinted++;
    state.owners.set(state.totalMinted, owner);
    state.nftFinalist.set(state.totalMinted, args[0]);
  }
  if (f === "burn") {
    state.owners.delete(args[0]);
    state.totalBurned++;
  }
  if (f === "safeTransferFrom") state.owners.set(args[2], args[1]);
  if (f === "approve") {
    if (tx.to.toLowerCase() === network.uniswapV4.permit2)
      state.permitAmounts.set(args[0].toLowerCase(), args[2]);
    else if (args[0].toLowerCase() === contracts.BrandGenesisNFT.address)
      state.mintAllowance = args[1];
    else state.ercAllowances.set(tx.to.toLowerCase(), args[1]);
  }
  state.block++;
  const transactionHash =
    "0x" + state.send.length.toString(16).padStart(64, "0");
  const common = {
    hash: transactionHash,
    blockHash: hash,
    blockNumber: toHex(state.block),
    transactionIndex: "0x0",
    from: owner,
    to: tx.to,
    gas: "0x100000",
    gasPrice: "0x3b9aca00",
    input: tx.data,
    nonce: "0x0",
    value: tx.value ?? "0x0",
    type: "0x2",
    chainId: "0x1",
    maxFeePerGas: "0x77359400",
    maxPriorityFeePerGas: "0x3b9aca00",
    v: "0x1",
    r: hash,
    s: hash,
  };
  transactions.set(transactionHash, common);
  receipts.set(transactionHash, {
    transactionHash,
    blockHash: hash,
    blockNumber: toHex(state.block),
    transactionIndex: "0x0",
    from: owner,
    to: tx.to,
    cumulativeGasUsed: "0x10000",
    gasUsed: "0x10000",
    contractAddress: null,
    logs: [],
    logsBloom: "0x" + "00".repeat(256),
    status: "0x1",
    effectiveGasPrice: "0x3b9aca00",
    type: "0x2",
  });
  return transactionHash;
}
async function rpc(request) {
  const { method, params = [] } = request;
  if (state.rpcFail) throw { code: -32005, message: "Mock RPC unavailable" };
  switch (method) {
    case "eth_chainId":
      return "0x1";
    case "net_version":
      return "1";
    case "eth_getCode":
      return state.emptyCode ? "0x" : "0x60806040";
    case "eth_blockNumber":
      return toHex(state.block);
    case "eth_getBlockByNumber":
      return block();
    case "eth_call":
      return call(params[0]);
    case "eth_estimateGas":
      return "0x50000";
    case "eth_gasPrice":
      return "0x3b9aca00";
    case "eth_maxPriorityFeePerGas":
      return "0x3b9aca00";
    case "eth_getBalance":
      return toHex(parseEther("10"));
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_sendTransaction":
      return send(params[0]);
    case "eth_getTransactionReceipt":
      if (state.receiptDelay)
        await new Promise((r) => setTimeout(r, state.receiptDelay));
      return receipts.get(params[0]) ?? null;
    case "eth_getTransactionByHash":
      if (state.failTransactionLookup)
        throw { code: -32602, message: "Mock transaction lookup unavailable" };
      return transactions.get(params[0]) ?? null;
    case "wallet_getCapabilities":
      return {};
    default:
      throw Error("Unhandled RPC " + method);
  }
}
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/markdown",
};
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith("/preview/")) throw Error();
    const relative = path.slice("/preview/".length) || "index.html";
    const absolute = resolve(root, "dist", relative);
    if (!absolute.startsWith(resolve(root, "dist") + "/")) throw Error();
    const content = await readFile(absolute);
    res.writeHead(200, {
      "content-type": mime[extname(absolute)] ?? "application/octet-stream",
    });
    res.end(content);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.consoleErrors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      report.localFailures.push(r.url());
  });
  await context.route("https://**", async (route) => {
    try {
      const data = route.request().postDataJSON();
      const requests = Array.isArray(data) ? data : [data];
      const answers = await Promise.all(
        requests.map(async (request) => {
          try {
            return {
              jsonrpc: "2.0",
              id: request.id,
              result: await rpc(request),
            };
          } catch (error) {
            return {
              jsonrpc: "2.0",
              id: request.id,
              error: {
                code: error.code ?? -32000,
                message: error.message ?? String(error),
                data: error.data,
              },
            };
          }
        }),
      );
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(data) ? answers : answers[0]),
      });
    } catch (e) {
      await route.abort();
    }
  });
  await page.goto(url);
  await page.getByText("Deployment verified", { exact: true }).waitFor();
  assert(
    (await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .count()) >= 1,
  );
  const actionBox = await page.locator("#vote .button.primary").boundingBox();
  assert(actionBox.y + actionBox.height <= 844);
  checked(
    "390 first screen contains product, finalist choice, live vote window and wallet action",
    actionBox,
  );
  await page.getByRole("radio", { name: "Orbit" }).check();
  assert(await page.getByRole("radio", { name: "Orbit" }).isChecked());
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await page
    .getByText(/No browser wallet was found/)
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Close wallet dialog" }).click();
  checked("Missing browser wallet has an actionable persistent error");
  await page.keyboard.press("Tab");
  await page.screenshot({
    path: resolve(root, "docs/frontend/keyboard-focus.png"),
  });
  report.screenshots.push("keyboard-focus.png");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.equal(
    axe.violations.length,
    0,
    JSON.stringify(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
  checked(
    "Automated accessibility check: no detected WCAG A/AA violations on home",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const path of [
      "/",
      "/guides",
      "/guides/a",
      "/guides/b",
      "/guides/c",
      "/collect",
      "/trade",
      "/about",
    ]) {
      await page.goto(`${url}#${path}`);
      await page.getByRole("main").waitFor();
      if (path.startsWith("/guides/"))
        await page
          .getByRole("heading", { name: "Overview", exact: true })
          .waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `Overflow ${width} ${path}`,
      );
    }
    await page.goto(url);
    await page.getByText("Deployment verified", { exact: true }).waitFor();
    if (width === 390 || width === 1440) {
      const file = `home-${width}.png`;
      await page.screenshot({ path: resolve(root, "docs/frontend", file) });
      report.screenshots.push(file);
    }
  }
  checked(
    "All eight routes reflow at 320, 390, 768 and 1440 pixels without horizontal scroll",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}#/guides/b`);
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  for (const anchor of await page.locator(".download-list a").all()) {
    const response = await context.request.get(
      new URL(await anchor.getAttribute("href"), url).href,
    );
    assert.equal(response.status(), 200);
    assert((await response.body()).length > 0);
  }
  await page.screenshot({ path: resolve(root, "docs/frontend/guide-390.png") });
  report.screenshots.push("guide-390.png");
  checked(
    "Guide renders Markdown and every download resolves to nonempty local bytes",
  );
  await page.goto(url);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "200% text enlargement overflow",
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  checked(
    "200% text enlargement reflows at 390 pixels (not native browser zoom)",
  );
  await page.exposeFunction("__rpc", rpc);
  await page.addInitScript(() => {
    const handlers = {};
    let connected = sessionStorage.getItem("__mockConnected") === "1",
      chain = sessionStorage.getItem("__mockChain") ?? "0x89",
      added = sessionStorage.getItem("__mockAdded") === "1";
    window.__walletRequests = [];
    window.ethereum = {
      isMetaMask: true,
      on: (event, fn) => {
        (handlers[event] ??= []).push(fn);
      },
      removeListener: (event, fn) => {
        handlers[event] = (handlers[event] ?? []).filter((f) => f !== fn);
      },
      request: async (request) => {
        window.__walletRequests.push(request);
        if (request.method === "eth_accounts")
          return connected
            ? ["0x1234567890123456789012345678901234567890"]
            : [];
        if (request.method === "eth_requestAccounts") {
          connected = true;
          sessionStorage.setItem("__mockConnected", "1");
          return ["0x1234567890123456789012345678901234567890"];
        }
        if (request.method === "eth_chainId") return chain;
        if (request.method === "wallet_switchEthereumChain") {
          if (!added) throw { code: 4902, message: "Unknown chain" };
          chain = request.params[0].chainId;
          sessionStorage.setItem("__mockChain", chain);
          (handlers.chainChanged ?? []).forEach((fn) => fn(chain));
          return null;
        }
        if (request.method === "wallet_addEthereumChain") {
          added = true;
          sessionStorage.setItem("__mockAdded", "1");
          return null;
        }
        return window.__rpc(request);
      },
    };
    window.__changeAccount = (address) => {
      (handlers.accountsChanged ?? []).forEach((fn) => fn([address]));
    };
  });
  await page.reload();
  await page.getByText("Deployment verified", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Connect browser wallet" }).click();
  const close = page.getByRole("button", { name: "Close wallet dialog" });
  if (await close.isVisible()) await close.click();
  await page
    .getByRole("button", { name: "Switch to Ethereum", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Find my seats", exact: true })
    .waitFor();
  const chainRequests = await page.evaluate(() =>
    window.__walletRequests.filter((r) => r.method.startsWith("wallet_")),
  );
  assert.deepEqual(
    chainRequests.filter((r) => r.method === "wallet_addEthereumChain")[0]
      .params,
    [manifest.walletAddChain],
  );
  assert.equal(
    chainRequests.filter((r) => r.method === "wallet_switchEthereumChain")
      .length,
    2,
  );
  checked(
    "Wrong-network flow offers one switch control and 4902 adds exact vetted chain then switches again",
  );
  await page
    .getByRole("button", { name: "Find my seats", exact: true })
    .click();
  await page.getByText("2 available · 1 already voted").waitFor();
  assert.equal(state.scanned.size, 2000);
  assert(state.scanned.has("0") && state.scanned.has("1999"));
  assert(await page.locator('option[value="7"]').isDisabled());
  checked(
    "Wallet seat scan covers all 2,000 ids; used seats are shown and disabled",
  );
  await page.getByLabel("Your seat", { exact: true }).selectOption("1999");
  await page.getByRole("radio", { name: "Lattice" }).check();
  state.reject = true;
  await page
    .getByRole("button", { name: "Vote for Lattice", exact: true })
    .click();
  await page.getByText(/Request cancelled in your wallet/).waitFor();
  assert(!state.used.has(1999n));
  checked("Rejected vote recovers without minting or consuming a seat");
  state.revert = "VotingClosed";
  const before = state.send.length;
  await page
    .getByRole("button", { name: "Vote for Lattice", exact: true })
    .click();
  await page.getByText(/Voting has ended. You can still collect/).waitFor();
  assert.equal(state.send.length, before);
  state.revert = "";
  checked("Reverting vote simulation prevents a wallet send");
  state.receiptDelay = 700;
  await page
    .getByRole("button", { name: "Vote for Lattice", exact: true })
    .click();
  await page
    .getByText("Vote for Lattice confirmed.", { exact: true })
    .waitFor();
  assert(state.used.has(1999n));
  assert.equal(state.votes[2], 1n);
  checked(
    "Successful vote uses selected seat/finalist, confirms receipt and refreshes counts",
  );
  await page.getByRole("link", { name: "Collect", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve 50,000 VIMD", exact: true })
    .click();
  await page.getByRole("button", { name: "Approving mint…" }).waitFor();
  assert(
    await page.getByRole("button", { name: "Approving mint…" }).isDisabled(),
  );
  await page
    .getByRole("button", { name: "Burn 50,000 VIMD & mint", exact: true })
    .waitFor();
  assert.equal(state.mintAllowance, parseEther("50000"));
  checked(
    "Collector approval is exact amount and stays disabled until receipt and allowance refresh",
  );
  const votesBefore = [...state.votes];
  await page
    .getByRole("button", { name: "Burn 50,000 VIMD & mint", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert.equal(state.burnMints, 0n);
  await page
    .getByRole("button", { name: "Burn 50,000 VIMD & mint", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Burn 50,000 VIMD & mint", exact: true })
    .click();
  await page
    .getByText("Collect Keystone confirmed.", { exact: true })
    .first()
    .waitFor();
  assert.equal(state.burnMints, 1n);
  assert.deepEqual(state.votes, votesBefore);
  checked(
    "Collector mint requires irreversible-burn review; success leaves votes unchanged",
  );
  await page.getByRole("button", { name: "Load my NFTs", exact: true }).click();
  await page
    .getByRole("heading", { name: "Visual Identity Genesis #1", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Manage NFT #1", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Permanently burn NFT", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert(!state.owners.has(1n));
  assert.deepEqual(state.votes, votesBefore);
  assert(state.used.has(1999n));
  checked(
    "Portfolio decodes tokenURI and confirmed NFT burn changes no votes or seat status",
  );
  await page.getByRole("button", { name: "Load my NFTs", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage NFT #3", exact: true })
    .click();
  await page.getByLabel("Action", { exact: true }).selectOption("transfer");
  await page.getByLabel("Recipient address", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Transfer NFT", exact: true }).click();
  await page.getByText("Enter a valid, nonzero Ethereum address.").waitFor();
  await page.getByLabel("Recipient address", { exact: true }).fill(other);
  await page.getByRole("button", { name: "Transfer NFT", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(state.owners.get(3n).toLowerCase(), other);
  checked(
    "NFT transfer validates recipient and sends safeTransferFrom for the owned token",
  );
  await page.getByRole("button", { name: "Load my NFTs", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage NFT #4", exact: true })
    .click();
  await page.getByLabel("Action", { exact: true }).selectOption("approve");
  await page.getByLabel("Operator address", { exact: true }).fill(other);
  await page
    .getByRole("button", { name: "Approve this NFT", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const nftApproval = state.send.findLast((t) => t.f === "approve");
  assert.equal(
    nftApproval.tx.to.toLowerCase(),
    contracts.BrandGenesisNFT.address,
  );
  assert.equal(nftApproval.args[1], 4n);
  checked("NFT operator approval is scoped to one reviewed token");
  state.failTransactionLookup = true;
  await page
    .getByRole("button", { name: "Approve 50,000 VIMD", exact: true })
    .click();
  await page
    .getByText(/Confirmation is unavailable/)
    .first()
    .waitFor();
  assert(await page.locator(".form-surface button.primary").isDisabled());
  const sendsAtUnknown = state.send.length;
  state.failTransactionLookup = false;
  await page
    .getByRole("button", { name: "Check confirmation", exact: true })
    .first()
    .click();
  await page
    .getByText("Approve collector mint confirmed.", { exact: true })
    .first()
    .waitFor();
  assert.equal(state.send.length, sendsAtUnknown);
  checked(
    "An uncertain receipt locks new writes and confirmation recovery does not re-send",
  );

  await page.getByRole("link", { name: "Trade", exact: true }).click();
  await page.getByLabel("You pay (IMD)").fill("100");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page
    .getByRole("button", { name: "1. Approve IMD to Permit2", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "1. Approve IMD to Permit2", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "2. Authorize router for this amount",
      exact: true,
    })
    .waitFor();
  assert.equal(
    state.ercAllowances.get(network.pairToken.address),
    parseEther("100"),
  );
  await page
    .getByRole("button", {
      name: "2. Authorize router for this amount",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "3. Swap IMD for VIMD", exact: true })
    .waitFor();
  assert.equal(
    state.permitAmounts.get(network.pairToken.address),
    parseEther("100"),
  );
  await page
    .getByRole("button", { name: "3. Swap IMD for VIMD", exact: true })
    .click();
  await page
    .getByText("Swap IMD for VIMD confirmed.", { exact: true })
    .waitFor();
  const swap = state.send.findLast((t) => t.f === "execute");
  assert.equal(swap.tx.to.toLowerCase(), network.uniswapV4.universalRouter);
  assert.equal(BigInt(swap.tx.value ?? "0x0"), 0n);
  assert.equal(swap.args[0], "0x10");
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    swap.args[1][0],
  );
  assert.equal(actions, "0x060c0f");
  const [settle] = decodeAbiParameters(
    parseAbiParameters("address,uint256"),
    params[1],
  );
  assert.equal(settle.toLowerCase(), network.pairToken.address);
  checked(
    "Quoted IMD→VIMD swap runs both exact Permit2 approvals, simulates execute, sends zero ETH and confirms",
  );
  await page.getByRole("button", { name: "Reverse pair" }).click();
  await page.getByLabel("You pay (VIMD)").fill("10");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page
    .getByRole("button", { name: "1. Approve VIMD to Permit2", exact: true })
    .waitFor();
  checked("Reverse trade quotes VIMD→IMD with the correct input approval");
  await page.evaluate(() => {
    window.__originalNow = Date.now;
    Date.now = () => window.__originalNow() + 61000;
  });
  await page.getByText("Expired; refresh above", { exact: true }).waitFor();
  assert(
    await page
      .getByRole("button", { name: "1. Approve VIMD to Permit2", exact: true })
      .isDisabled(),
  );
  await page.evaluate(() => (Date.now = window.__originalNow));
  checked("Expired quotes disable both approvals and swap until refreshed");

  await page.getByLabel("You pay (VIMD)").fill("1.0000000000000000001");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page.getByText("Use no more than 18 decimal places.").waitFor();
  checked("Over-precision is rejected instead of rounding user funds");
  await page.goto(url);
  await page
    .getByRole("button", { name: "Find my seats", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Find my seats", exact: true })
    .click();
  await page.getByLabel("Your seat", { exact: true }).waitFor();
  await page.evaluate((other) => window.__changeAccount(other), other);
  await page
    .getByRole("button", { name: "Find my seats", exact: true })
    .waitFor();
  assert.equal(await page.locator("#seat").count(), 0);
  checked(
    "Account changes clear previous wallet seats and transaction eligibility",
  );
  state.balance = 0n;
  await page
    .getByRole("button", { name: "Refresh chain data", exact: true })
    .click();
  await page.getByRole("link", { name: "Collect", exact: true }).click();
  await page.getByText("You need 50,000 VIMD to collect.").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Burn 50,000 VIMD & mint", exact: true })
      .count(),
    0,
  );
  state.burnMints = 2000n;
  await page
    .getByRole("button", { name: "Refresh chain data", exact: true })
    .click();
  await page.getByText("All collector mints have been used.").waitFor();
  checked(
    "Insufficient balance and exhausted mint cap expose no executable mint",
  );
  state.balance = 2n ** 256n - 1n;
  state.burnMints = 1n;
  await page.setViewportSize({ width: 320, height: 844 });
  await page
    .getByRole("button", { name: "Refresh chain data", exact: true })
    .click();
  await page.waitForTimeout(250);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Long balance overflow",
  );
  checked(
    "Maximum uint256 token balance reflows without clipping at 320 pixels",
  );
  state.balance = parseEther("100000");
  state.mintAllowance = 0n;
  await page.getByRole("link", { name: "Vote", exact: true }).click();

  state.closed = true;
  state.zeroVotes = true;
  await page
    .getByRole("button", { name: "Refresh chain data", exact: true })
    .click();
  await page
    .getByText("No winner, no votes were cast", { exact: true })
    .waitFor();
  checked(
    "Closed zero-vote result catches NoVotes revert and displays the required no-winner message",
  );
  state.zeroVotes = false;
  await page
    .getByRole("button", { name: "Refresh chain data", exact: true })
    .click();
  await page
    .getByText(/Keystone · Community Brand Guidelines for IMD v1.0/)
    .waitFor();
  checked(
    "Closed nonzero result uses contract winner rather than a client-side vote calculation",
  );
  state.emptyCode = true;
  await page
    .getByRole("button", { name: "Refresh chain data", exact: true })
    .click();
  await page.getByText(/No deployed code found/).waitFor();
  await page.getByRole("link", { name: "Collect", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Approve 50,000 VIMD", exact: true })
      .isDisabled(),
  );
  checked("Missing deployed code disables transaction controls");
  assert.equal(
    report.consoleErrors.length,
    0,
    JSON.stringify(report.consoleErrors),
  );
  assert.equal(
    report.localFailures.length,
    0,
    JSON.stringify(report.localFailures),
  );
  checked(
    "No page script errors or missing local assets throughout browser validation",
  );
  await context.close();
  report.completed = new Date().toISOString();
} catch (e) {
  report.failure = { message: e.message, stack: e.stack };
  throw e;
} finally {
  await writeFile(
    resolve(root, "docs/frontend/browser-checks.json"),
    JSON.stringify(
      report,
      (_, v) => (typeof v === "bigint" ? String(v) : v),
      2,
    ) + "\n",
  );
  await browser?.close();
  await new Promise((r) => server.close(r));
}
