"use server";

import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/utils";

/**
 * Form validation schema for suggestion submissions
 */
const suggestionSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  type: z.enum(["pauta", "convidado", "ambos"], {
    message: "Selecione o tipo de sugestão",
  }),
  title: z.string().min(5, "Título deve ter pelo menos 5 caracteres"),
  description: z
    .string()
    .min(20, "Descrição deve ter pelo menos 20 caracteres"),
  linkedinUrl: z
    .string()
    .url("URL do LinkedIn inválida")
    .optional()
    .or(z.literal("")),
});

export type SuggestionFormData = z.infer<typeof suggestionSchema>;

export interface SuggestionActionResult {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof SuggestionFormData, string>>;
  /** Timestamp to ensure useEffect triggers on repeated submissions */
  timestamp?: number;
}

/**
 * Maps suggestion type to display label
 */
function getTypeLabel(type: string): string {
  switch (type) {
    case "pauta":
      return "Pauta";
    case "convidado":
      return "Convidado";
    case "ambos":
      return "Pauta e Convidado";
    default:
      return type;
  }
}

/**
 * Server Action to handle suggestion form submission
 */
export async function submitSuggestion(
  formData: FormData
): Promise<SuggestionActionResult> {
  // Parse form data
  const rawData = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    type: formData.get("type") as string,
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    linkedinUrl: formData.get("linkedinUrl") as string,
  };

  // Validate
  const result = suggestionSchema.safeParse(rawData);
  if (!result.success) {
    const errors: Partial<Record<keyof SuggestionFormData, string>> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof SuggestionFormData;
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
  const typeLabel = getTypeLabel(data.type);

  // Build email HTML
  const html = `
    <h2>Nova Sugestão de ${typeLabel}</h2>
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
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Tipo</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${typeLabel}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Título</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.title)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Descrição</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.description).replace(/\n/g, "<br>")}</td>
      </tr>
      ${
        data.linkedinUrl
          ? `<tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">LinkedIn</td>
              <td style="padding: 8px; border: 1px solid #ddd;"><a href="${escapeHtml(data.linkedinUrl)}">${escapeHtml(data.linkedinUrl)}</a></td>
            </tr>`
          : ""
      }
    </table>
    <p style="margin-top: 20px; color: #666; font-size: 12px;">
      Enviado através do formulário de sugestões do site PPTNC.
    </p>
  `;

  // Build plain text version
  const text = `
Nova Sugestão de ${typeLabel}

Nome: ${data.name}
Email: ${data.email}
Tipo: ${typeLabel}
Título: ${data.title}
Descrição: ${data.description}
${data.linkedinUrl ? `LinkedIn: ${data.linkedinUrl}` : ""}

--
Enviado através do formulário de sugestões do site PPTNC.
  `.trim();

  // Send email
  const emailResult = await sendEmail({
    subject: `[PPTNC] Nova sugestão de ${typeLabel.toLowerCase()}: ${data.title}`,
    html,
    text,
    replyTo: data.email,
  });

  if (!emailResult.success) {
    console.error("[Suggestion] Failed to send email:", emailResult.error);
    return {
      success: false,
      message:
        "Erro ao enviar sugestão. Por favor, tente novamente mais tarde.",
      timestamp: Date.now(),
    };
  }

  return {
    success: true,
    message: "Sugestão enviada com sucesso! Agradecemos sua contribuição.",
    timestamp: Date.now(),
  };
}

