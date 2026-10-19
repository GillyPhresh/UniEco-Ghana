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
    const { to, subject, body, eventType, eventId, recipientId, metadata = {} } = await req.json();

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rendered = renderEmail({
      subject,
      body,
      eventType,
      metadata: metadata as Record<string, unknown>,
    });

    // Determine which provider is configured
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");

    let provider: string | null = null;
    let providerReference: string | null = null;

    // Try Resend
    if (resendKey) {
      provider = "resend";
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || Deno.env.get("EMAIL_FROM_ADDRESS") || "UniEco Ghana <noreply@uniecoghana.com>";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          ...(eventId ? { "Idempotency-Key": `unieco-email-${eventId}` } : {}),
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html: rendered.html,
          text: rendered.text,
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
      const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "noreply@uniecoghana.com";
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
          htmlContent: rendered.html,
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
      const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "noreply@uniecoghana.com";

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
          content: [{ type: "text/html", value: rendered.html }, { type: "text/plain", value: rendered.text }],
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

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderEmail(input: {
  subject: string;
  body: string;
  eventType?: string;
  metadata: Record<string, unknown>;
}): { html: string; text: string } {
  const meta = input.metadata;
  const name = escapeHtml(meta.name || 'there');
  const actionUrl = typeof meta.action_url === 'string' ? meta.action_url : 'https://uniecoghana.com';
  const template = typeof meta.template === 'string' ? meta.template : input.eventType;
  const amount = meta.amount !== undefined ? `${escapeHtml(meta.amount)} ${escapeHtml(meta.currency || 'GHS')}` : '';
  const reference = meta.payment_reference ? `<p style="color:#64748b;font-size:13px">Reference: ${escapeHtml(meta.payment_reference)}</p>` : '';
  let heading = escapeHtml(input.subject);
  let copy = `<p>${escapeHtml(input.body)}</p>`;
  let button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open UniEco Ghana</a>`;

  if (template === 'registration_welcome') {
    heading = 'Welcome to UniEco Ghana';
    copy = `<p>Hi ${name},</p><p>Congratulations! Your UniEco Ghana account has been created successfully.</p><p>Complete your registration to discover campus businesses, opportunities, events, and services built for Ghana’s university community.</p>`;
    button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Continue registration</a>`;
  } else if (template === 'payment_receipt') {
    heading = 'Payment received';
    copy = `<p>Hi ${name},</p><p>We have received your payment of <strong>${amount}</strong>.</p>${reference}<p>Thank you for using UniEco Ghana.</p>`;
  } else if (template === 'payment_failed') {
    heading = 'Payment update';
    copy = `<p>Hi ${name},</p><p>We could not complete your payment${amount ? ` of <strong>${amount}</strong>` : ''}.</p>${reference}<p>Please try again from your UniEco Ghana account. If money was deducted, contact support and include the reference above.</p>`;
  } else if (template === 'payment_refunded') {
    heading = 'Payment refunded';
    copy = `<p>Hi ${name},</p><p>Your payment${amount ? ` of <strong>${amount}</strong>` : ''} has been refunded.</p>${reference}<p>Thank you for your patience.</p>`;
  } else if (template === 'referral_link_ready') {
    const referralLink = typeof meta.referral_link === 'string' ? escapeHtml(meta.referral_link) : actionUrl;
    const rewardAmount = escapeHtml(meta.reward_amount || '2');
    heading = 'Your UniEco referral link is ready';
    copy = `<p>Hi ${name},</p><p>Share your unique UniEco Ghana link with genuine students. You can earn <strong>GH₵${rewardAmount}</strong> for each eligible registration after payment and student verification.</p><p style="word-break:break-all;background:#f1f5f9;padding:12px;border-radius:8px;font-size:13px">${referralLink}</p>`;
    button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open my referral dashboard</a>`;
  } else if (template === 'invoice_issued' || template === 'invoice_paid') {
    const invoice = escapeHtml(meta.invoice_number || 'your invoice');
    heading = template === 'invoice_paid' ? 'Invoice paid' : 'Your invoice is ready';
    copy = `<p>Hi ${name},</p><p>${template === 'invoice_paid' ? `Invoice <strong>${invoice}</strong> has been paid.` : `Invoice <strong>${invoice}</strong> has been issued${amount ? ` for <strong>${amount}</strong>` : ''}.`}</p><p>Keep this email for your records.</p>`;
  } else if (template === 'admin_broadcast') {
    heading = escapeHtml(input.subject);
    copy = `<p>Hi ${name},</p><div style="white-space:pre-wrap">${escapeHtml(meta.body || input.body)}</div>`;
  }

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:28px 16px"><div style="background:#064e3b;border-radius:16px 16px 0 0;padding:22px 28px;color:#fff"><div style="font-size:20px;font-weight:700">UniEco Ghana</div><div style="font-size:12px;color:#a7f3d0;margin-top:4px">Connecting Ghana's university community</div></div><div style="background:#fff;padding:30px 28px;border-radius:0 0 16px 16px;box-shadow:0 4px 16px rgba(15,23,42,.08)"><h1 style="font-size:24px;margin:0 0 18px;color:#064e3b">${heading}</h1>${copy}<div style="margin:26px 0">${button}</div><p style="color:#64748b;font-size:13px;margin-top:28px">You received this important account or service message from UniEco Ghana.</p></div><p style="text-align:center;color:#64748b;font-size:12px;margin:16px">© UniEco Ghana · <a href="https://uniecoghana.com" style="color:#059669">uniecoghana.com</a></p></div></body></html>`;
  const text = input.body;
  return { html, text };
}
