import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireInternalRequest } from "../_shared/internal-auth.ts";
import { outboundProvidersEnabled, providersDisabledResponse } from "../_shared/provider-mode.ts";

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
  if (!outboundProvidersEnabled()) return providersDisabledResponse();

  try {
    const { to, templateKey, variables, recipientId } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing required field: to" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!whatsappToken || !phoneNumberId) {
      return new Response(JSON.stringify({
        success: false,
        error: "WhatsApp provider not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
        provider: null,
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const messageBody = templateKey || "UniEco Ghana notification";
    const provider = "whatsapp_cloud_api";

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${whatsappToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: messageBody },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({
        success: false,
        error: `WhatsApp API error: ${errText}`,
        provider,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const providerReference = data.messages?.[0]?.id || null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.from("communication_logs").insert({
      event_type: templateKey || "whatsapp",
      channel: "whatsapp",
      recipient_id: recipientId || null,
      recipient_identifier: to,
      status: "sent",
      provider,
      provider_reference: providerReference,
    });

    return new Response(JSON.stringify({ success: true, provider, providerReference }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
