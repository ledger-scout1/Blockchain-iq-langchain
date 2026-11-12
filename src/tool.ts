/**
 * LangChain tools for the Blockchain IQ x402 API.
 *
 * One tool per resource family. The qualifying tool for the Blockchain IQ
 * bounty is `blockchain_iq_market_brief`: a single parameter-free paid
 * call ($0.01) that returns the crypto market brief.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { BlockchainIQClient } from "./client.js";

export { BlockchainIQClient, BASE_URL, API_ROOT, NETWORK, USDC_BASE } from "./client.js";
export type { PaymentProof, PaidCallResult } from "./client.js";

/**
 * Market brief tool — the $0.01 qualifying call.
 * BTC/ETH/SOL/XRP prices with 24h/7d/30d moves and rank, scheduled macro
 * and crypto events in the next 48 hours, and short risk flags.
 */
export function createMarketBriefTool(client: BlockchainIQClient) {
  return tool(
    async () => {
      const { data, proof } = await client.getBrief();
      return JSON.stringify({
        ...((data ?? {}) as Record<string, unknown>),
        _payment: {
          amountUsd: proof.amountUsd,
          network: proof.network,
          payTo: proof.payTo,
          payer: proof.payer,
          transactionHash: proof.transactionHash,
        },
      });
    },
    {
      name: "blockchain_iq_market_brief",
      description:
        "Fetch the Blockchain IQ crypto market brief (BTC, ETH, SOL, XRP prices with 24h/7d/30d moves, macro and crypto events in the next 48 hours, and risk flags). " +
        "Costs $0.01 in USDC on Base, paid per call through the x402 standard — no account, no API key. " +
        "Use as the opening call of a trading, portfolio or research agent loop. " +
        "The returned JSON includes a _payment block with the settlement transaction hash as proof the call was paid.",
      schema: z.object({}),
    },
  );
}

/**
 * Generic paid-resource tool: any Blockchain IQ resource path, e.g.
 * "event-risk?days=7" ($0.05) or "macro" ($0.05). The client's spend cap
 * refuses any call above its per-call limit.
 */
export function createResourceTool(client: BlockchainIQClient) {
  return tool(
    async ({ resource }) => {
      const { data, proof } = await client.getPaid(resource);
      return JSON.stringify({
        ...((data ?? {}) as Record<string, unknown>),
        _payment: {
          amountUsd: proof.amountUsd,
          network: proof.network,
          payTo: proof.payTo,
          payer: proof.payer,
          transactionHash: proof.transactionHash,
        },
      });
    },
    {
      name: "blockchain_iq_resource",
      description:
        "Fetch any Blockchain IQ x402 resource by path, e.g. 'event-risk?days=7' ($0.05), 'macro' ($0.05), 'calendar' ($0.03), 'brief' ($0.01). " +
        "Each call is paid in USDC on Base through x402; the client's spend cap refuses any single call above its limit. " +
        "The returned JSON includes a _payment block with the settlement transaction hash.",
      schema: z.object({
        resource: z
          .string()
          .describe("Resource path relative to /api/x402/v1, e.g. 'macro' or 'event-risk?days=7'"),
      }),
    },
  );
}

/** Convenience: build a client and both tools from a private key. */
export function createBlockchainIQTools(privateKey: `0x${string}`, maxUsdPerCall = 0.02) {
  const client = new BlockchainIQClient(privateKey, maxUsdPerCall);
  return {
    client,
    tools: [createMarketBriefTool(client), createResourceTool(client)],
  };
}
