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
    const { to, message, recipientId } = await req.json();

    if (!to || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hubtelClientId = Deno.env.get("HUBTEL_CLIENT_ID");
    const hubtelSecret = Deno.env.get("HUBTEL_CLIENT_SECRET");
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER");

    let provider: string | null = null;
    let providerReference: string | null = null;

    if (hubtelClientId && hubtelSecret) {
      provider = "hubtel";
      const basicAuth = btoa(`${hubtelClientId}:${hubtelSecret}`);

      const response = await fetch(
        `https://api.smsgh.com/v3/messages/send?from=UniEco&to=${encodeURIComponent(to)}&content=${encodeURIComponent(message)}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${basicAuth}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        providerReference = data.messageId || data.id || null;
      } else {
        const errText = await response.text();
        return new Response(JSON.stringify({
          success: false, error: `Hubtel error: ${errText}`, provider,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else if (twilioSid && twilioToken && twilioFrom) {
      provider = "twilio";

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: twilioFrom,
            To: to,
            Body: message,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        providerReference = data.sid || null;
      } else {
        const errText = await response.text();
        return new Response(JSON.stringify({
          success: false, error: `Twilio error: ${errText}`, provider,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: "SMS provider not configured. Set HUBTEL_CLIENT_ID and HUBTEL_CLIENT_SECRET, or TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
        provider: null,
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.from("communication_logs").insert({
      event_type: "sms",
      channel: "sms",
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
    console.error("SMS send error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
