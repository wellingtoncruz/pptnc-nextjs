export type VideoTypeChoice = 'episode' | 'cut' | 'reel'

export const VIDEO_TYPE_LABELS: Record<VideoTypeChoice, string> = {
  episode: 'Episódio',
  cut: 'Corte',
  reel: 'Reel',
}

/** Texto comum das confirmações que espurgam — o produtor precisa saber o que perde. */
export const PURGE_WARNING =
  'O wizard deste vídeo recomeça do zero: tudo o que ele gerou (análises, títulos, título curto, capítulos, links, thumbnail e imagens extras) é apagado, e título, descrição e tags voltam a ser os que estão no YouTube agora. Não dá para desfazer.'

/** Corte/reel não avulso só chega ao fim do wizard com pai. */
export const NEEDS_PARENT_NOTE = 'Como corte ou reel, o vídeo vai pedir um episódio pai antes de seguir.'

/** Reel vertical tratado como episódio ganha thumbnail horizontal. */
export const REEL_TO_EPISODE_NOTE =
  'Atenção: a thumbnail de episódio é horizontal (16:9), e reels costumam ser verticais.'
