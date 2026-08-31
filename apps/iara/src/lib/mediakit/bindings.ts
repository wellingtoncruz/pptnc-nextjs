/**
 * Mediakit binding map (model B, approved 2026-08-25): every dynamic text
 * occurrence of the deck, anchored by `slide (data-label) + visible label`.
 * The design carries no usable ids/classes — labels ARE the contract, and a
 * renamed label must fail loud (guards in apply.ts), never no-op.
 *
 * Widgets (SVG charts, donuts, dot) are story 30.3 — this map covers text.
 */
import type { MediakitData } from '@/types/mediakit'

import {
  compactM1,
  compactMi2,
  compactMil,
  intDot,
  kSuffix,
  milhoesProse,
  percentInt,
  plusCompactMi,
  yearsSince,
  yearsWord,
} from './formats'

/** Values the text bindings consume, derived once from the contract. */
export interface MediakitDerived {
  year: number
  years: number
  impressions: number
  views: number
  episodes: number
  cuts: number
  shorts: number
  watchHours: number
  youtubeSubscribers: number
  followers: { tiktok: number; linkedin: number; spotify: number; instagram: number }
  /** 35–59 share = age['35-44'] + age['45-59'] (the donut center / hero stat). */
  age3559: number
}

export class MediakitDataError extends Error {
  constructor(message: string) {
    super(`Mediakit data error: ${message}`)
    this.name = 'MediakitDataError'
  }
}

export function deriveMediakitValues(data: MediakitData, now: Date): MediakitDerived {
  if (!data.stats) throw new MediakitDataError('stats section missing/invalid in Firestore')
  if (!data.audience) throw new MediakitDataError('audience section missing/invalid in Firestore')
  const { stats, audience } = data
  return {
    year: now.getUTCFullYear(),
    years: yearsSince(stats.launch, now),
    impressions: stats.impressions,
    views: stats.viewsYoutube + stats.viewsSpotifyStreams,
    episodes: stats.episodes,
    cuts: stats.cuts,
    shorts: stats.shorts,
    watchHours: stats.watchHours,
    youtubeSubscribers: audience.youtubeSubscribers,
    followers: audience.followers,
    age3559: audience.age['35-44'] + audience.age['45-59'],
  }
}

/**
 * Display strings EXACTLY as the PDF shows them — persisted as
 * `mediakit/rendered` after each successful publish and displayed verbatim
 * by the /midiakit page of apps/web (equalização por construção).
 */
export function buildRenderedValues(d: MediakitDerived): Record<string, string> {
  return {
    episodes: intDot(d.episodes),
    cuts: intDot(d.cuts),
    shorts: intDot(d.shorts),
    youtubeSubscribers: intDot(d.youtubeSubscribers),
    spotifyFollowers: intDot(d.followers.spotify),
    tiktokFollowers: intDot(d.followers.tiktok),
    linkedinFollowers: intDot(d.followers.linkedin),
    instagramFollowers: intDot(d.followers.instagram),
    views: `${compactMi2(d.views)} mi`,
    watchHours: `${kSuffix(d.watchHours)} +`,
    impressions: plusCompactMi(d.impressions),
    yearsOnAir: `${d.years} anos`,
  }
}

export type TextBinding =
  | {
      id: string
      slide: string
      kind: 'stat'
      /** Exact visible text of the label div under the value. */
      label: string
      render: (d: MediakitDerived) => string
      /** Shape of the CURRENT value core — a mismatch means the template
       * changed under us (or the map is wrong) and must fail loud. */
      expect: RegExp
    }
  | {
      id: string
      slide: string
      kind: 'follower-row'
      network: string
      render: (d: MediakitDerived) => string
      expect: RegExp
    }
  | {
      id: string
      slide: string
      kind: 'pattern'
      /** Exactly ONE capturing group = the value to replace (needs /d). */
      pattern: RegExp
      render: (d: MediakitDerived) => string
      expect: RegExp
    }

export const MEDIAKIT_TEXT_BINDINGS: TextBinding[] = [
  // ── 01 · Capa ──────────────────────────────────────────────────────────
  {
    id: 'C1',
    slide: 'Capa',
    kind: 'stat',
    label: 'No ar · desde set/2021',
    render: (d) => `${d.years} anos`,
    expect: /^\d+ anos$/,
  },
  {
    id: 'C3',
    slide: 'Capa',
    kind: 'stat',
    label: 'Pessoas impactadas',
    render: (d) => plusCompactMi(d.impressions),
    expect: /^\+\d+,\d mi$/,
  },
  {
    id: 'C4',
    slide: 'Capa',
    kind: 'pattern',
    pattern: /Media Kit — (\d{4})</,
    render: (d) => String(d.year),
    expect: /^\d{4}$/,
  },
  // ── 03 · Cinco anos em números ─────────────────────────────────────────
  {
    id: 'N1',
    slide: 'Cinco anos em números',
    kind: 'stat',
    label: 'Pessoas impactadas',
    render: (d) => compactM1(d.impressions),
    expect: /^\d+,\dM$/,
  },
  {
    id: 'N2',
    slide: 'Cinco anos em números',
    kind: 'stat',
    label: 'Visualizações',
    render: (d) => compactMi2(d.views),
    expect: /^\d+,\d{2}$/,
  },
  {
    id: 'N3',
    slide: 'Cinco anos em números',
    kind: 'stat',
    label: 'Episódios',
    render: (d) => intDot(d.episodes),
    expect: /^[\d.]+$/,
  },
  {
    id: 'N4',
    slide: 'Cinco anos em números',
    kind: 'stat',
    label: 'Cortes',
    render: (d) => intDot(d.cuts),
    expect: /^[\d.]+$/,
  },
  {
    id: 'N5',
    slide: 'Cinco anos em números',
    kind: 'stat',
    label: 'Shorts',
    render: (d) => intDot(d.shorts),
    expect: /^[\d.]+$/,
  },
  {
    id: 'N6',
    slide: 'Cinco anos em números',
    kind: 'stat',
    label: 'Horas exibidas',
    render: (d) => kSuffix(d.watchHours),
    expect: /^\d+k$/,
  },
  // ── 04 · Público ───────────────────────────────────────────────────────
  {
    id: 'P1',
    slide: 'Público',
    kind: 'stat',
    label: 'Inscritos no YouTube',
    render: (d) => intDot(d.youtubeSubscribers),
    expect: /^[\d.]+$/,
  },
  {
    id: 'P2',
    slide: 'Público',
    kind: 'follower-row',
    network: 'TikTok',
    render: (d) => intDot(d.followers.tiktok),
    expect: /^[\d.]+$/,
  },
  {
    id: 'P3',
    slide: 'Público',
    kind: 'follower-row',
    network: 'LinkedIn',
    render: (d) => intDot(d.followers.linkedin),
    expect: /^[\d.]+$/,
  },
  {
    id: 'P4',
    slide: 'Público',
    kind: 'follower-row',
    network: 'Spotify',
    render: (d) => intDot(d.followers.spotify),
    expect: /^[\d.]+$/,
  },
  {
    id: 'P5',
    slide: 'Público',
    kind: 'follower-row',
    network: 'Instagram',
    render: (d) => intDot(d.followers.instagram),
    expect: /^[\d.]+$/,
  },
  {
    id: 'P6',
    slide: 'Público',
    kind: 'stat',
    label: '35–59 anos',
    render: (d) => `${percentInt(d.age3559)}%`,
    expect: /^\d+%$/,
  },
  {
    id: 'P6b',
    slide: 'Público',
    kind: 'pattern',
    pattern: /(\d+(?:,\d+)?)% da audiência tem entre 35 e 59 anos/,
    render: (d) => percentInt(d.age3559),
    expect: /^\d+(?:,\d+)?$/,
  },
  // ── 09 · Patrocinador Fixo ─────────────────────────────────────────────
  {
    id: 'S1',
    slide: 'Patrocinador Fixo',
    kind: 'stat',
    label: 'Pessoas impactadas',
    render: (d) => plusCompactMi(d.impressions),
    expect: /^\+\d+,\d mi$/,
  },
  {
    id: 'S2',
    slide: 'Patrocinador Fixo',
    kind: 'stat',
    label: 'Têm 35–59 anos',
    render: (d) => `${percentInt(d.age3559)}%`,
    expect: /^\d+%$/,
  },
]

/**
 * Speaker-notes regeneration (decision 2026-08-25: notes update together).
 * Templates mirror the producer's current prose, interpolating only numbers —
 * the peaks sentence of slide 03 stays literal until 30.3 owns the series.
 */
export interface SpeakerNotesBinding {
  slide: string
  build: (d: MediakitDerived) => string
}

export const MEDIAKIT_SPEAKER_NOTES: SpeakerNotesBinding[] = [
  {
    slide: 'Capa',
    build: (d) =>
      `Abertura. PPT Não Compila, media kit ${d.year}. ` +
      `${yearsWord(d.years, true)} anos no ar, 13º podcast de tecnologia mais ouvido do ` +
      `Spotify Brasil, mais de ${milhoesProse(d.impressions, 1)} de pessoas impactadas.`,
  },
  {
    slide: 'Cinco anos em números',
    build: (d) =>
      `Os números de ${yearsWord(d.years, false)} anos e o crescimento por plataforma. ` +
      `Mais de ${milhoesProse(d.impressions, 1)} de pessoas impactadas, ` +
      `${milhoesProse(d.views, 2)} de visualizações, ${intDot(d.episodes)} episódios, ` +
      `${intDot(d.cuts)} cortes, ${intDot(d.shorts)} shorts e mais de ` +
      `${compactMil(d.watchHours)} horas de exibição. ` +
      `O crescimento aparece nas duas principais plataformas: Spotify chegando a ` +
      `2,7 mil streams/downloads por mês e YouTube com pico de mais de 9,8 mil horas ` +
      `de exibição mensais.`,
  },
  {
    slide: 'Público',
    build: (d) =>
      `Quem ouve. ${compactMil(d.youtubeSubscribers)} inscritos no YouTube e milhares de ` +
      `seguidores nas redes. Público predominantemente masculino e sênior: ` +
      `${percentInt(d.age3559)}% têm entre 35 e 59 anos — líderes e decisores técnicos ` +
      `no auge da carreira.`,
  },
]
