import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireInternalRequest } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authFailure = requireInternalRequest(req);
  if (authFailure) return authFailure;

  try {
    const { recipientId, title, body, actionUrl, eventType } = await req.json();

    if (!recipientId || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields: recipientId, title, body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vapidSubject = Deno.env.get("VAPID_SUBJECT");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

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
    let sentCount = 0;
    let failedCount = 0;

    for (const sub of subs) {
      try {
        const pushPayload = JSON.stringify({
          title,
          body,
          url: actionUrl || "/dashboard/notifications",
          icon: "/icon.svg",
          badge: "/icon.svg",
          tag: eventType || "notification",
        });

        await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "TTL": "86400",
          },
          body: pushPayload,
        });
        sentCount++;
      } catch {
        failedCount++;
      }
    }

    await supabase.from("communication_logs").insert({
      event_type: eventType || "push",
      channel: "push",
      recipient_id: recipientId,
      status: sentCount > 0 ? "sent" : "failed",
      provider,
    });

    return new Response(JSON.stringify({
      success: sentCount > 0,
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
