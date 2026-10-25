import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { requireInternalRequest } from "../_shared/internal-auth.ts";
import { outboundProvidersEnabled, providersDisabledResponse } from "../_shared/provider-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function normalizeVapidKey(value: string | undefined, expectedBytes: number, publicKey = false): string | null {
  if (!value) return null;
  let key = value.trim().replace(/^['"`]|['"`]$/g, '');
  const label = publicKey ? '(?:vapid[_ -]?public[_ -]?key|public\\s+key)' : '(?:vapid[_ -]?private[_ -]?key|private\\s+key)';
  const labeled = key.match(new RegExp(`${label}\\s*[:=]\\s*([A-Za-z0-9+/_-]+={0,2})`, 'i'));
  if (labeled?.[1]) key = labeled[1];
  key = key.replace(/\s+/g, '');
  if (!key || key.includes('BEGIN') || key.includes('END')) return null;

  try {
    const padding = '='.repeat((4 - (key.length % 4)) % 4);
    const decoded = atob((key + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    if (bytes.length !== expectedBytes || (publicKey && bytes[0] !== 4)) return null;
    let normalized = '';
    for (const byte of bytes) normalized += String.fromCharCode(byte);
    return btoa(normalized).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET") {
    // The VAPID public key is intentionally public; only POST delivery needs
    // the internal secret. Returning it here keeps browser subscription setup
    // aligned with the key used by this sender.
    const vapidPublicKey = normalizeVapidKey(Deno.env.get("VAPID_PUBLIC_KEY"), 65, true);
    if (!vapidPublicKey) {
      return new Response(JSON.stringify({ error: "Push provider not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ publicKey: vapidPublicKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authFailure = requireInternalRequest(req);
  if (authFailure) return authFailure;
  if (!outboundProvidersEnabled()) return providersDisabledResponse();

  try {
    const { recipientId, title, body, actionUrl, eventType } = await req.json();

    if (!recipientId || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields: recipientId, title, body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vapidSubject = Deno.env.get("VAPID_SUBJECT")?.trim();
    const vapidPublicKey = normalizeVapidKey(Deno.env.get("VAPID_PUBLIC_KEY"), 65, true);
    const vapidPrivateKey = normalizeVapidKey(Deno.env.get("VAPID_PRIVATE_KEY"), 32);

    if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({
        success: false,
        error: "Push provider not configured. Set VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY.",
        provider: null,
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", recipientId)
      .eq("is_active", true);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "No active push subscriptions for this user.",
        provider: "web_push",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const provider = "web_push";
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    let sentCount = 0;
    let failedCount = 0;
    let lastFailure: string | null = null;

    for (const sub of subs) {
      try {
        const pushPayload = JSON.stringify({
          title,
          body,
          url: actionUrl || "/dashboard/notifications",
          icon: "/UniEco%20Ghana%20Logo%20(No%20Background)paystack.png",
          badge: "/UniEco%20Ghana%20Logo%20(No%20Background)paystack.png",
          tag: eventType || "notification",
        });

        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        }, pushPayload, {
          TTL: 86400,
        });
        sentCount++;
      } catch (error) {
        failedCount++;
        const statusCode = (error as { statusCode?: number })?.statusCode;
        lastFailure = describePushFailure(statusCode);
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").update({ is_active: false }).eq("id", sub.id);
        }
      }
    }

    await supabase.from("communication_logs").insert({
      event_type: eventType || "push",
      channel: "push",
      recipient_id: recipientId,
      status: sentCount > 0 ? "sent" : "failed",
      provider,
      error_message: sentCount > 0 ? null : lastFailure,
    });

    return new Response(JSON.stringify({
      success: sentCount > 0,
      error: sentCount > 0 ? undefined : lastFailure || "Push provider rejected delivery.",
      provider,
      providerReference: `push_${Date.now()}`,
      sentCount,
      failedCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Push send error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function describePushFailure(statusCode?: number): string {
  if (statusCode === 400) return "Push provider rejected the subscription. Refresh this device connection.";
  if (statusCode === 401) return "Push provider rejected the VAPID credentials. Refresh this device connection.";
  if (statusCode === 404 || statusCode === 410) return "This device subscription has expired. Refresh this device connection.";
  if (statusCode === 429) return "Push provider rate limit reached. Try again shortly.";
  return statusCode ? `Push provider delivery failed (HTTP ${statusCode}).` : "Push provider delivery failed.";
}
