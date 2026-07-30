'use client'

/**
 * Matriz de navegação do breadcrumb — fases × estados de vídeo.
 *
 * Nascida na retro do Epic 28 (AI 31): "fase nova quebra navegação" é a classe
 * de bug mais recorrente do projeto (Epics 22, 26 e 28), e o caso esquecido é
 * sempre o mesmo — o VÍDEO LEGADO, processado antes de a fase existir.
 *
 * Como a matriz trava a regressão:
 *
 * 1. `NAVIGATION_MATRIX` é um `Record<WizardPhaseId, …>` — adicionar uma fase
 *    à união sem declarar a regra dela aqui É ERRO DE COMPILAÇÃO. A decisão
 *    "vídeo legado alcança a fase nova?" tem que ser tomada, por escrito,
 *    junto com a fase.
 * 2. Os cenários iteram a sequência REAL (`getPhaseIdsForVideoTypeWithFeatures`)
 *    e comparam o estado do botão renderizado com a matriz — o teste enxerga o
 *    mesmo caminho integrado (layout + breadcrumb + getExtendedPhaseState) em
 *    que os bugs históricos viveram.
 * 3. Um teste de cobertura garante que todo ID aparece em algum cenário — fase
 *    que não renderiza em lugar nenhum também é falha, não silêncio.
 *
 * As fases tracked delegam ao machine (`wizard.canNavigateToPhase`), coberto
 * pelos testes do use-wizard; aqui o mock devolve "concluída = navegável" e a
 * matriz valida a FIAÇÃO (o botão respeita a resposta do machine).
 *
 * Ver td-17-wizard-phase-registry.md — esta matriz é a mitigação; o registro
 * declarativo é a correção estrutural. Quando a TD-17 for executada, esta
 * suíte deve passar inalterada (harness de aceitação do refactor).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test-utils'

import { WizardLayout } from './wizard-layout'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import {
  PHASE_ID_METADATA,
  TRACKED_PHASE_IDS,
  WIZARD_PHASE_IDS,
  getPhaseIdsForVideoTypeWithFeatures,
  type VideoTypeForWizard,
  type WizardPhaseId,
  type WizardState,
} from '@/lib/wizard'
import type { Video } from '@/types/video'

// =============================================================================
// A matriz
// =============================================================================

/** Os três estados de vídeo que todo bug histórico de navegação envolveu. */
type VideoScenario = 'novo' | 'legado' | 'completo'

interface PhaseNavigationRule {
  /**
   * Qual tipo de vídeo renderiza esta fase para as asserções. `parent` e
   * `short-title` só existem em cortes; todo o resto é assertado no episódio.
   */
  assertVia: Extract<VideoTypeForWizard, 'episode' | 'cut'>
  /** O breadcrumb deve permitir clique em cada cenário? */
  expected: Record<VideoScenario, boolean>
}

/**
 * Fase nova? A união `WizardPhaseId` cresceu e este Record NÃO COMPILA até a
 * regra de navegação da fase ser declarada — inclusive para o vídeo legado.
 */
const NAVIGATION_MATRIX: Record<WizardPhaseId, PhaseNavigationRule> = {
  // Tracked — regra vem do machine; aqui validamos a fiação botão ↔ machine.
  critique: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  'edit-check': { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  risk: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  chapters: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  title: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  description: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  tags: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  publish: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },

  // Estendidas — regra "atual ou concluída", com as exceções documentadas.
  // `parent` é a fase inicial do corte novo (atual ⇒ clicável).
  parent: { assertVia: 'cut', expected: { novo: true, legado: true, completo: true } },
  'short-title': { assertVia: 'cut', expected: { novo: false, legado: true, completo: true } },
  thumbnail: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  // O caso da homologação do Epic 28: vídeo legado nunca visitou a fase, mas
  // com tudo anterior concluído ela DEVE ser clicável (exceção restrita).
  'extra-images': { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
  links: { assertVia: 'episode', expected: { novo: false, legado: true, completo: true } },
}

const FEATURES = { thumbnailGeneration: true, extraImagesGeneration: true }

// =============================================================================
// Fixtures
// =============================================================================

const WIZARD_THUMB_URL = '/api/wizard/thumbnail/select?path=thumbnails/p/v/final-1.png'
const EXTRA_IMAGE_URL = '/api/wizard/extra-images/select?path=extra-images/p/v/story-1.png'

function baseVideo(videoType: 'episode' | 'cut'): Video {
  return {
    id: 'matrix-video',
    podcastId: 'test-podcast',
    title: 'Vídeo da matriz',
    duration: videoType === 'episode' ? 3600 : 120,
    status: 'processing',
    videoType,
  } as Video
}

/**
 * Os fixtures respondem: o que o DOCUMENTO do vídeo tem em cada cenário?
 *
 * - `novo`: acabou de sincronizar; nada preenchido.
 * - `legado`: processado de ponta a ponta ANTES da fase mais nova existir —
 *   tem tudo que as fases da época gravavam, e NADA da fase nova (para
 *   extra-images: sem imagens e sem marca em reviewedPhases). É o caso que
 *   passou despercebido duas vezes no Epic 28.
 * - `completo`: passou por todas as fases, incluindo as mais novas.
 */
function videoFor(scenario: VideoScenario, videoType: 'episode' | 'cut'): Video {
  const video = baseVideo(videoType)
  if (scenario === 'novo') return video

  if (videoType === 'cut') {
    return {
      ...video,
      parentEpisodeId: 'episode-1',
      shortTitle: 'CORTE',
      storageThumbnailUrl: WIZARD_THUMB_URL,
    } as Video
  }

  const legado = {
    ...video,
    storageThumbnailUrl: WIZARD_THUMB_URL,
    reviewedPhases: ['links'],
  } as Video

  if (scenario === 'legado') return legado

  return {
    ...legado,
    extraImages: { story: EXTRA_IMAGE_URL },
    reviewedPhases: ['links', 'extra-images'],
  } as Video
}

function stateFor(scenario: VideoScenario, videoType: 'episode' | 'cut'): WizardState {
  const status = scenario === 'novo' ? ('pending' as const) : ('completed' as const)
  const phases = Object.fromEntries(
    TRACKED_PHASE_IDS.map((id) => [id, { status, data: null, error: null }])
  ) as WizardState['phases']

  const firstPhase: WizardPhaseId = videoType === 'cut' ? 'parent' : 'critique'
  return {
    videoId: 'matrix-video',
    videoType,
    currentPhase: scenario === 'novo' ? firstPhase : 'publish',
    phases,
  }
}

function renderScenario(scenario: VideoScenario, videoType: 'episode' | 'cut') {
  const state = stateFor(scenario, videoType)
  const wizard = {
    state,
    currentPhase: state.currentPhase,
    phases: state.phases,
    consoleMessages: [],
    setPhaseStatus: vi.fn(),
    setPhaseLoading: vi.fn(),
    setPhaseError: vi.fn(),
    setPhaseData: vi.fn(),
    goToPhase: vi.fn(),
    // Machine simulado: fase tracked concluída é navegável. A regra real vive
    // no use-wizard (testado lá); a matriz valida que o botão a respeita.
    canNavigateToPhase: vi.fn(
      (phase: WizardPhaseId) =>
        state.phases[phase as keyof WizardState['phases']]?.status === 'completed'
    ),
    completePhaseAndAdvance: vi.fn(),
    addSpinner: vi.fn(() => 'spinner-1'),
    removeSpinner: vi.fn(),
    addAlert: vi.fn(),
    removeAlert: vi.fn(),
    reset: vi.fn(),
    invalidateFromPhase: vi.fn(),
  } as unknown as UseWizardReturn

  render(
    <WizardLayout
      wizard={wizard}
      video={videoFor(scenario, videoType)}
      interactivePanel={<div>painel</div>}
      features={FEATURES}
    />
  )
}

// =============================================================================
// Testes
// =============================================================================

describe('Matriz de navegação — fases × estados de vídeo (retro 28, AI 31)', () => {
  it('todo WizardPhaseId é assertado em algum cenário — fase invisível é falha, não silêncio', () => {
    const rendered = new Set<WizardPhaseId>([
      ...getPhaseIdsForVideoTypeWithFeatures('episode', FEATURES, false),
      ...getPhaseIdsForVideoTypeWithFeatures('cut', FEATURES, false),
    ])
    for (const phase of WIZARD_PHASE_IDS) {
      expect(rendered.has(phase), `fase "${phase}" não renderiza em nenhum cenário da matriz`).toBe(
        true
      )
      expect(rendered.has(phase) && NAVIGATION_MATRIX[phase].assertVia).toBeTruthy()
    }
  })

  const scenarios: VideoScenario[] = ['novo', 'legado', 'completo']

  for (const videoType of ['episode', 'cut'] as const) {
    for (const scenario of scenarios) {
      it(`${videoType} ${scenario}: cada fase respeita a regra declarada`, () => {
        renderScenario(scenario, videoType)

        const sequence = getPhaseIdsForVideoTypeWithFeatures(videoType, FEATURES, false)
        for (const phase of sequence) {
          const rule = NAVIGATION_MATRIX[phase]
          if (rule.assertVia !== videoType) continue

          const button = screen.getByRole('button', { name: PHASE_ID_METADATA[phase].label })
          const expected = rule.expected[scenario]
          if (expected) {
            expect(button, `"${phase}" deveria ser clicável (${videoType}/${scenario})`).not.toBeDisabled()
          } else {
            expect(button, `"${phase}" deveria estar bloqueada (${videoType}/${scenario})`).toBeDisabled()
          }
        }
      })
    }
  }
})
