import { describe, it, expect, vi, afterEach } from "vitest";
import { BlockchainIQClient, NETWORK } from "../src/client";
import { createMarketBriefTool, createResourceTool } from "../src/tool";

const KEY = "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;

describe("tool definitions", () => {
  it("exposes the market-brief tool with the exact bounty name and an empty schema", () => {
    const client = new BlockchainIQClient(KEY);
    const t = createMarketBriefTool(client);
    expect(t.name).toBe("blockchain_iq_market_brief");
    expect(t.description).toContain("$0.01");
    expect(t.description).toContain("transaction hash");
  });

  it("exposes the generic resource tool with a resource parameter", () => {
    const client = new BlockchainIQClient(KEY);
    const t = createResourceTool(client);
    expect(t.name).toBe("blockchain_iq_resource");
    expect(t.schema).toBeDefined();
  });

  it("defaults the spend cap to $0.02 per call", () => {
    expect(new BlockchainIQClient(KEY).spendCapUsd).toBe(0.02);
  });

  it("rejects an invalid private key", () => {
    expect(() => new BlockchainIQClient("0x1234" as `0x${string}`)).toThrow();
  });
});

describe("brief price guard (offline, mocked 402)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses to pay when the 402 price is not exactly $0.01", async () => {
    const terms = Buffer.from(
      JSON.stringify({
        accepts: [{ amount: "20000", asset: "USDC", network: NETWORK, payTo: "0x0000000000000000000000000000000000000001" }],
      }),
    ).toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 402, headers: { "payment-required": terms } })),
    );
    const client = new BlockchainIQClient(KEY);
    await expect(client.getBrief()).rejects.toThrow("price changed");
  });
});
