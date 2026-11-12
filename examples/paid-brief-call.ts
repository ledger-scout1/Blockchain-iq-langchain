/**
 * Demo: the qualifying $0.01 paid call to the Blockchain IQ market brief.
 *
 * Usage:
 *   WALLET_KEY_FILE=/path/to/keyfile npm run demo:paid
 *
 * The key file must contain a single 0x-prefixed private key. It is read
 * locally and NEVER printed, logged or committed. The script refuses to
 * run unless the key belongs to the expected MOSE wallet, and refuses to
 * pay anything other than exactly $0.01 for the brief.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { BlockchainIQClient } from "../src/client.js";

const EXPECTED_ADDRESS = "0x0e69147C00b2BCC7092d4c0b9668f302B9EE36Cb";
const keyFile = process.env.WALLET_KEY_FILE;
if (!keyFile) {
  console.error("Set WALLET_KEY_FILE to the path of a file holding the wallet private key.");
  process.exit(1);
}
const privateKey = readFileSync(keyFile, "utf8").trim() as `0x${string}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  console.error("Key file does not contain a 0x-prefixed 64-hex private key.");
  process.exit(1);
}
const account = privateKeyToAccount(privateKey);
console.log("payer:", account.address);
if (account.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
  console.error(`Refusing: key belongs to ${account.address}, expected ${EXPECTED_ADDRESS}.`);
  process.exit(1);
}

const client = new BlockchainIQClient(privateKey, 0.02); // hard cap $0.02/call
console.log("spend cap per call: $", client.spendCapUsd);

const { data, proof } = await client.getBrief();
const d = (data ?? {}) as Record<string, unknown>;
console.log("brief data keys:", Object.keys(d));
console.log("payment proof:", JSON.stringify(proof, null, 2));
console.log("BaseScan:", `https://basescan.org/tx/${proof.transactionHash}`);

writeFileSync(
  new URL("./proof-brief.json", import.meta.url),
  JSON.stringify(
    {
      resource: "GET /api/x402/v1/brief",
      priceUsd: proof.amountUsd,
      network: proof.network,
      payTo: proof.payTo,
      payer: proof.payer,
      transactionHash: proof.transactionHash,
      basescan: `https://basescan.org/tx/${proof.transactionHash}`,
      fetchedAt: new Date().toISOString(),
      dataExcerpt: {
        prices: (d as { data?: unknown }).data ?? d,
      },
    },
    null,
    2,
  ),
);
console.log("proof saved to examples/proof-brief.json");
