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
};

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

async function verifyPaystack(req: Request, raw: string, payload: Record<string, unknown>): Promise<VerifiedEvent> {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  const signature = req.headers.get("x-paystack-signature");
  if (!secret || !signature || !equalConstantTime(await hmacHex("SHA-512", secret, raw), signature.toLowerCase())) throw new Error("Invalid Paystack signature");
  if (payload.event !== "charge.success" && payload.event !== "charge.failed") throw new Error("Unsupported Paystack event");
  const data = payload.data as Record<string, unknown> | undefined;
  const amount = Number(data?.amount);
  const status = statusFromProvider(data?.status);
  if (!data?.reference || !data?.id || !Number.isFinite(amount) || !status) throw new Error("Invalid Paystack payload");
  return { provider: "paystack", eventId: String(data.id), paymentReference: String(data.reference), providerReference: String(data.id), status, amount: amount / 100, currency: String(data.currency || "GHS"), payload };
}

async function verifyFlutterwave(req: Request, payload: Record<string, unknown>): Promise<VerifiedEvent> {
  const secretHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_SECRET_HASH");
  const signature = req.headers.get("verif-hash");
  if (!secretHash || !signature || !equalConstantTime(secretHash, signature)) throw new Error("Invalid Flutterwave signature");
  const data = payload.data as Record<string, unknown> | undefined;
  const amount = Number(data?.amount);
  const status = statusFromProvider(data?.status);
  if (!data?.tx_ref || !data?.id || !Number.isFinite(amount) || !status) throw new Error("Invalid Flutterwave payload");
  return { provider: "flutterwave", eventId: String(data.id), paymentReference: String(data.tx_ref), providerReference: String(data.flw_ref || data.id), status, amount, currency: String(data.currency || "GHS"), payload };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.text();
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const hasPaystackSignature = Boolean(req.headers.get("x-paystack-signature"));
    const hasFlutterwaveSignature = Boolean(req.headers.get("verif-hash"));
    if (hasPaystackSignature === hasFlutterwaveSignature) return json({ error: "Missing or ambiguous provider signature" }, 400);
    let event: VerifiedEvent;
    if (hasPaystackSignature) event = await verifyPaystack(req, raw, payload);
    else event = await verifyFlutterwave(req, payload);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
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
      console.error("Verified payment webhook rejected", error.message);
      return json({ error: "Webhook could not be applied" }, 422);
    }
    return json({ accepted: true, result: data }, 200);
  } catch (error) {
    console.error("Payment webhook rejected", error instanceof Error ? error.message : "Invalid webhook");
    return json({ error: "Invalid webhook" }, 400);
  }
});
