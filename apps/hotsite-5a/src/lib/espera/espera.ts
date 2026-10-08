import { z } from "zod";
import { validarCelular, validarEmail } from "../contato";
import { primeiroNomeDe } from "../guests/codigo";
import { validarNome } from "../guests/rules";
import { fromFirestore } from "../guests/schema";

/**
 * Lista de espera (Story 32.7, D24/D28): Nome, Empresa, Email e Celular, todos obrigatórios.
 * Cada envio vira um documento novo em `hotsite5a-espera` — sem deduplicar (D24).
 */
export const CAMPOS_ESPERA = ["nome", "empresa", "email", "celular"] as const;
export type CampoEspera = (typeof CAMPOS_ESPERA)[number];

export type ErroEspera = "CAMPO_OBRIGATORIO" | "NOME_INVALIDO" | "EMPRESA_INVALIDA" | "EMAIL_INVALIDO" | "CELULAR_INVALIDO";

export interface DadosEspera {
  nome?: string;
  empresa?: string;
  email?: string;
  celular?: string;
  /** Honeypot: escondido de quem usa a tela; preenchido = robô. */
  site?: string;
}

export const EsperaDocSchema = z.object({
  nome: z.string().min(1),
  empresa: z.string().min(1),
  email: z.string().min(1),
  celular: z.string().regex(/^\d{10,11}$/),
  criadoEm: z.date(),
});
export type EsperaDoc = z.infer<typeof EsperaDocSchema>;

export function parseEsperaDoc(data: unknown): EsperaDoc {
  return EsperaDocSchema.parse(fromFirestore(data));
}

export type Validacao =
  | { ok: true; doc: Omit<EsperaDoc, "criadoEm"> }
  | { ok: false; erros: Partial<Record<CampoEspera, ErroEspera>> };

const vazio = (v: unknown) => typeof v !== "string" || v.trim() === "";

export function validarEspera(dados: DadosEspera): Validacao {
  const erros: Partial<Record<CampoEspera, ErroEspera>> = {};
  for (const c of CAMPOS_ESPERA) if (vazio(dados[c])) erros[c] = "CAMPO_OBRIGATORIO";

  const nome = validarNome(dados.nome);
  if (!erros.nome && !nome) erros.nome = "NOME_INVALIDO";
  const empresa = validarNome(dados.empresa);
  if (!erros.empresa && !empresa) erros.empresa = "EMPRESA_INVALIDA";
  const email = validarEmail(dados.email);
  if (!erros.email && !email) erros.email = "EMAIL_INVALIDO";
  const cel = validarCelular(dados.celular);
  if (!erros.celular && (!cel.ok || !cel.valor)) erros.celular = "CELULAR_INVALIDO";

  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, doc: { nome: nome!, empresa: empresa!, email: email!, celular: (cel as { valor: string }).valor } };
}

export type ResultadoEspera =
  | { ok: true; primeiroNome: string }
  | { ok: false; erros: Partial<Record<CampoEspera, ErroEspera>> }
  | { ok: false; erro: "FALHA_TEMPORARIA" };

export interface EsperaStore {
  add(doc: EsperaDoc): Promise<void>;
}

export async function inscrever(store: EsperaStore, dados: DadosEspera, agora: Date): Promise<ResultadoEspera> {
  if (!vazio(dados.site)) {
    // Robô: responde como sucesso e não grava nada.
    console.warn("[ESPERA] honeypot");
    return { ok: true, primeiroNome: primeiroNomeDe(String(dados.nome ?? "")) };
  }
  const v = validarEspera(dados);
  if (!v.ok) return v;
  try {
    await store.add({ ...v.doc, criadoEm: agora });
  } catch (e) {
    console.error("[ESPERA] falha ao gravar", e);
    return { ok: false, erro: "FALHA_TEMPORARIA" };
  }
  return { ok: true, primeiroNome: primeiroNomeDe(v.doc.nome) };
}
