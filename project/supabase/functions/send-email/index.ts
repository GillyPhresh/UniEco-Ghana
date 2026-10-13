import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireInternalRequest } from "../_shared/internal-auth.ts";
import { outboundProvidersEnabled, providersDisabledResponse } from "../_shared/provider-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Email Sending Edge Function
 *
 * Provider abstraction for email delivery. Supports:
 * - Resend (RESEND_API_KEY)
 * - Brevo / Sendinblue (BREVO_API_KEY)
 * - SendGrid (SENDGRID_API_KEY)
 *
 * The active provider is determined by which API key env var is set.
 * If no provider is configured, the function returns a safe fallback
 * (success: false, error: "Email provider not configured") so the
 * calling code can handle the gracefully.
 *
 * SECURITY:
 * - API keys are server-side only (Deno.env), never exposed to client
 * - Recipient email is validated server-side
 * - All sends are logged to communication_logs (metadata only, no body)
 */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authFailure = requireInternalRequest(req);
  if (authFailure) return authFailure;
  if (!outboundProvidersEnabled()) return providersDisabledResponse();

  try {
    const { to, subject, body, eventType, recipientId, metadata } = await req.json();

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which provider is configured
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");

    let provider: string | null = null;
    let providerReference: string | null = null;

    // Try Resend
    if (resendKey) {
      provider = "resend";
      const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "noreply@unieco.gh";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html: body,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        providerReference = data.id || null;
      } else {
        const errText = await response.text();
        return new Response(JSON.stringify({
          success: false,
          error: `Resend error: ${errText}`,
          provider,
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Try Brevo
    else if (brevoKey) {
      provider = "brevo";
      const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "noreply@unieco.gh";
      const fromName = Deno.env.get("EMAIL_FROM_NAME") || "UniEco Ghana";

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: to }],
          subject,
          htmlContent: body,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        providerReference = data.messageId || null;
      } else {
        const errText = await response.text();
        return new Response(JSON.stringify({
          success: false,
          error: `Brevo error: ${errText}`,
          provider,
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Try SendGrid
    else if (sendgridKey) {
      provider = "sendgrid";
      const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "noreply@unieco.gh";

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail },
          subject,
          content: [{ type: "text/html", value: body }],
        }),
      });

      if (response.ok) {
        providerReference = response.headers.get("x-message-id") || null;
      } else {
        const errText = await response.text();
        return new Response(JSON.stringify({
          success: false,
          error: `SendGrid error: ${errText}`,
          provider,
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // No provider configured — safe fallback
    else {
      return new Response(JSON.stringify({
        success: false,
        error: "Email provider not configured. Set RESEND_API_KEY, BREVO_API_KEY, or SENDGRID_API_KEY.",
        provider: null,
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log to communication_logs (metadata only — no message content)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.from("communication_logs").insert({
      event_type: eventType || "email",
      channel: "email",
      recipient_id: recipientId || null,
      recipient_identifier: to,
      status: "sent",
      provider,
      provider_reference: providerReference,
    });

    return new Response(JSON.stringify({
      success: true,
      provider,
      providerReference,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Email send error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
