import { Resend } from "resend";

/**
 * Resend client instance
 * Only initialized on the server side
 */
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Email configuration constants
 */
export const EMAIL_CONFIG = {
  /** Default sender email (must be verified domain in Resend) */
  from: "PPTNC <contato@pptnaocompila.com.br>",
  /** Email address that receives all form submissions */
  to: "podcast@pptnaocompila.com.br",
} as const;

/**
 * Email options for sending
 */
export interface SendEmailOptions {
  /** Email subject line */
  subject: string;
  /** HTML content of the email */
  html: string;
  /** Plain text fallback (optional, recommended for accessibility) */
  text?: string;
  /** Reply-to address (usually the form submitter's email) */
  replyTo?: string;
}

/**
 * Result of sending an email
 */
export interface SendEmailResult {
  success: boolean;
  /** Resend message ID if successful */
  messageId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Sends an email using Resend
 *
 * @param options - Email options (subject, html, text, replyTo)
 * @returns Result object with success status and messageId or error
 *
 * @example
 * ```ts
 * const result = await sendEmail({
 *   subject: "[PPTNC] Nova sugestão de pauta",
 *   html: "<h1>Nova sugestão</h1><p>...</p>",
 *   text: "Nova sugestão...",
 *   replyTo: "user@example.com"
 * });
 *
 * if (result.success) {
 *   console.log("Email sent:", result.messageId);
 * } else {
 *   console.error("Failed:", result.error);
 * }
 * ```
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { subject, html, text, replyTo } = options;

  // Validate API key is configured
  if (!process.env.RESEND_API_KEY) {
    console.error("[Email] RESEND_API_KEY is not configured");
    return {
      success: false,
      error: "Email service is not configured",
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.to,
      subject,
      html,
      text,
      replyTo,
    });

    if (error) {
      console.error("[Email] Resend API error:", error);
      return {
        success: false,
        error: error.message || "Failed to send email",
      };
    }

    console.log("[Email] Sent successfully:", data?.id);
    return {
      success: true,
      messageId: data?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] Exception:", message);
    return {
      success: false,
      error: message,
    };
  }
}
