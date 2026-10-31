import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type VerifiedEvent = {
  provider: "paystack" | "flutterwave";
  eventId: string;
  paymentReference: string;
  providerReference: string;
  status: "success" | "failed" | "cancelled";
  amount: number;
  currency: string;
  payload: Record<string, unknown>;
  providerEnvironment?: 'test' | 'live';
};

class WebhookError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WebhookError";
  }
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

async function hmacHex(algorithm: "SHA-256" | "SHA-512", secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: algorithm }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function statusFromProvider(value: unknown): "success" | "failed" | "cancelled" | null {
  const status = String(value || "").toLowerCase();
  if (["success", "successful", "completed"].includes(status)) return "success";
  if (["failed", "failure"].includes(status)) return "failed";
  if (["cancelled", "canceled", "abandoned"].includes(status)) return "cancelled";
  return null;
}

function paystackEnvironment(secret: string): 'test' | 'live' {
  if (secret.startsWith('sk_live_')) return 'live';
  if (secret.startsWith('sk_test_')) return 'test';
  throw new Error('Unsupported Paystack secret format');
}

async function verifyPaystack(req: Request, raw: string, payload: Record<string, unknown>): Promise<VerifiedEvent> {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  const signature = req.headers.get("x-paystack-signature");
  if (!secret) throw new WebhookError("Paystack webhook secret is not configured", 503);
  if (!signature || !equalConstantTime(await hmacHex("SHA-512", secret, raw), signature.toLowerCase())) {
    throw new WebhookError("Invalid Paystack signature", 401);
  }
  let providerEnvironment: 'test' | 'live';
  try {
    providerEnvironment = paystackEnvironment(secret);
  } catch {
    throw new WebhookError("Paystack webhook secret configuration is invalid", 503);
  }
  // Paystack sends other event types to the same endpoint. Acknowledge signed
  // events we do not process so the provider does not retry them forever.
  if (payload.event !== "charge.success") throw new WebhookError("Ignored Paystack event", 202);
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data || (typeof data.reference !== 'string' && typeof data.reference !== 'number') || !String(data.reference).trim() || (typeof data.id !== 'string' && typeof data.id !== 'number') || !String(data.id).trim()) {
    throw new WebhookError("Invalid Paystack payload", 400);
  }
  // A valid signature proves origin, but Paystack also requires transaction
  // verification before value is delivered. Use the verified API response,
  // never the webhook's amount/status as the authority.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let verification: Response;
  try {
    verification = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(String(data.reference))}`, {
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch {
    throw new WebhookError("Paystack verification is temporarily unavailable", 503);
  } finally {
    clearTimeout(timeout);
  }
  if (!verification.ok) {
    // A provider outage, rate limit, or invalid secret must be retried and
    // surfaced in the function logs, never acknowledged as a bad webhook.
    console.error("Paystack verification API returned an error", { status: verification.status });
    throw new WebhookError("Paystack verification is temporarily unavailable", 503);
  }
  let verified: { status?: boolean; data?: Record<string, unknown> };
  try {
    verified = await verification.json() as { status?: boolean; data?: Record<string, unknown> };
  } catch {
    throw new WebhookError("Paystack returned an invalid verification response", 503);
  }
  const verifiedData = verified.data;
  const amount = Number(verifiedData?.amount);
  const status = statusFromProvider(verifiedData?.status);
  if (!verified.status || !verifiedData) throw new WebhookError("Paystack has not confirmed this transaction yet", 503);
  if (String(verifiedData.reference) !== String(data.reference) || String(verifiedData.id) !== String(data.id)) {
    throw new WebhookError("Paystack transaction identifiers did not match", 400);
  }
  const currency = String(verifiedData.currency || "").toUpperCase();
  if (!Number.isSafeInteger(amount) || amount <= 0 || currency !== "GHS") {
    throw new WebhookError("Paystack transaction amount or currency is invalid", 400);
  }
  if (status !== "success") throw new WebhookError("Paystack has not confirmed a successful transaction yet", 503);
  return { provider: "paystack", eventId: String(verifiedData.id), paymentReference: String(verifiedData.reference), providerReference: String(verifiedData.id), status, amount: amount / 100, currency, payload, providerEnvironment };
}

async function verifyFlutterwave(req: Request, payload: Record<string, unknown>): Promise<VerifiedEvent> {
  const secretHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_SECRET_HASH");
  const signature = req.headers.get("verif-hash");
  if (!secretHash) throw new WebhookError("Flutterwave webhook secret is not configured", 503);
  if (!signature || !equalConstantTime(secretHash, signature)) throw new WebhookError("Invalid Flutterwave signature", 401);
  const data = payload.data as Record<string, unknown> | undefined;
  const amount = Number(data?.amount);
  const status = statusFromProvider(data?.status);
  if (!data?.tx_ref || !data?.id || !Number.isFinite(amount) || !status) throw new WebhookError("Invalid Flutterwave payload", 400);
  return { provider: "flutterwave", eventId: String(data.id), paymentReference: String(data.tx_ref), providerReference: String(data.flw_ref || data.id), status, amount, currency: String(data.currency || "GHS"), payload };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid webhook payload" }, 400);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "Invalid webhook payload" }, 400);
    const hasPaystackSignature = Boolean(req.headers.get("x-paystack-signature"));
    const hasFlutterwaveSignature = Boolean(req.headers.get("verif-hash"));
    if (hasPaystackSignature === hasFlutterwaveSignature) return json({ error: "Missing or ambiguous provider signature" }, 401);
    let event: VerifiedEvent;
    if (hasPaystackSignature) {
      event = await verifyPaystack(req, raw, payload);
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) throw new WebhookError("Payment webhook database access is not configured", 503);
      const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await supabase.rpc("apply_verified_paystack_webhook", {
        p_provider_event_id: event.eventId,
        p_payload_hash: await sha256Hex(raw),
        p_payment_reference: event.paymentReference,
        p_provider_reference: event.providerReference,
        p_status: event.status,
        p_amount: event.amount,
        p_currency: event.currency,
        p_provider_environment: event.providerEnvironment,
        p_signature: req.headers.get("x-paystack-signature"),
        p_payload: event.payload,
      });
      if (error) {
        console.error("Verified Paystack webhook could not be applied", { code: error.code || "unknown" });
        throw new WebhookError("Webhook processing is temporarily unavailable", 503);
      }
      return json({ accepted: true, result: data }, 200);
    }
    event = await verifyFlutterwave(req, payload);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new WebhookError("Payment webhook database access is not configured", 503);
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data, error } = await supabase.rpc("apply_verified_payment_webhook", {
      p_provider: event.provider,
      p_provider_event_id: event.eventId,
      p_payload_hash: await sha256Hex(raw),
      p_payment_reference: event.paymentReference,
      p_provider_reference: event.providerReference,
      p_status: event.status,
      p_amount: event.amount,
      p_currency: event.currency,
      p_payload: event.payload,
    });
    if (error) {
      console.error("Verified payment webhook could not be applied", { code: error.code || "unknown" });
      throw new WebhookError("Webhook processing is temporarily unavailable", 503);
    }
    return json({ accepted: true, result: data }, 200);
  } catch (error) {
    if (error instanceof WebhookError && error.status === 202) return json({ accepted: true, ignored: true }, 200);
    const status = error instanceof WebhookError ? error.status : 503;
    console.error("Payment webhook processing failed", { status, message: error instanceof Error ? error.message : "unknown error" });
    return json({ error: status === 503 ? "Payment processing is temporarily unavailable" : "Webhook could not be verified" }, status);
  }
});
