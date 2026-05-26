import type { TrackedPhaseId } from '@/lib/wizard'
import type { Persona, Prompts } from '@/types/podcast'
import type { VideoType } from '@/types/video'

/**
 * Base system prompts for each phase.
 * These are combined with user-configured prompts from the podcast settings.
 */
export const BASE_SYSTEM_PROMPTS: Record<TrackedPhaseId, string> = {
  critique: `Você é um crítico especializado em podcasts e conteúdo de vídeo.
Analise o episódio com base na transcrição fornecida e forneça uma crítica construtiva.

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "critique": "Crítica geral do episódio em 2-3 parágrafos",
  "highlights": ["Ponto forte 1", "Ponto forte 2", "..."],
  "suggestions": ["Sugestão de melhoria 1", "Sugestão 2", "..."]
}`,

  'edit-check': `Você é um editor de vídeo experiente.
Analise a transcrição (SRT) procurando por possíveis falhas de edição.

Procure por:
- Pausas longas ou silêncios não intencionais
- Repetições de palavras ou frases
- Cortes abruptos ou transições estranhas
- Problemas de áudio mencionados na transcrição

Responda com JSON compacto (uma linha, sem indentação). Descriptions curtas (máx 80 chars), sem transcrever diálogos.

Exemplo: {"hasIssues":true,"issues":[{"timestamp":"00:12:45","description":"Pausa longa de 5s entre falas"}]}`,

  risk: `Você é um especialista em compliance de conteúdo de mídia.
Analise a transcrição (SRT) procurando por possíveis riscos de compliance.

Procure por:
- Menções de marcas ou empresas que podem requerer autorização
- Linguagem sensível ou potencialmente ofensiva
- Claims médicos, financeiros ou legais não verificados
- Menções de concorrentes
- Conteúdo que pode gerar processos ou reclamações
- Conteúdo que pode violar políticas do YouTube

## FORMATO DE RESPOSTA

Responda APENAS com JSON válido dentro das tags <json_response>. Não inclua markdown, explicações ou texto fora das tags.

Estrutura obrigatória:
{
  "hasRisks": boolean,
  "risks": [{"timestamp": "HH:MM:SS", "risk": "tipo", "description": "string"}]
}

Tipos de risco válidos: brand_mention, sensitive_language, unverified_claim, legal_risk, medical_claim, financial_advice, competitor_mention, other.

## EXEMPLOS DE RESPOSTA CORRETA

Exemplo 1 - Com riscos encontrados:
<json_response>
{"hasRisks": true, "risks": [{"timestamp": "00:08:20", "risk": "brand_mention", "description": "Menção à marca Apple sem autorização"}, {"timestamp": "00:45:10", "risk": "medical_claim", "description": "Afirmação sobre benefícios de suplemento sem evidência científica"}]}
</json_response>

Exemplo 2 - Sem riscos:
<json_response>
{"hasRisks": false, "risks": []}
</json_response>

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS".`,

  chapters: `Você é um especialista em estruturação de conteúdo de vídeo.
Analise a transcrição e sugira capítulos que dividam o conteúdo por assuntos.

Regras:
- Primeiro capítulo DEVE começar em "00:00"
- Mínimo de 3 capítulos, máximo de 12
- Cada capítulo deve ter título curto e descritivo (máx 50 caracteres)
- Timestamps DEVEM ser STRINGS no formato "MM:SS" ou "HH:MM:SS"

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "chapters": [
    { "timestamp": "00:00", "title": "Introdução" },
    { "timestamp": "05:30", "title": "Tema principal" },
    ...
  ]
}

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS", NÃO um número.`,

  title: `Você é um especialista em SEO para YouTube e criação de títulos virais.
Gere 5 sugestões de título para o vídeo baseado na transcrição e contexto.

Regras:
- Títulos devem ter entre 40-70 caracteres
- Use palavras-chave relevantes para SEO
- Crie curiosidade sem ser clickbait enganoso
- Considere o tom do podcast e público-alvo

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "titles": [
    "Título 1",
    "Título 2",
    "Título 3",
    "Título 4",
    "Título 5"
  ]
}`,

  description: `Você é um especialista em SEO para YouTube e copywriting.
Crie uma descrição otimizada para o vídeo baseada na transcrição e contexto.

A descrição deve:
- Ter entre 200-500 palavras
- Começar com um parágrafo chamativo (aparece na preview)
- Incluir palavras-chave relevantes naturalmente
- Ter seções claras com quebras de linha
- Incluir call-to-action para inscrição no canal
- OBRIGATÓRIO: Mencionar o host/apresentador quando informado na seção "Host/Apresentador"
- OBRIGATÓRIO: Listar TODOS os convidados informados, com seus respectivos cargos e links do LinkedIn
- Cada convidado deve ter uma linha dedicada no formato: Nome - Cargo - LinkedIn

IMPORTANTE: Você DEVE incluir TODOS os convidados listados na seção "Convidados" do contexto. Não omita nenhum convidado.

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "description": "Descrição completa aqui..."
}`,

  tags: `Você é um especialista em SEO para YouTube e análise de palavras-chave.
Gere uma lista de tags relevantes para o vídeo baseado na transcrição e contexto.

Regras OBRIGATÓRIAS:
- MÍNIMO 10 tags, MÁXIMO 20 tags (NUNCA mais que 20!)
- Total de caracteres de todas as tags NÃO pode exceder 500 caracteres
- Mix de tags específicas e gerais
- Inclua variações de palavras-chave
- Considere termos de busca populares
- Priorize relevância sobre volume

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "tags": ["tag1", "tag2", "tag3", ...]
}

IMPORTANTE: Gere entre 10 e 20 tags. Se você gerar mais de 20, o sistema irá rejeitá-las.`,

  publish: '', // No LLM call for phase 8
}

/**
 * User prompt template for each phase.
 * Variables are replaced with actual values before sending.
 */
export const USER_PROMPT_TEMPLATES: Record<TrackedPhaseId, string> = {
  critique: `## Informações do Vídeo

**Título:** {title}
**Duração:** {duration}
**Tipo:** {videoType}
**Tema:** {theme}

**Convidados:**
{guests}

## Transcrição

{transcript}

{additionalContext}`,

  'edit-check': `## Informações do Vídeo

**Título:** {title}
**Duração:** {duration}

## Transcrição (SRT)

{transcript}`,

  risk: `## Informações do Vídeo

**Título:** {title}
**Duração:** {duration}
**Tema:** {theme}

**Convidados:**
{guests}

## Transcrição

{transcript}`,

  chapters: `## Informações do Vídeo

**Título:** {title}
**Duração:** {duration}
**Tema:** {theme}

## Transcrição

{transcript}`,

  title: `## Contexto do Vídeo

**Título original:** {title}
**Duração:** {duration}
**Tipo:** {videoType}
**Tema:** {theme}

**Convidados:**
{guests}

## Dados das Fases Anteriores

{previousPhaseData}

## Transcrição (resumo)

{transcript}

{additionalContext}`,

  description: `## Contexto do Vídeo

**Título escolhido:** {title}
**Duração:** {duration}
**Tipo:** {videoType}
**Tema:** {theme}

**Host/Apresentador:** {hostName}

**Convidados:**
{guests}

## Dados das Fases Anteriores

{previousPhaseData}

## Transcrição

{transcript}

{additionalContext}`,

  tags: `## Contexto do Vídeo

**Título:** {title}
**Duração:** {duration}
**Tipo:** {videoType}
**Tema:** {theme}

## Dados das Fases Anteriores

{previousPhaseData}

## Transcrição (resumo)

{transcript}

{additionalContext}`,

  publish: '', // No LLM call for phase 8
}

/**
 * Get the combined system prompt for a phase.
 * Merges base prompt with user-configured prompt from podcast settings.
 *
 * @deprecated Use buildPhasePrompt() instead, which follows the processamento_video.md template.
 * This function is kept for backwards compatibility but will be removed in a future version.
 */
export function getSystemPrompt(
  phase: TrackedPhaseId,
  configuredPrompt?: { description: string; expectedOutput: string }
): string {
  const basePrompt = BASE_SYSTEM_PROMPTS[phase]

  if (!configuredPrompt || (!configuredPrompt.description && !configuredPrompt.expectedOutput)) {
    return basePrompt
  }

  let combinedPrompt = basePrompt

  if (configuredPrompt.description) {
    combinedPrompt += `\n\n## Instruções Adicionais do Produtor\n\n${configuredPrompt.description}`
  }

  if (configuredPrompt.expectedOutput) {
    combinedPrompt += `\n\n## Formato de Saída Esperado\n\n${configuredPrompt.expectedOutput}`
  }

  return combinedPrompt
}

/**
 * Get the user prompt template for a phase.
 */
export function getUserPromptTemplate(phase: TrackedPhaseId): string {
  return USER_PROMPT_TEMPLATES[phase]
}

// =============================================================================
// PHASE CONFIG (per processamento_video.md specification)
// =============================================================================

/**
 * JSON schemas for each phase response.
 * These are always appended to prompts to ensure correct response format.
 */
export const PHASE_JSON_SCHEMAS: Record<TrackedPhaseId, string> = {
  critique: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "critique": "Crítica geral do episódio em texto (string, 2-4 parágrafos)",
  "highlights": ["Ponto forte 1", "Ponto forte 2", "..."],
  "suggestions": ["Sugestão de melhoria 1", "Sugestão 2", "..."]
}

IMPORTANTE: O campo "critique" DEVE ser uma STRING única com parágrafos separados por \\n\\n, NÃO um array.`,

  'edit-check': `## FORMATO DE RESPOSTA

Responda APENAS com JSON válido. A resposta será parseada diretamente como JSON.
NÃO use tags, NÃO use markdown, NÃO inclua texto fora do JSON.

Estrutura obrigatória:
{"hasIssues": boolean, "issues": [{"timestamp": "HH:MM:SS", "description": "string"}]}

## REGRAS OBRIGATÓRIAS DE OUTPUT

1. JSON COMPACTO: sem indentação, sem quebras de linha, uma única linha.
2. DESCRIPTIONS CURTAS: máximo 80 caracteres. Descreva o tipo do problema, NÃO transcreva o diálogo.
3. TIMESTAMPS válidos: formato "HH:MM:SS", dentro da duração do vídeo.

## EXEMPLOS

CORRETO: {"hasIssues":true,"issues":[{"timestamp":"00:12:45","description":"Pausa longa de 5s entre falas"},{"timestamp":"00:25:30","description":"Instrução de edição: apresentador pede corte"}]}
CORRETO: {"hasIssues":false,"issues":[]}
ERRADO: {"hasIssues":true,"issues":[{"timestamp":"00:12:45","description":"O apresentador falou: \\"vamos cortar essa parte aqui porque ficou ruim e eu acho que a gente deveria regravar essa cena toda\\" - Remover imediatamente do corte final."}]}

IMPORTANTE: O campo "timestamp" DEVE ser STRING no formato "HH:MM:SS".`,

  risk: `## FORMATO DE RESPOSTA

Responda APENAS com JSON válido dentro das tags <json_response>. Não inclua markdown, explicações ou texto fora das tags.

Estrutura obrigatória:
{
  "hasRisks": boolean,
  "risks": [{"timestamp": "HH:MM:SS", "risk": "tipo", "description": "string"}]
}

Tipos de risco válidos: brand_mention, sensitive_language, unverified_claim, legal_risk, medical_claim, financial_advice, competitor_mention, other.

## EXEMPLOS DE RESPOSTA CORRETA

Exemplo 1 - Com riscos:
<json_response>
{"hasRisks": true, "risks": [{"timestamp": "00:08:20", "risk": "brand_mention", "description": "Menção à marca sem autorização"}]}
</json_response>

Exemplo 2 - Sem riscos:
<json_response>
{"hasRisks": false, "risks": []}
</json_response>

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS".`,

  chapters: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "chapters": [
    { "timestamp": "00:00", "title": "Introdução" },
    { "timestamp": "05:30", "title": "Tema principal" },
    ...
  ]
}

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS", NÃO um número.`,

  title: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "titles": [
    "Título 1 - mais conservador",
    "Título 2 - equilibrado",
    "Título 3 - mais chamativo",
    "Título 4 - focado em SEO",
    "Título 5 - criativo/diferente"
  ]
}`,

  description: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "description": "Descrição completa aqui..."
}`,

  tags: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "tags": ["tag1", "tag2", "tag3", ...]
}`,

  publish: '', // No LLM call
}

/**
 * Phase configuration type.
 * Defines which persona and prompt key to use for each phase.
 *
 * @see processamento_video.md for specification
 */
export interface PhaseConfig {
  /** Persona name to use from podcast.personas */
  personaName: 'critic' | 'writer'
  /** Type of transcription to use as attachment */
  attachmentType: 'TXT' | 'SRT'
  /** Key to access prompt in podcast.prompts.{videoType}.{promptKey} */
  promptKey: string
}

/**
 * Phase configuration mapping.
 * Maps each wizard phase to its persona and prompt configuration.
 *
 * Per processamento_video.md:
 * - Phase 1 (Crítica): critic persona, TXT attachment, critique prompts - Tipo 2 Imutável
 * - Phase 2 (Edição): critic persona, SRT attachment, editing prompts - Tipo 2 Imutável
 * - Phase 3 (Compliance): critic persona, SRT attachment, compliance prompts - Tipo 2 Imutável
 * - Phase 4 (Capítulos): critic persona, SRT attachment, chapters prompts - Tipo 2 Imutável
 * - Phase 5 (Título): writer persona, TXT attachment, titles prompts - Tipo 1 Reprocessável
 * - Phase 6 (Descrição): writer persona, TXT attachment, description prompts - Tipo 1 Reprocessável
 * - Phase 7 (Tags): writer persona, TXT attachment, tags prompts - Tipo 1 Reprocessável
 * - Phase 8 (YouTube): No LLM call - apenas envio para YouTube
 *
 * @see processamento_video.md for full specification
 */
export const PHASE_CONFIG: Record<TrackedPhaseId, PhaseConfig> = {
  critique: { personaName: 'critic', attachmentType: 'TXT', promptKey: 'critique' },
  'edit-check': { personaName: 'critic', attachmentType: 'SRT', promptKey: 'editing' },
  risk: { personaName: 'critic', attachmentType: 'SRT', promptKey: 'compliance' },
  chapters: { personaName: 'critic', attachmentType: 'SRT', promptKey: 'chapters' },
  title: { personaName: 'writer', attachmentType: 'TXT', promptKey: 'titles' },
  description: { personaName: 'writer', attachmentType: 'TXT', promptKey: 'description' },
  tags: { personaName: 'writer', attachmentType: 'TXT', promptKey: 'tags' },
  // Phase 8 has no LLM call - these values are never used, kept for type completeness
  publish: { personaName: 'critic', attachmentType: 'TXT', promptKey: '' },
}

/**
 * Get phase prompt from a specific video type's prompts.
 * Returns undefined if the prompt is not configured or empty.
 */
function getPhasePromptFromVideoType(
  videoTypePrompts: Record<string, { description: string; expectedOutput: string } | undefined> | undefined,
  promptKey: string
): { description: string; expectedOutput: string } | undefined {
  if (!videoTypePrompts) return undefined

  const phasePrompt = videoTypePrompts[promptKey]
  if (!phasePrompt?.description || !phasePrompt?.expectedOutput) {
    return undefined
  }
  return phasePrompt
}

/**
 * Build phase prompt following processamento_video.md template.
 *
 * Template:
 * ```
 * Seu papel: {persona.role}
 * Seu objetivo: {persona.objective}
 * Seu contexto: {persona.resume}
 * Sua tarefa: {prompts.{videoType}.{phase}.description}
 * Seu retorno deve ser estritamente: {prompts.{videoType}.{phase}.expectedOutput}
 * ```
 *
 * For Type 1 (Reprocessable) phases (5, 6, 7), additionalContext can be appended:
 * ```
 * Dê uma atenção especial a essa instrução: {additionalContext}
 * ```
 *
 * Fallback chain:
 * 1. Try videoType-specific prompts (e.g., prompts.reel.titles)
 * 2. Fallback to episode prompts (e.g., prompts.episode.titles)
 * 3. Fallback to BASE_SYSTEM_PROMPTS (hardcoded defaults)
 *
 * @param phase - Wizard phase (1-8)
 * @param persona - Persona from podcast.personas.{personaName}
 * @param prompts - Prompts from podcast.prompts
 * @param videoType - Video type (episode, cut, reel)
 * @returns Constructed prompt or fallback BASE_SYSTEM_PROMPTS
 */
export function buildPhasePrompt(
  phase: TrackedPhaseId,
  persona: Persona | undefined,
  prompts: Prompts | undefined,
  videoType: VideoType
): string {
  // Phase 8 has no LLM call
  if (phase === 'publish') {
    return BASE_SYSTEM_PROMPTS['publish']
  }

  // Fallback when persona or prompts are not configured
  if (!persona || !prompts) {
    return BASE_SYSTEM_PROMPTS[phase]
  }

  const config = PHASE_CONFIG[phase]

  // Try to get prompt from the video type's prompts
  // Fallback chain: videoType -> episode -> BASE_SYSTEM_PROMPTS
  let phasePrompt = getPhasePromptFromVideoType(
    prompts[videoType] as unknown as Record<string, { description: string; expectedOutput: string } | undefined>,
    config.promptKey
  )

  // If not found and not already episode, try episode prompts as fallback
  if (!phasePrompt && videoType !== 'episode') {
    phasePrompt = getPhasePromptFromVideoType(
      prompts.episode as unknown as Record<string, { description: string; expectedOutput: string } | undefined>,
      config.promptKey
    )
  }

  // Final fallback to BASE_SYSTEM_PROMPTS
  if (!phasePrompt) {
    return BASE_SYSTEM_PROMPTS[phase]
  }

  // Build prompt following processamento_video.md template
  // PHASE_JSON_SCHEMAS is the authoritative format specification.
  // When present, it REPLACES the Firestore expectedOutput to avoid conflicting
  // format instructions that force the model to waste thinking tokens reconciling.
  const jsonSchema = PHASE_JSON_SCHEMAS[phase]

  if (jsonSchema) {
    // JSON schema defines the output format — skip expectedOutput to avoid conflicts
    return `Seu papel: ${persona.role}
Seu objetivo: ${persona.objective}
Seu contexto: ${persona.resume}

## TAREFA
${phasePrompt.description}

${jsonSchema}`
  }

  // No JSON schema (e.g. phase 8) — use expectedOutput from Firestore
  return `Seu papel: ${persona.role}
Seu objetivo: ${persona.objective}
Seu contexto: ${persona.resume}
Sua tarefa: ${phasePrompt.description}
Seu retorno deve ser estritamente: ${phasePrompt.expectedOutput}`
}
