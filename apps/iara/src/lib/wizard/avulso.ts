/**
 * O avulso só muda o WIZARD quando é corte ou reel (fluxo simplificado: sem
 * fase de pai nem de análise, prompts do bucket `standalone`).
 *
 * Avulso reclassificado como EPISÓDIO roda o wizard de episódio literal —
 * fases e prompts do episódio (adendo do Epic 25, decisão do Wellington
 * 2026-09-27). A flag continua valendo fora do wizard: sem pai, sem filhos.
 *
 * Módulo folha de propósito (sem imports): é lido por wizard, prompts e
 * thumbnail, e não pode criar ciclo entre eles.
 */
export function usesAvulsoFlow(videoType: string | undefined, standalone: boolean | undefined): boolean {
  return standalone === true && videoType !== 'episode'
}
