import { codigoValido, normalizarCodigo } from "./guests/codigo";
import type { GuestDoc } from "./guests/schema";
import type { ErroConvite } from "./guests/rules";

/** Contrato público consumido pela página (32.3 → 32.4). Sem histórico nem timestamps. */
export type EstadoPagina = "convite" | "confirmado" | "recusou" | "restrito";

export interface EpisodioView {
  videoId: string;
  titulo: string;
  publicadoEm: string;
  views: number | null;
}

export interface ConviteAberto {
  estado: Exclude<EstadoPagina, "restrito">;
  codigo: string;
  cota: boolean;
  patrocinador: string | null;
  nome: string | null;
  primeiroNome: string | null;
  acompanhantePermitido: boolean;
  acompanhanteNome: string | null;
  /** Contato do próprio convidado (D22), só para preencher os campos de confirmação. */
  email: string | null;
  celular: string | null;
  /** Empresa atual (D30), para preencher o campo — o convidado confirma ou corrige. */
  empresa: string | null;
  /** Primeiro episódio (D7); null na cota. */
  episodio: EpisodioView | null;
  /** "E mais N episódios com X visualizações" — null com episódio único ou na cota. */
  maisEpisodios: { quantidade: number; views: number | null } | null;
}

export interface ConviteRestrito {
  estado: "restrito";
  codigoDigitado: string;
  erro: Extract<ErroConvite, "CODIGO_INVALIDO"> | null;
}

export type ConviteView = ConviteAberto | ConviteRestrito;

export type ResultadoAcao =
  | { ok: true; convite: ConviteAberto }
  | { ok: false; erro: ErroConvite };

type StatusAberto = Exclude<GuestDoc["status"], "excluido">;

const ESTADO: Record<StatusAberto, ConviteAberto["estado"]> = {
  pendente: "convite",
  confirmado: "confirmado",
  recusou: "recusou",
};

export function toView(doc: GuestDoc): ConviteAberto {
  const [primeiro, ...outros] = doc.cotaPatrocinador ? [] : doc.episodios;
  // Vídeo sem views no snapshot (API não respondeu) não entra na soma; nenhum conhecido → null.
  const conhecidos = outros.filter((e) => e.views != null);
  const somaViews = conhecidos.length ? conhecidos.reduce((s, e) => s + (e.views ?? 0), 0) : null;
  return {
    // Excluído (32.12) nunca chega aqui: getConvite e executarAcao respondem como código inexistente.
    estado: ESTADO[doc.status as StatusAberto],
    codigo: doc.codigo,
    cota: doc.cotaPatrocinador,
    patrocinador: doc.patrocinador,
    nome: doc.nome,
    primeiroNome: doc.cotaPatrocinador ? null : doc.primeiroNome,
    acompanhantePermitido: doc.acompanhantePermitido,
    acompanhanteNome: doc.acompanhanteNome,
    email: doc.email,
    celular: doc.celular,
    empresa: doc.empresa,
    episodio: primeiro ?? null,
    maisEpisodios: outros.length ? { quantidade: outros.length, views: somaViews } : null,
  };
}

export function restrito(codigoDigitado = "", erro: ConviteRestrito["erro"] = null): ConviteRestrito {
  return { estado: "restrito", codigoDigitado, erro };
}

/** Malformado, inexistente e excluído (32.12) dão a mesma resposta (32.3 AC 1). */
export async function getConvite(
  bruto: string | null | undefined,
  get: (codigo: string) => Promise<GuestDoc | null>
): Promise<ConviteView> {
  const codigo = normalizarCodigo(bruto);
  if (!codigo) return restrito();
  if (!codigoValido(codigo)) return restrito(codigo, "CODIGO_INVALIDO");
  const doc = await get(codigo);
  return doc && doc.status !== "excluido" ? toView(doc) : restrito(codigo, "CODIGO_INVALIDO");
}
