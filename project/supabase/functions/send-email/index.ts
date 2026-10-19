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
  const paymentReference = typeof meta.payment_reference === 'string' ? meta.payment_reference : '';
  const reference = paymentReference ? `<p style="color:#64748b;font-size:13px">Reference: ${escapeHtml(paymentReference)}</p>` : '';
  const paymentPurpose = typeof meta.payment_type === 'string'
    ? meta.payment_type.replaceAll('_', ' ')
    : typeof meta.purpose === 'string' ? meta.purpose.replaceAll('_', ' ') : 'UniEco Ghana payment';
  let heading = escapeHtml(input.subject);
  let copy = `<p>${escapeHtml(input.body)}</p>`;
  let button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open UniEco Ghana</a>`;
  let plainText = input.body;

  if (template === 'registration_welcome') {
    heading = 'Welcome to UniEco Ghana';
    copy = `<p>Hi ${name},</p><p>Congratulations! Your UniEco Ghana account has been created successfully.</p><p>Complete your registration to discover campus businesses, opportunities, events, and services built for Ghana’s university community.</p>`;
    button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Continue registration</a>`;
  } else if (template === 'payment_receipt') {
    heading = 'Payment receipt';
    copy = `<p style="margin:0 0 22px;color:#475569">Hi ${name},</p><div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:14px;padding:20px;margin-bottom:24px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#15803d;font-weight:700">Payment successful</div><div style="font-size:30px;line-height:1.2;color:#064e3b;font-weight:800;margin-top:8px">${amount}</div><div style="font-size:13px;color:#166534;margin-top:6px">Thank you. Your payment has been securely recorded.</div></div><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0">Payment type</td><td style="padding:10px 0;text-align:right;color:#0f172a;border-bottom:1px solid #e2e8f0;text-transform:capitalize">${escapeHtml(paymentPurpose)}</td></tr><tr><td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0">Payment reference</td><td style="padding:10px 0;text-align:right;color:#0f172a;border-bottom:1px solid #e2e8f0;word-break:break-all">${escapeHtml(paymentReference || 'Available in your dashboard')}</td></tr><tr><td style="padding:10px 0;color:#64748b">Payment provider</td><td style="padding:10px 0;text-align:right;color:#0f172a">Paystack</td></tr></table><p style="margin:24px 0 0;color:#475569;font-size:14px">Keep this email for your records. You can view your payment history and account status from your UniEco Ghana dashboard.</p>`;
    button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:13px 22px;border-radius:9px;text-decoration:none;font-weight:700">View payment history</a>`;
    plainText = `Payment receipt\n\nHi ${String(meta.name || 'there')},\n\nPayment successful\nAmount: ${String(meta.amount ?? '')} ${String(meta.currency || 'GHS')}\nPayment type: ${paymentPurpose}\nReference: ${paymentReference || 'Available in your dashboard'}\nProvider: Paystack\n\nKeep this email for your records. View your payment history at ${actionUrl}.`;
  } else if (template === 'payment_failed') {
    heading = 'Payment update';
    copy = `<p style="margin:0 0 22px;color:#475569">Hi ${name},</p><div style="border:1px solid #fed7aa;background:#fff7ed;border-radius:14px;padding:20px;margin-bottom:24px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c2410c;font-weight:700">Payment not completed</div><p style="margin:8px 0 0;color:#7c2d12;font-size:14px">We could not complete your payment${amount ? ` of <strong>${amount}</strong>` : ''}.</p></div>${reference}<p style="color:#475569;font-size:14px">Please return to UniEco Ghana and try again. If your account was charged, do not pay again immediately—contact support with the payment reference so we can verify it.</p>`;
    button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:13px 22px;border-radius:9px;text-decoration:none;font-weight:700">Review payment</a>`;
    plainText = `Payment update\n\nHi ${String(meta.name || 'there')},\n\nYour payment${meta.amount !== undefined ? ` of ${String(meta.amount)} ${String(meta.currency || 'GHS')}` : ''} was not completed.\nReference: ${paymentReference || 'Not available'}\n\nPlease return to UniEco Ghana and try again. If your account was charged, contact support with the reference.\n${actionUrl}`;
  } else if (template === 'payment_refunded') {
    heading = 'Payment refunded';
    copy = `<p style="margin:0 0 22px;color:#475569">Hi ${name},</p><div style="border:1px solid #bae6fd;background:#f0f9ff;border-radius:14px;padding:20px;margin-bottom:24px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0369a1;font-weight:700">Refund recorded</div><div style="font-size:26px;line-height:1.2;color:#0c4a6e;font-weight:800;margin-top:8px">${amount || 'Your payment'}</div><div style="font-size:13px;color:#075985;margin-top:6px">The refund status has been recorded securely.</div></div>${reference}<p style="color:#475569;font-size:14px">Please allow your payment provider’s normal processing time for the funds to appear. Contact support if you need help.</p>`;
    button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:13px 22px;border-radius:9px;text-decoration:none;font-weight:700">View payment history</a>`;
    plainText = `Payment refunded\n\nHi ${String(meta.name || 'there')},\n\nYour payment${meta.amount !== undefined ? ` of ${String(meta.amount)} ${String(meta.currency || 'GHS')}` : ''} has been refunded.\nReference: ${paymentReference || 'Available in your dashboard'}\n\nPlease allow your payment provider's normal processing time.\n${actionUrl}`;
  } else if (template === 'referral_link_ready') {
    const referralLink = typeof meta.referral_link === 'string' ? escapeHtml(meta.referral_link) : actionUrl;
    const rewardAmount = escapeHtml(meta.reward_amount || '2');
    heading = 'Your UniEco referral link is ready';
    copy = `<p>Hi ${name},</p><p>Share your unique UniEco Ghana link with genuine students. You can earn <strong>GH₵${rewardAmount}</strong> for each eligible registration after payment and student verification.</p><p style="word-break:break-all;background:#f1f5f9;padding:12px;border-radius:8px;font-size:13px">${referralLink}</p>`;
    button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open my referral dashboard</a>`;
  } else if (template === 'institution_admin_invitation') {
    const institutionName = escapeHtml(meta.institution_name || 'your institution');
    const inviteUrl = typeof meta.invite_url === 'string' ? meta.invite_url : actionUrl;
    const expiresAt = meta.expires_at ? escapeHtml(new Date(String(meta.expires_at)).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })) : 'the stated expiry time';
    heading = 'Institution administrator invitation';
    copy = `<p>Hi ${name},</p><p>You have been appointed to manage <strong>${institutionName}</strong> on UniEco Ghana.</p><div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:14px;padding:18px;margin:20px 0"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#15803d;font-weight:700">Your access will include</div><p style="margin:8px 0 0;color:#166534;font-size:14px">Posting and managing institution-focused content, announcements, events, and other approved campus updates within this institution only.</p></div><p>This secure invitation expires on <strong>${expiresAt}</strong>. You must create or sign in to a UniEco Ghana account using this invited email address before access is granted.</p>`;
    button = `<a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:13px 22px;border-radius:9px;text-decoration:none;font-weight:700">Accept institution invitation</a>`;
    plainText = `Institution administrator invitation\n\nHi ${String(meta.name || 'there')},\n\nYou have been appointed to manage ${String(meta.institution_name || 'your institution')} on UniEco Ghana.\n\nYour access is limited to posting and managing approved institution content for that institution.\n\nAccept the invitation: ${inviteUrl}\n\nThis invitation expires on ${String(meta.expires_at || 'the stated expiry time')}. Use the invited email address when creating or signing in to your UniEco Ghana account.`;
  } else if (template === 'managing_director_appointment') {
    heading = 'Congratulations on your appointment';
    copy = `<div style="border-bottom:4px solid #f5b335;padding:0 0 18px;margin-bottom:24px"><img src="https://uniecoghana.com/UniEco%20Ghana%20Logo%20(No%20Background)paystack.png" alt="UniEco Ghana" width="150" style="display:block;width:150px;height:auto;margin-bottom:12px"><div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#047857;font-weight:700">Connecting Students, Businesses &amp; Opportunities</div><div style="font-size:12px;color:#64748b;margin-top:4px">Your Campus. Your Marketplace. Your Community.</div></div><p style="margin:0 0 18px;color:#334155">Dear <strong>${name}</strong>,</p><p style="color:#334155;line-height:1.7">On behalf of UniEco Ghana, we are delighted to congratulate you on your appointment as <strong>Managing Director of UniEco Ghana</strong>.</p><div style="border-left:4px solid #10b981;background:#f0fdf4;padding:16px 18px;margin:22px 0;color:#064e3b;line-height:1.7"><strong>A national leadership opportunity</strong><br>We believe your leadership, integrity, and vision will help UniEco Ghana connect students, businesses, tertiary institutions, and communities across Ghana.</div><p style="color:#334155;line-height:1.7">This appointment is both a great professional opportunity and a meaningful opportunity to contribute to Ghana’s digital transformation, youth development, entrepreneurship, and inclusive economic growth.</p><p style="color:#334155;line-height:1.7">We look forward to your guidance as we build a trusted platform that creates practical value for people and institutions throughout the country.</p><p style="color:#334155;line-height:1.7;margin-bottom:0">Please accept our warmest congratulations and best wishes as you begin this important national assignment.</p><div style="margin-top:26px;padding-top:18px;border-top:1px solid #e2e8f0;color:#475569;font-size:14px;line-height:1.6"><strong style="color:#064e3b">Yours faithfully,</strong><br>The Management<br><strong style="color:#064e3b">UniEco Ghana</strong></div>`;
    button = `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:13px 22px;border-radius:9px;text-decoration:none;font-weight:700">Visit UniEco Ghana</a>`;
    plainText = `UNIECO GHANA\nConnecting Students, Businesses & Opportunities\nYour Campus. Your Marketplace. Your Community.\n\nDear ${String(meta.name || 'Gilbert Asare Marfo')},\n\nOn behalf of UniEco Ghana, we are delighted to congratulate you on your appointment as Managing Director of UniEco Ghana.\n\nWe believe your leadership, integrity, and vision will help UniEco Ghana connect students, businesses, tertiary institutions, and communities across Ghana.\n\nThis appointment is both a great professional opportunity and a meaningful opportunity to contribute to Ghana's digital transformation, youth development, entrepreneurship, and inclusive economic growth.\n\nWe look forward to your guidance as we build a trusted platform that creates practical value for people and institutions throughout the country.\n\nPlease accept our warmest congratulations and best wishes as you begin this important national assignment.\n\nYours faithfully,\nThe Management\nUniEco Ghana\n\n${actionUrl}`;
  } else if (template === 'invoice_issued' || template === 'invoice_paid') {
    const invoice = escapeHtml(meta.invoice_number || 'your invoice');
    heading = template === 'invoice_paid' ? 'Invoice paid' : 'Your invoice is ready';
    copy = `<p>Hi ${name},</p><p>${template === 'invoice_paid' ? `Invoice <strong>${invoice}</strong> has been paid.` : `Invoice <strong>${invoice}</strong> has been issued${amount ? ` for <strong>${amount}</strong>` : ''}.`}</p><p>Keep this email for your records.</p>`;
  } else if (template === 'admin_broadcast') {
    heading = escapeHtml(input.subject);
    copy = `<p>Hi ${name},</p><div style="white-space:pre-wrap">${escapeHtml(meta.body || input.body)}</div>`;
  }

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:28px 16px"><div style="background:#064e3b;border-radius:16px 16px 0 0;padding:22px 28px;color:#fff"><div style="font-size:20px;font-weight:700">UniEco Ghana</div><div style="font-size:12px;color:#a7f3d0;margin-top:4px">Connecting Ghana's university community</div></div><div style="background:#fff;padding:30px 28px;border-radius:0 0 16px 16px;box-shadow:0 4px 16px rgba(15,23,42,.08)"><h1 style="font-size:24px;margin:0 0 18px;color:#064e3b">${heading}</h1>${copy}<div style="margin:26px 0">${button}</div><p style="color:#64748b;font-size:13px;margin-top:28px">You received this important account or service message from UniEco Ghana.</p></div><p style="text-align:center;color:#64748b;font-size:12px;margin:16px">© UniEco Ghana · <a href="https://uniecoghana.com" style="color:#059669">uniecoghana.com</a></p></div></body></html>`;
  const text = plainText;
  return { html, text };
}
