/**
 * Blockchain IQ x402 client.
 *
 * Pay-per-call crypto data, no account, no API key. An unpaid request
 * returns HTTP 402 with a PAYMENT-REQUIRED header; the x402 client signs
 * a USDC payment on Base (EIP-3009, gasless for the payer) and retries.
 *
 * Spend safety: the client refuses any single payment above `maxUsdPerCall`
 * (default $0.02 — the dearest call on the whole API is $2.00, the
 * cheapest qualifying call, `brief`, is $0.01). The cap is enforced by
 * the x402 client's spend controls AND checked again here before signing.
 */
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { privateKeyToAccount, type LocalAccount } from "viem/accounts";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

export const BASE_URL = "https://www.blockchainiq.co";
export const API_ROOT = `${BASE_URL}/api/x402/v1`;
export const NETWORK = "eip155:8453"; // Base
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Route egress through the VM proxy when one is configured (Node fetch does not read proxy env vars on its own). */
export function configureProxyFromEnv(): void {
  const proxy = process.env.https_proxy ?? process.env.http_proxy;
  if (proxy) {
    setGlobalDispatcher(new ProxyAgent(proxy));
  }
}

export interface PaymentProof {
  /** USDC amount actually paid, in dollars (e.g. 0.01). */
  amountUsd: number;
  /** Recipient address from the 402 terms. */
  payTo: string;
  /** Network, e.g. "eip155:8453". */
  network: string;
  /** On-chain settlement transaction hash (from the PAYMENT-RESPONSE header). */
  transactionHash: string;
  /** Payer address. */
  payer: string;
}

export interface PaidCallResult<T = unknown> {
  data: T;
  proof: PaymentProof;
}

export class BlockchainIQClient {
  private readonly payFetch: typeof fetch;
  private readonly account: LocalAccount;
  private readonly maxUsdPerCall: number;

  /**
   * @param privateKey 0x-prefixed hex private key of a wallet holding a little USDC on Base.
   * @param maxUsdPerCall Hard per-call spend cap in dollars. Default $0.02.
   */
  constructor(privateKey: `0x${string}`, maxUsdPerCall = 0.02) {
    configureProxyFromEnv();
    this.account = privateKeyToAccount(privateKey);
    this.maxUsdPerCall = maxUsdPerCall;
    const client = x402Client.fromConfig({
      schemes: [{ network: "eip155:*", client: new ExactEvmScheme(this.account) }],
      spendControls: { maxAmountPerPayment: maxUsdPerCall },
    });
    this.payFetch = wrapFetchWithPayment(fetch, client);
  }

  get address(): string {
    return this.account.address;
  }

  get spendCapUsd(): number {
    return this.maxUsdPerCall;
  }

  /** Free catalogue (no payment): every resource, price and response shape. */
  async getCatalog(): Promise<unknown> {
    const res = await fetch(`${API_ROOT}`);
    if (!res.ok) throw new Error(`catalog request failed: HTTP ${res.status}`);
    return res.json();
  }

  /** Free sample (no payment): Bitcoin network activity for one day. */
  async getSample(): Promise<unknown> {
    const res = await fetch(`${API_ROOT}/sample`);
    if (!res.ok) throw new Error(`sample request failed: HTTP ${res.status}`);
    return res.json();
  }

  /**
   * Paid call to any Blockchain IQ resource path, e.g. "/brief" or
   * "/event-risk?days=7". Returns the JSON data plus the settlement proof.
   * Throws before signing if the 402 price exceeds the spend cap.
   */
  async getPaid<T = unknown>(path: string): Promise<PaidCallResult<T>> {
    const url = path.startsWith("http") ? path : `${API_ROOT}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await this.payFetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`paid call failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    const paymentResponse = res.headers.get("payment-response");
    if (!paymentResponse) {
      throw new Error("paid call returned HTTP 200 but no payment-response header — cannot prove settlement");
    }
    const decoded = decodePaymentResponseHeader(paymentResponse) as {
      transaction?: string;
      network?: string;
      payer?: string;
    };
    const data = (await res.json()) as T;
    return {
      data,
      proof: {
        amountUsd: -1, // filled by the caller from the 402 terms when known; see getBrief()
        payTo: "",
        network: decoded.network ?? NETWORK,
        transactionHash: decoded.transaction ?? "",
        payer: decoded.payer ?? this.account.address,
      },
    };
  }

  /**
   * The qualifying $0.01 call: the market brief (BTC/ETH/SOL/XRP prices,
   * 24h/7d/30d moves, events in the next 48h, risk flags). Parameter-free.
   * The 402 terms are read first and refused if the price is not $0.01.
   */
  async getBrief(): Promise<PaidCallResult> {
    const url = `${API_ROOT}/brief`;
    // 1) Unpaid probe: confirm the exact price before any signature.
    const probe = await fetch(url);
    if (probe.status !== 402) {
      throw new Error(`expected HTTP 402 for the unpaid brief call, got ${probe.status}`);
    }
    const required = probe.headers.get("payment-required");
    if (!required) throw new Error("402 response has no payment-required header");
    const terms = JSON.parse(Buffer.from(required, "base64").toString("utf8")) as {
      accepts?: Array<{ amount?: string; asset?: string; network?: string; payTo?: string }>;
    };
    const accept = (terms.accepts ?? []).find((a) => a.network === NETWORK || a.network === "eip155:*");
    if (!accept) throw new Error("402 terms do not offer Base (eip155:8453)");
    // USDC has 6 decimals: "10000" atomic units = $0.01.
    const amountUsd = Number(accept.amount ?? "0") / 1e6;
    if (amountUsd !== 0.01) {
      throw new Error(`brief price changed: expected $0.01, 402 asks $${amountUsd} — refusing to pay`);
    }
    if (amountUsd > this.maxUsdPerCall) {
      throw new Error(`brief price $${amountUsd} exceeds spend cap $${this.maxUsdPerCall}`);
    }
    // 2) Paid call through the x402 wrapper.
    const result = await this.getPaid(url);
    result.proof.amountUsd = amountUsd;
    result.proof.payTo = accept.payTo ?? "";
    return result;
  }
}
