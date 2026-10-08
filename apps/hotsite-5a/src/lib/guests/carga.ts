import { gerarCodigo, gerarCodigoVip, primeiroNomeDe } from "./codigo";
import type { Episodio, GuestDoc } from "./schema";

/** Uma linha da lista de convidados nominais (entrada da carga). */
export interface EntradaNominal {
  nome: string;
  primeiroNome?: string;
  /** D30: "Empresa atual" da aba Relevância; só vale enquanto o convidado não respondeu. */
  empresa?: string | null;
  videoIds: string[];
}

export interface VideoInfo {
  titulo: string;
  publicadoEm: string; // AAAA-MM-DD
}

export interface PlanoCarga {
  criar: GuestDoc[];
  atualizar: { codigo: string; campos: Partial<GuestDoc> }[];
  semMudanca: string[];
}

type Sorteio = () => number;

/** "ND" (não disponível na planilha) e vazio viram null. */
export function limparEmpresa(bruto: string | null | undefined): string | null {
  const v = (bruto ?? "").trim().replace(/\s+/g, " ");
  return v && v.toUpperCase() !== "ND" ? v.slice(0, 80) : null;
}

export function montarEpisodios(
  videoIds: string[],
  videos: Map<string, VideoInfo>,
  views: Map<string, number>
): Episodio[] {
  return [...new Set(videoIds)]
    .map((id) => {
      const v = videos.get(id);
      if (!v) throw new Error(`Vídeo ${id} não encontrado em podcasts/pptnc/videos`);
      return { videoId: id, titulo: v.titulo, publicadoEm: v.publicadoEm, views: views.get(id) ?? null };
    })
    .sort((a, b) => a.publicadoEm.localeCompare(b.publicadoEm) || a.videoId.localeCompare(b.videoId)); // [0] = primeiro (D7)
}

function novoDoc(
  base: Pick<GuestDoc, "codigo" | "nome" | "primeiroNome" | "episodios" | "cotaPatrocinador" | "patrocinador"> & { empresa?: string | null },
  agora: Date
): GuestDoc {
  return {
    empresa: null,
    ...base,
    acompanhantePermitido: false,
    acompanhanteNome: null,
    status: "pendente",
    email: null,
    celular: null,
    respondidoEm: null,
    historico: [],
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

/**
 * Carga nominal idempotente (32.2 AC 4): o convidado existente é localizado pelo NOME exato e
 * mantém o código; só o snapshot muda. Nunca toca status, acompanhante, permissão nem histórico.
 * Empresa (D30): a carga é dona do valor inicial, o convidado do final — só muda com `historico` vazio.
 * Documentos de cota nunca são tocados.
 */
export function planejarCargaNominal(
  entrada: EntradaNominal[],
  existentes: GuestDoc[],
  videos: Map<string, VideoInfo>,
  views: Map<string, number>,
  agora: Date,
  rnd: Sorteio = Math.random
): PlanoCarga {
  const nomes = entrada.map((e) => e.nome.trim());
  const dup = nomes.filter((n, i) => nomes.indexOf(n) !== i);
  if (dup.length) throw new Error(`Nome duplicado na entrada: ${[...new Set(dup)].join(", ")}`);

  const porNome = new Map(existentes.filter((d) => !d.cotaPatrocinador && d.nome).map((d) => [d.nome as string, d]));
  const usados = new Set(existentes.map((d) => d.codigo));
  const plano: PlanoCarga = { criar: [], atualizar: [], semMudanca: [] };

  for (const e of entrada) {
    const nome = e.nome.trim().replace(/\s+/g, " ");
    const episodios = montarEpisodios(e.videoIds, videos, views);
    const empresa = limparEmpresa(e.empresa);
    const atual = porNome.get(nome);
    if (!atual) {
      plano.criar.push(
        novoDoc(
          {
            codigo: gerarCodigo(nome, usados, rnd),
            nome,
            primeiroNome: e.primeiroNome?.trim() || primeiroNomeDe(nome),
            empresa,
            episodios,
            cotaPatrocinador: false,
            patrocinador: null,
          },
          agora
        )
      );
      continue;
    }
    const campos: Partial<GuestDoc> = {};
    if (JSON.stringify(atual.episodios) !== JSON.stringify(episodios)) campos.episodios = episodios;
    if (e.primeiroNome && e.primeiroNome.trim() !== atual.primeiroNome) campos.primeiroNome = e.primeiroNome.trim();
    if (e.empresa !== undefined && atual.historico.length === 0 && empresa !== atual.empresa) campos.empresa = empresa;
    if (Object.keys(campos).length) plano.atualizar.push({ codigo: atual.codigo, campos: { ...campos, atualizadoEm: agora } });
    else plano.semMudanca.push(atual.codigo);
  }
  return plano;
}

/** Cota (32.2 AC 11): só cria N códigos novos; nunca altera os existentes. */
export function planejarCota(
  patrocinador: string,
  quantidade: number,
  existentes: GuestDoc[],
  agora: Date,
  rnd: Sorteio = Math.random
): GuestDoc[] {
  if (!Number.isInteger(quantidade) || quantidade < 1) throw new Error("Quantidade deve ser inteiro ≥ 1");
  const usados = new Set(existentes.map((d) => d.codigo));
  return Array.from({ length: quantidade }, () =>
    novoDoc(
      {
        codigo: gerarCodigoVip(patrocinador, usados, rnd),
        nome: null,
        primeiroNome: null,
        episodios: [],
        cotaPatrocinador: true,
        patrocinador: patrocinador.trim(),
      },
      agora
    )
  );
}
