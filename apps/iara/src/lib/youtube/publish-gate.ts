/**
 * Trava de publicação no YouTube — duas chaves, as duas precisam estar abertas.
 *
 * 1. **Infra** — `ENVIRONMENT=PRD` (Epic 27 append). Fora de produção nada sobe,
 *    qualquer que seja a configuração do tenant: protege o banco de testes, que
 *    carrega vídeos reais de canais reais.
 * 2. **Admin** — `features.youtubePublish` do podcast (set/2026, 2º tenant). O
 *    dono do podcast liga e desliga pela aba Configurações, sem redeploy. Nasceu
 *    para o TrenDs News rodar em PRD sem publicar até entender os riscos.
 *
 * Default `true` quando o campo não existe: o PPTNC publicava antes da flag e
 * segue publicando sem ninguém tocar no banco de PROD. Tenant novo é semeado com
 * `false` explicitamente.
 *
 * Falha FECHADA: se o podcast não pode ser lido, não publica. É uma trava de
 * segurança — na dúvida, bloqueia e explica.
 */
import { IS_PRODUCTION, PODCAST_ID } from '@/lib/firebase/config'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { log } from '@/lib/logger'

export type PublishGate =
  | { allowed: true }
  | { allowed: false; code: 'ENV_NOT_AUTHORIZED' | 'PUBLISH_DISABLED'; message: string }

export const ENV_BLOCK_MESSAGE = 'Ambiente de testes, publicação final não autorizada'
export const DISABLED_BLOCK_MESSAGE =
  'Publicação no YouTube desligada nas Configurações do podcast'

export async function getYoutubePublishGate(): Promise<PublishGate> {
  if (!IS_PRODUCTION) {
    return { allowed: false, code: 'ENV_NOT_AUTHORIZED', message: ENV_BLOCK_MESSAGE }
  }

  try {
    const podcast = await getPodcastAdmin(PODCAST_ID)
    if (podcast && podcast.features?.youtubePublish !== false) return { allowed: true }
  } catch (error) {
    log('ERROR', 'Publish gate could not read podcast — blocking', { podcastId: PODCAST_ID, error })
  }
  return { allowed: false, code: 'PUBLISH_DISABLED', message: DISABLED_BLOCK_MESSAGE }
}
