import type { WizardPhase } from '@/lib/wizard'
import type { Persona, Prompts } from '@/types/podcast'
import type { VideoType } from '@/types/video'

/**
 * Base system prompts for each phase.
 * These are combined with user-configured prompts from the podcast settings.
 */
export const BASE_SYSTEM_PROMPTS: Record<WizardPhase, string> = {
  1: `Você é um crítico especializado em podcasts e conteúdo de vídeo.
Analise o episódio com base na transcrição fornecida e forneça uma crítica construtiva.

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "critique": "Crítica geral do episódio em 2-3 parágrafos",
  "highlights": ["Ponto forte 1", "Ponto forte 2", "..."],
  "suggestions": ["Sugestão de melhoria 1", "Sugestão 2", "..."]
}`,

  2: `Você é um editor de vídeo experiente.
Analise a transcrição (SRT) procurando por possíveis falhas de edição.

Procure por:
- Pausas longas ou silêncios não intencionais
- Repetições de palavras ou frases
- Cortes abruptos ou transições estranhas
- Problemas de áudio mencionados na transcrição

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "hasIssues": true/false,
  "issues": [
    {
      "timestamp": "00:05:30",
      "description": "Descrição do problema"
    }
  ]
}

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS".`,

  3: `Você é um especialista em compliance de conteúdo de mídia.
Analise a transcrição (SRT) procurando por possíveis riscos de compliance.

Procure por:
- Menções de marcas ou empresas que podem requerer autorização
- Linguagem sensível ou potencialmente ofensiva
- Claims médicos, financeiros ou legais não verificados
- Menções de concorrentes
- Conteúdo que pode gerar processos ou reclamações
- Conteúdo que pode violar políticas do YouTube

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "hasRisks": true/false,
  "risks": [
    {
      "timestamp": "00:05:30",
      "risk": "tipo_do_risco",
      "description": "Descrição do risco identificado"
    }
  ]
}

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS".
Os tipos de risco válidos são: brand_mention, sensitive_language, unverified_claim, legal_risk, medical_claim, financial_advice, competitor_mention, other.`,

  4: `Você é um especialista em estruturação de conteúdo de vídeo.
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

  5: `Você é um especialista em SEO para YouTube e criação de títulos virais.
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

  6: `Você é um especialista em SEO para YouTube e copywriting.
Crie uma descrição otimizada para o vídeo baseada na transcrição e contexto.

A descrição deve:
- Ter entre 200-500 palavras
- Começar com um parágrafo chamativo (aparece na preview)
- Incluir palavras-chave relevantes naturalmente
- Ter seções claras com quebras de linha
- Incluir call-to-action para inscrição no canal
- Listar convidados com seus cargos e links

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "description": "Descrição completa aqui..."
}`,

  7: `Você é um especialista em SEO para YouTube e análise de palavras-chave.
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

  8: '', // No LLM call for phase 8
}

/**
 * User prompt template for each phase.
 * Variables are replaced with actual values before sending.
 */
export const USER_PROMPT_TEMPLATES: Record<WizardPhase, string> = {
  1: `## Informações do Vídeo

**Título:** {title}
**Duração:** {duration}
**Tipo:** {videoType}
**Tema:** {theme}

**Convidados:**
{guests}

## Transcrição

{transcript}

{additionalContext}`,

  2: `## Informações do Vídeo

**Título:** {title}
**Duração:** {duration}

## Transcrição (SRT)

{transcript}`,

  3: `## Informações do Vídeo

**Título:** {title}
**Duração:** {duration}
**Tema:** {theme}

**Convidados:**
{guests}

## Transcrição

{transcript}`,

  4: `## Informações do Vídeo

**Título:** {title}
**Duração:** {duration}
**Tema:** {theme}

## Transcrição

{transcript}`,

  5: `## Contexto do Vídeo

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

  6: `## Contexto do Vídeo

**Título escolhido:** {title}
**Duração:** {duration}
**Tipo:** {videoType}
**Tema:** {theme}

**Convidados:**
{guests}

## Dados das Fases Anteriores

{previousPhaseData}

## Transcrição

{transcript}

{additionalContext}`,

  7: `## Contexto do Vídeo

**Título:** {title}
**Duração:** {duration}
**Tipo:** {videoType}
**Tema:** {theme}

## Dados das Fases Anteriores

{previousPhaseData}

## Transcrição (resumo)

{transcript}

{additionalContext}`,

  8: '', // No LLM call for phase 8
}

/**
 * Get the combined system prompt for a phase.
 * Merges base prompt with user-configured prompt from podcast settings.
 *
 * @deprecated Use buildPhasePrompt() instead, which follows the processamento_video.md template.
 * This function is kept for backwards compatibility but will be removed in a future version.
 */
export function getSystemPrompt(
  phase: WizardPhase,
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
export function getUserPromptTemplate(phase: WizardPhase): string {
  return USER_PROMPT_TEMPLATES[phase]
}

// =============================================================================
// PHASE CONFIG (per processamento_video.md specification)
// =============================================================================

/**
 * JSON schemas for each phase response.
 * These are always appended to prompts to ensure correct response format.
 */
export const PHASE_JSON_SCHEMAS: Record<WizardPhase, string> = {
  1: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "critique": "Crítica geral do episódio em texto (string, 2-4 parágrafos)",
  "highlights": ["Ponto forte 1", "Ponto forte 2", "..."],
  "suggestions": ["Sugestão de melhoria 1", "Sugestão 2", "..."]
}

IMPORTANTE: O campo "critique" DEVE ser uma STRING única com parágrafos separados por \\n\\n, NÃO um array.`,

  2: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "hasIssues": true/false,
  "issues": [
    {
      "timestamp": "00:05:30",
      "description": "Descrição do problema"
    }
  ]
}

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS".`,

  3: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "hasRisks": true/false,
  "risks": [
    {
      "timestamp": "00:12:45",
      "risk": "tipo_do_risco",
      "description": "Descrição detalhada do risco identificado"
    }
  ]
}

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS".
Os tipos de risco válidos são: brand_mention, sensitive_language, unverified_claim, legal_risk, medical_claim, financial_advice, competitor_mention, other.`,

  4: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "chapters": [
    { "timestamp": "00:00", "title": "Introdução" },
    { "timestamp": "05:30", "title": "Tema principal" },
    ...
  ]
}

IMPORTANTE: O campo "timestamp" DEVE ser uma STRING no formato "HH:MM:SS" ou "MM:SS", NÃO um número.`,

  5: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "titles": [
    "Título 1 - mais conservador",
    "Título 2 - equilibrado",
    "Título 3 - mais chamativo",
    "Título 4 - focado em SEO",
    "Título 5 - criativo/diferente"
  ]
}`,

  6: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "description": "Descrição completa aqui..."
}`,

  7: `Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "tags": ["tag1", "tag2", "tag3", ...]
}`,

  8: '', // No LLM call
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
export const PHASE_CONFIG: Record<WizardPhase, PhaseConfig> = {
  1: { personaName: 'critic', attachmentType: 'TXT', promptKey: 'critique' },
  2: { personaName: 'critic', attachmentType: 'SRT', promptKey: 'editing' },
  3: { personaName: 'critic', attachmentType: 'SRT', promptKey: 'compliance' },
  4: { personaName: 'critic', attachmentType: 'SRT', promptKey: 'chapters' },
  5: { personaName: 'writer', attachmentType: 'TXT', promptKey: 'titles' },
  6: { personaName: 'writer', attachmentType: 'TXT', promptKey: 'description' },
  7: { personaName: 'writer', attachmentType: 'TXT', promptKey: 'tags' },
  // Phase 8 has no LLM call - these values are never used, kept for type completeness
  8: { personaName: 'critic', attachmentType: 'TXT', promptKey: '' },
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
 * Falls back to BASE_SYSTEM_PROMPTS when:
 * - persona is undefined
 * - prompts is undefined
 * - prompt description/expectedOutput is empty
 *
 * @param phase - Wizard phase (1-8)
 * @param persona - Persona from podcast.personas.{personaName}
 * @param prompts - Prompts from podcast.prompts
 * @param videoType - Video type (episode, cut, reel)
 * @returns Constructed prompt or fallback BASE_SYSTEM_PROMPTS
 */
export function buildPhasePrompt(
  phase: WizardPhase,
  persona: Persona | undefined,
  prompts: Prompts | undefined,
  videoType: VideoType
): string {
  // Phase 8 has no LLM call
  if (phase === 8) {
    return BASE_SYSTEM_PROMPTS[8]
  }

  // Fallback when persona or prompts are not configured
  if (!persona || !prompts) {
    return BASE_SYSTEM_PROMPTS[phase]
  }

  const config = PHASE_CONFIG[phase]

  // Get prompts for the video type
  const videoTypePrompts = prompts[videoType]
  if (!videoTypePrompts) {
    return BASE_SYSTEM_PROMPTS[phase]
  }

  // Get the specific phase prompt using the promptKey
  // Need to use type assertion since promptKey is dynamic
  const phasePrompt = (videoTypePrompts as Record<string, { description: string; expectedOutput: string } | undefined>)[config.promptKey]

  // Fallback if prompt is not configured or empty
  if (!phasePrompt?.description || !phasePrompt?.expectedOutput) {
    return BASE_SYSTEM_PROMPTS[phase]
  }

  // Build prompt following processamento_video.md template
  // Always append JSON schema to ensure correct response format
  const jsonSchema = PHASE_JSON_SCHEMAS[phase]

  return `Seu papel: ${persona.role}
Seu objetivo: ${persona.objective}
Seu contexto: ${persona.resume}
Sua tarefa: ${phasePrompt.description}
Seu retorno deve ser estritamente: ${phasePrompt.expectedOutput}

${jsonSchema}`
}
