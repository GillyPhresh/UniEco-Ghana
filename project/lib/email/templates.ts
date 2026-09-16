/**
 * UniEco Ghana — Email Template Reference
 *
 * These templates define the content for transactional emails sent by the
 * platform. In production, these would be configured in the Supabase Auth
 * email templates settings or sent via an edge function with an email
 * provider. The structure and copy are defined here so they can be
 * implemented when the email provider is connected.
 *
 * All copy uses human-friendly language — no robotic or AI-generated tone.
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export const emailTemplates = {
  welcome: (name: string): EmailTemplate => ({
    subject: `Welcome to UniEco Ghana, ${name}!`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #10b981; font-size: 24px;">Welcome to UniEco Ghana!</h1>
        <p>Hi ${name},</p>
        <p>Your account has been created. You are now part of a growing community
        connecting students, businesses, and opportunities across Ghana.</p>
        <p>Here is what you can do next:</p>
        <ul>
          <li>Complete your profile to help others find you</li>
          <li>Browse businesses on your campus</li>
          <li>Discover campus events</li>
        </ul>
        <a href="https://unieco.gh/profile"
           style="display: inline-block; background: #10b981; color: #fff;
                  padding: 12px 24px; border-radius: 8px; text-decoration: none;
                  margin-top: 16px;">
          Complete your profile
        </a>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          Welcome aboard!<br />The UniEco Ghana Team
        </p>
      </div>
    `,
    text: `Welcome to UniEco Ghana, ${name}!\n\nYour account has been created. Complete your profile at https://unieco.gh/profile to get started.\n\nWelcome aboard!\nThe UniEco Ghana Team`,
  }),

  emailVerification: (name: string, link: string): EmailTemplate => ({
    subject: `Verify your email address`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #10b981; font-size: 24px;">Verify your email</h1>
        <p>Hi ${name},</p>
        <p>Click the button below to verify your email address. This link expires
        in 24 hours.</p>
        <a href="${link}"
           style="display: inline-block; background: #10b981; color: #fff;
                  padding: 12px 24px; border-radius: 8px; text-decoration: none;
                  margin-top: 16px;">
          Verify my email
        </a>
        <p style="color: #666; font-size: 14px; margin-top: 16px;">
          If you did not create an account, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Verify your email\n\nHi ${name},\n\nClick this link to verify your email: ${link}\n\nIf you did not create an account, you can safely ignore this email.`,
  }),

  approvalNotification: (name: string, accountType: string): EmailTemplate => ({
    subject: `Your ${accountType} account has been approved!`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #10b981; font-size: 24px;">You are verified!</h1>
        <p>Hi ${name},</p>
        <p>Great news — your ${accountType} verification has been approved. You now
        have full access to all the features available to your account type.</p>
        <a href="https://unieco.gh/"
           style="display: inline-block; background: #10b981; color: #fff;
                  padding: 12px 24px; border-radius: 8px; text-decoration: none;
                  margin-top: 16px;">
          Go to UniEco Ghana
        </a>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          The UniEco Ghana Team
        </p>
      </div>
    `,
    text: `Your ${accountType} account has been approved!\n\nHi ${name},\n\nYour verification has been approved. You now have full access to your account.\n\nThe UniEco Ghana Team`,
  }),

  rejectionNotification: (name: string, accountType: string, reason: string): EmailTemplate => ({
    subject: `Update on your ${accountType} verification`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #ef4444; font-size: 24px;">Verification update</h1>
        <p>Hi ${name},</p>
        <p>We were unable to approve your ${accountType} verification at this time.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>You can update your information and resubmit for verification at any
        time from your profile settings.</p>
        <a href="https://unieco.gh/profile"
           style="display: inline-block; background: #10b981; color: #fff;
                  padding: 12px 24px; border-radius: 8px; text-decoration: none;
                  margin-top: 16px;">
          Update and resubmit
        </a>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          The UniEco Ghana Team
        </p>
      </div>
    `,
    text: `Update on your ${accountType} verification\n\nHi ${name},\n\nWe were unable to approve your verification. Reason: ${reason}\n\nYou can update your information and resubmit from your profile at https://unieco.gh/profile.\n\nThe UniEco Ghana Team`,
  }),

  passwordReset: (name: string, link: string): EmailTemplate => ({
    subject: `Reset your UniEco Ghana password`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #10b981; font-size: 24px;">Reset your password</h1>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Click the button below to
        set a new password. This link expires in 1 hour.</p>
        <a href="${link}"
           style="display: inline-block; background: #10b981; color: #fff;
                  padding: 12px 24px; border-radius: 8px; text-decoration: none;
                  margin-top: 16px;">
          Reset my password
        </a>
        <p style="color: #666; font-size: 14px; margin-top: 16px;">
          If you did not request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Reset your password\n\nHi ${name},\n\nClick this link to reset your password: ${link}\n\nIf you did not request this, you can safely ignore this email.`,
  }),

  subscriptionReminder: (name: string, plan: string, expiryDate: string): EmailTemplate => ({
    subject: `Your ${plan} subscription expires soon`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #f59e0b; font-size: 24px;">Subscription reminder</h1>
        <p>Hi ${name},</p>
        <p>Your <strong>${plan}</strong> subscription expires on
        <strong>${expiryDate}</strong>. Renew now to keep your premium features
        and visibility on the platform.</p>
        <a href="https://unieco.gh/profile"
           style="display: inline-block; background: #10b981; color: #fff;
                  padding: 12px 24px; border-radius: 8px; text-decoration: none;
                  margin-top: 16px;">
          Renew subscription
        </a>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          The UniEco Ghana Team
        </p>
      </div>
    `,
    text: `Your ${plan} subscription expires on ${expiryDate}. Renew at https://unieco.gh/profile to keep your premium features.\n\nThe UniEco Ghana Team`,
  }),
};

export type EmailTemplateKey = keyof typeof emailTemplates;
