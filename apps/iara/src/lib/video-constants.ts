import type { VideoStatus, VideoType } from '@/types/video'

export const statusColors: Record<VideoStatus, string> = {
  new: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
  draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  ready: 'bg-green-500/20 text-green-400 border-green-500/30',
  sending: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
  sent: 'bg-green-500/20 text-green-400 border-green-500/30',
}

export const statusLabels: Record<VideoStatus, string> = {
  new: 'novo',
  processing: 'processando',
  draft: 'rascunho',
  ready: 'pronto',
  sending: 'enviando',
  sent: 'enviado',
}

export const typeColors: Record<VideoType, string> = {
  episode: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  cut: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  reel: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
}

export const typeLabels: Record<VideoType, string> = {
  episode: 'episódio',
  cut: 'corte',
  reel: 'reel',
}
