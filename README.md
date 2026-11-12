# Blockchain IQ × LangChain — x402 tool

A LangChain tool for the [Blockchain IQ](https://www.blockchainiq.co) pay-per-call
crypto data API. No account, no API key: an unpaid request returns HTTP 402,
the agent pays in USDC on Base through the open [x402](https://www.x402.org)
standard, and the data comes back as JSON.

Built for the [Blockchain IQ x402 build bounties](https://www.blockchainiq.co/blog/x402-build-bounties)
($525 in USDC on Base; first qualifying claim $150, next three $125 each;
round closes 31 December 2026, 11:59 PM Central). LangChain slot: **a tool**.

## What it is

- `src/client.ts` — `BlockchainIQClient`: wraps `fetch` with `@x402/fetch`
  + `@x402/evm` (viem signer), with a hard per-call spend cap (default
  **$0.02**). Before any signature it reads the 402 terms and refuses to pay
  unless the price is exactly the expected one.
- `src/tool.ts` — two LangChain tools (from `@langchain/core`):
  - `blockchain_iq_market_brief` — the market brief: BTC/ETH/SOL/XRP prices
    with 24h/7d/30d moves, macro and crypto events in the next 48 hours,
    risk flags. **$0.01 per call**, parameter-free.
  - `blockchain_iq_resource` — any resource by path, e.g. `macro` ($0.05),
    `event-risk?days=7` ($0.05), `calendar` ($0.03).
- `examples/paid-brief-call.ts` — the qualifying paid call, with proof.
- `examples/free-sample.ts` — free calls only (catalogue + sample), no wallet.

## Install

```bash
npm install
npm run build
```

## Use it in a LangChain agent

```ts
import { createBlockchainIQTools } from "blockchain-iq-langchain-tool";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";

const { tools } = createBlockchainIQTools(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
// Spend cap: $0.02 per call by default — pass a second argument to change it.
const agent = createAgent({ model: new ChatOpenAI({ model: "gpt-5" }), tools });

await agent.invoke({
  messages: [{ role: "user", content: "What is the crypto market brief right now?" }],
});
```

The tool returns the brief JSON plus a `_payment` block with the settlement
transaction hash as proof the call was paid.

## Proof of the working paid call

Verified on Base (receipt status `0x1`, block 56219500):

| | |
|---|---|
| Resource | `GET /api/x402/v1/brief` |
| Price | **$0.01 USDC** |
| Network | Base (`eip155:8453`) |
| Payer | `0x0e69147C00b2BCC7092d4c0b9668f302B9EE36Cb` |
| Payee | `0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e` |
| Settlement tx | `0x0439a66d2933794087c3072ae7e6e1f5e950dba8a586456f15a50730617b2684` |
| BaseScan | https://basescan.org/tx/0x0439a66d2933794087c3072ae7e6e1f5e950dba8a586456f15a50730617b2684 |
| Fetched at | 2026-11-11T21:57:55Z |

The on-chain receipt contains a USDC `Transfer` event of exactly 0.01 USDC
from the payer to the Blockchain IQ payee address above. The payer's USDC
balance moved 2.00 → 1.99, exactly the price of the call — nothing else was
spent. The full machine-readable proof is in
[`examples/proof-brief.json`](examples/proof-brief.json); the response carried
live data (BTC $74,359, ETH $2,071.33 at fetch time).

Reproduce it yourself (needs a wallet with a little USDC on Base):

```bash
WALLET_KEY_FILE=/path/to/wallet.key npm run demo:paid
```

The key is read locally and never printed, logged or committed. The script
refuses to run unless the key belongs to the expected wallet, and refuses to
pay anything other than exactly $0.01 for the brief.

## Tests

```bash
npm test   # 5 tests, offline: tool definitions, spend-cap default, 402 price guard
```

## Safety

- Hard per-call spend cap ($0.02 default) enforced by the x402 client's spend
  controls and re-checked against the 402 terms before signing.
- The brief call refuses any price other than exactly $0.01.
- Use a dedicated wallet with a small balance, never a main wallet.
- No private key, seed phrase or credential is stored anywhere in this repo.

## License

MIT — see [LICENSE](LICENSE). Market data is not investment advice.
