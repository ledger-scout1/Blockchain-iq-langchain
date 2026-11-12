/**
 * Demo: free calls only — no wallet, no payment.
 * Fetches the catalogue and the free Bitcoin sample, prints a summary.
 */
import { BlockchainIQClient } from "../src/client.js";

const client = new BlockchainIQClient(
  // Dummy key: only used to build the client object; no paid call is made.
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);

const catalog = (await client.getCatalog()) as { data?: unknown[] };
console.log("catalog resources:", Array.isArray(catalog.data) ? catalog.data.length : "n/a");

const sample = (await client.getSample()) as { data?: Record<string, unknown> };
console.log("sample keys:", Object.keys(sample.data ?? sample));
console.log(JSON.stringify(sample, null, 2).slice(0, 1200));
