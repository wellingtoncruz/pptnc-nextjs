"use server";

import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/utils";

/**
 * Form validation schema for contact submissions
 */
const contactSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  subject: z.string().min(3, "Assunto deve ter pelo menos 3 caracteres"),
  message: z.string().min(10, "Mensagem deve ter pelo menos 10 caracteres"),
});

export type ContactFormData = z.infer<typeof contactSchema>;

export interface ContactActionResult {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof ContactFormData, string>>;
  /** Timestamp to ensure useEffect triggers on repeated submissions */
  timestamp?: number;
}

/**
 * Server Action to handle contact form submission
 */
export async function submitContact(
  formData: FormData
): Promise<ContactActionResult> {
  // Parse form data
  const rawData = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    subject: formData.get("subject") as string,
    message: formData.get("message") as string,
  };

  // Validate
  const result = contactSchema.safeParse(rawData);
  if (!result.success) {
    const errors: Partial<Record<keyof ContactFormData, string>> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof ContactFormData;
      errors[field] = issue.message;
    }
    return {
      success: false,
      message: "Por favor, corrija os erros no formulário",
      errors,
      timestamp: Date.now(),
    };
  }

  const data = result.data;

  // Build email HTML
  const html = `
    <h2>Nova Mensagem de Contato</h2>
    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Nome</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.name)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td>
        <td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Assunto</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.subject)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Mensagem</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.message).replace(/\n/g, "<br>")}</td>
      </tr>
    </table>
    <p style="margin-top: 20px; color: #666; font-size: 12px;">
      Enviado através do formulário de contato do site PPTNC.
    </p>
  `;

  // Build plain text version
  const text = `
Nova Mensagem de Contato

Nome: ${data.name}
Email: ${data.email}
Assunto: ${data.subject}
Mensagem:
${data.message}

--
Enviado através do formulário de contato do site PPTNC.
  `.trim();

  // Send email
  const emailResult = await sendEmail({
    subject: `[PPTNC] Contato: ${data.subject}`,
    html,
    text,
    replyTo: data.email,
  });

  if (!emailResult.success) {
    console.error("[Contact] Failed to send email:", emailResult.error);
    return {
      success: false,
      message:
        "Erro ao enviar mensagem. Por favor, tente novamente mais tarde.",
      timestamp: Date.now(),
    };
  }

  return {
    success: true,
    message: "Mensagem enviada com sucesso! Responderemos em breve.",
    timestamp: Date.now(),
  };
}

