/**
 * YouTubeClient com o token do usuário LOGADO, renovado se expirado.
 *
 * Mesmo fluxo da rota de transcrição, extraído para as rotas do avulso
 * (adendo do Epic 25) — que precisam ler o vídeo no YouTube antes de espurgar.
 * Devolve o erro já no formato da resposta HTTP, para a rota só repassar.
 */
import { getUserTokensWithExpiry, refreshUserToken, TokenRefreshError } from '@/lib/firebase/tokens'
import { log } from '@/lib/logger'

import { YouTubeClient } from './client'

export type UserYouTubeClientResult =
  | { ok: true; client: YouTubeClient }
  | { ok: false; status: 401; code: string; message: string }

export async function getUserYouTubeClient(userId: string): Promise<UserYouTubeClientResult> {
  let tokens = await getUserTokensWithExpiry(userId)
  if (!tokens) {
    return {
      ok: false,
      status: 401,
      code: 'NO_TOKENS',
      message: 'Tokens OAuth não encontrados. Faça login novamente.',
    }
  }

  if (tokens.needsRefresh) {
    if (!tokens.refreshToken) {
      return { ok: false, status: 401, code: 'AUTH_EXPIRED', message: 'Token expirado. Faça login novamente.' }
    }
    try {
      tokens = await refreshUserToken(userId, tokens.refreshToken)
    } catch (error) {
      if (error instanceof TokenRefreshError) {
        log('ERROR', 'Token refresh failed (user YouTube client)', { userId, status: error.status })
        return {
          ok: false,
          status: 401,
          code: 'TOKEN_REFRESH_FAILED',
          message: 'Falha ao renovar token. Faça login novamente.',
        }
      }
      throw error
    }
  }

  return { ok: true, client: new YouTubeClient(tokens.accessToken) }
}
