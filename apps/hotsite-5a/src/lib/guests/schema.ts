import { z } from "zod";

export const STATUS = ["pendente", "confirmado", "recusou"] as const;
export type Status = (typeof STATUS)[number];

export const EpisodioSchema = z.object({
  videoId: z.string().min(1),
  titulo: z.string().min(1),
  publicadoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  views: z.number().int().nonnegative().nullable(),
});
export type Episodio = z.infer<typeof EpisodioSchema>;

export const HistoricoSchema = z.object({
  em: z.date(),
  status: z.enum(STATUS),
  acompanhanteNome: z.string().nullable(),
  nome: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  celular: z.string().nullable().optional(),
});
export type HistoricoEntrada = z.infer<typeof HistoricoSchema>;

/**
 * Documento de `podcasts/pptnc/hotsite5a/{codigo}` (Epic 32, modelo de dados).
 * Nominal: nome obrigatório, episódios do snapshot. Cota (D18/D19): nome null
 * até o convidado informar, sem episódios, com patrocinador.
 */
export const GuestDocSchema = z
  .object({
    codigo: z.string().regex(/^[A-Z0-9]{1,20}$/),
    cotaPatrocinador: z.boolean(),
    patrocinador: z.string().min(1).nullable(),
    nome: z.string().min(1).nullable(),
    primeiroNome: z.string().min(1).nullable(),
    acompanhantePermitido: z.boolean(),
    acompanhanteNome: z.string().nullable(),
    status: z.enum(STATUS),
    /** D22: obrigatório ao confirmar; ausente em docs antigos → null. */
    email: z.string().nullable().default(null),
    /** D22: opcional, só dígitos. */
    celular: z.string().nullable().default(null),
    episodios: z.array(EpisodioSchema),
    respondidoEm: z.date().nullable(),
    historico: z.array(HistoricoSchema),
    criadoEm: z.date(),
    atualizadoEm: z.date(),
  })
  .superRefine((d, ctx) => {
    if (!d.cotaPatrocinador && !d.nome) {
      ctx.addIssue({ code: "custom", message: "convidado nominal exige nome", path: ["nome"] });
    }
    if (d.cotaPatrocinador && !d.patrocinador) {
      ctx.addIssue({ code: "custom", message: "cota exige patrocinador", path: ["patrocinador"] });
    }
  });
export type GuestDoc = z.infer<typeof GuestDocSchema>;

/** Converte Timestamps do Firestore (qualquer objeto com toDate) em Date, recursivamente. */
export function fromFirestore(value: unknown): unknown {
  if (value && typeof value === "object") {
    if (typeof (value as { toDate?: unknown }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate();
    }
    if (Array.isArray(value)) return value.map(fromFirestore);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fromFirestore(v)])
    );
  }
  return value;
}

export function parseGuestDoc(data: unknown): GuestDoc {
  return GuestDocSchema.parse(fromFirestore(data));
}
