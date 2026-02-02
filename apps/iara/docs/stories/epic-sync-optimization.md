# Epic: Otimização do Sync de Vídeos

## Objetivo

Reduzir consumo de quota do YouTube API v3 e melhorar performance do sync de vídeos.

## Contexto

O sync atual busca TODOS os vídeos do canal em cada execução, mesmo que 95%+ já existam no Firestore. Isso consome quota desnecessária e aumenta o tempo de sync.

### Métricas Atuais (canal com 200 vídeos)

| Métrica | Valor Atual |
|---------|-------------|
| Quota por sync | ~8 units |
| Tempo de sync (10 novos) | 15-20s |
| Syncs possíveis/dia | ~1.250 |

### Metas

| Métrica | Meta |
|---------|------|
| Quota por sync | ~2 units (75% redução) |
| Tempo de sync (10 novos) | 5-8s (60% redução) |
| Syncs possíveis/dia | ~5.000 |

## Stories

1. [Story 7.1: Delta Sync com Early Exit](#story-71-delta-sync-com-early-exit)
2. [Story 7.2: Otimização de Batch Video Details](#story-72-otimização-de-batch-video-details)
3. [Story 7.3: Paralelização de Download de Thumbnails](#story-73-paralelização-de-download-de-thumbnails)

---

## Story 7.1: Delta Sync com Early Exit

### Descrição

**Como** produtor de podcast
**Quero** que o sync busque apenas vídeos novos do YouTube
**Para** economizar quota da API e ter syncs mais rápidos

### Contexto Técnico

Atualmente, `fetchAllYouTubeVideos()` em `sync-videos.ts:62-76` busca TODOS os vídeos do canal usando paginação completa. Isso é ineficiente porque:

1. 95%+ dos vídeos já existem no Firestore
2. Cada página consome 2 chamadas de API (playlistItems + videos)
3. Canal com 200 vídeos = 4 páginas = 8 API calls

**Solução:** Implementar "early exit" - parar de buscar quando encontrar um vídeo que já existe no Firestore.

### Premissas

1. YouTube API retorna vídeos ordenados por data de adição (mais recentes primeiro)
2. Vídeos novos sempre aparecem no início da lista
3. Se encontramos um vídeo existente, todos os subsequentes também existem

### Critérios de Aceite

```gherkin
Feature: Delta Sync com Early Exit

  Background:
    Given um podcast com channelId configurado
    And 200 vídeos existentes no Firestore
    And 3 vídeos novos no YouTube (publicados após último sync)

  Scenario: Sync encontra vídeos novos e para ao encontrar existente
    When o sync é executado
    Then apenas 1 página de playlistItems deve ser requisitada
    And apenas os 3 vídeos novos devem ser processados
    And os 200 vídeos existentes não devem ser re-buscados
    And o log deve indicar "early exit" com contagem de vídeos verificados

  Scenario: Sync com nenhum vídeo novo
    Given nenhum vídeo novo foi publicado
    When o sync é executado
    Then apenas 1 página de playlistItems deve ser requisitada
    And nenhum vídeo deve ser criado no Firestore
    And result.added deve ser 0

  Scenario: Sync com muitos vídeos novos (mais de 50)
    Given 60 vídeos novos foram publicados
    When o sync é executado
    Then 2 páginas de playlistItems devem ser requisitadas
    And os 60 vídeos novos devem ser processados
    And early exit deve ocorrer na 2ª página

  Scenario: Primeiro sync (Firestore vazio)
    Given nenhum vídeo existe no Firestore
    When o sync é executado
    Then todas as páginas devem ser requisitadas (full sync)
    And todos os vídeos devem ser importados
```

### Tarefas Técnicas

1. **Criar função `getExistingVideoIds(podcastId)`** em `videos-admin.ts`
   - Query otimizada que retorna apenas IDs dos vídeos
   - Retorna `Set<string>` para lookup O(1)

2. **Criar função `fetchNewYouTubeVideos()`** em `sync-videos.ts`
   - Recebe `existingIds: Set<string>` como parâmetro
   - Implementa early exit ao encontrar ID existente
   - Retorna apenas vídeos novos

3. **Refatorar `syncVideos()`** para usar nova função
   - Chamar `getExistingVideoIds()` no início
   - Substituir `fetchAllYouTubeVideos()` por `fetchNewYouTubeVideos()`
   - Manter compatibilidade com fluxo existente

4. **Adicionar logging** para monitoramento
   - Log de páginas requisitadas vs páginas evitadas
   - Log de economia estimada de quota

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/firebase/videos-admin.ts` | Nova função `getExistingVideoIds()` |
| `src/lib/sync/sync-videos.ts` | Nova função `fetchNewYouTubeVideos()`, refatorar `syncVideos()` |

### Definição de Pronto

- [ ] Função `getExistingVideoIds()` implementada e testada
- [ ] Função `fetchNewYouTubeVideos()` implementada com early exit
- [ ] `syncVideos()` refatorada para usar nova função
- [ ] Logs de economia de quota implementados
- [ ] Testes manuais com canal real validados
- [ ] Comportamento de first sync (Firestore vazio) preservado

### Estimativa

**Complexidade:** Baixa-Média
**Impacto:** Alto (60-80% economia de quota)

### Notas de Implementação

```typescript
// Pseudocódigo da solução

async function getExistingVideoIds(podcastId: string): Promise<Set<string>> {
  const snapshot = await db
    .collection('podcasts')
    .doc(podcastId)
    .collection('videos')
    .select() // Apenas IDs, sem dados
    .get()

  return new Set(snapshot.docs.map(doc => doc.id))
}

async function fetchNewYouTubeVideos(
  client: YouTubeClient,
  channelId: string,
  existingIds: Set<string>
): Promise<YouTubeVideoDataFromAPI[]> {
  const newVideos: YouTubeVideoDataFromAPI[] = []
  let pageToken: string | undefined
  let pagesChecked = 0
  let earlyExit = false

  do {
    pagesChecked++
    const result = await client.listVideos({ maxResults: 50, pageToken, channelId })

    for (const video of result.videos) {
      if (existingIds.has(video.id)) {
        earlyExit = true
        break // Encontrou existente, para de processar esta página
      }
      newVideos.push(video)
    }

    if (earlyExit) break // Não busca próximas páginas
    pageToken = result.nextPageToken
  } while (pageToken)

  log('INFO', 'Delta sync completed', {
    pagesChecked,
    earlyExit,
    newVideosFound: newVideos.length,
    existingVideosSkipped: existingIds.size,
  })

  return newVideos
}
```

---

## Story 7.2: Otimização de Batch Video Details

### Descrição

**Como** desenvolvedor
**Quero** otimizar as chamadas de API para detalhes de vídeos
**Para** reduzir ainda mais o consumo de quota

### Contexto Técnico

Atualmente, `listVideos()` em `client.ts:369-394` faz 2 chamadas por página:

```typescript
// Para cada página:
const { videoIds } = await this.listPlaylistItems(...)  // 1ª chamada
const videos = await this.getVideoDetails(videoIds)      // 2ª chamada
```

**Problema:** Mesmo com Delta Sync, buscamos detalhes de vídeos que já existem na mesma página que contém vídeos novos.

**Solução:** Separar coleta de IDs da busca de detalhes, filtrando IDs antes de chamar `videos.list`.

### Premissas

1. Story 7.1 (Delta Sync) já implementada
2. `videos.list` aceita até 50 IDs por chamada
3. Detalhes são necessários apenas para vídeos novos

### Critérios de Aceite

```gherkin
Feature: Batch Video Details Otimizado

  Background:
    Given Delta Sync está implementado (Story 7.1)
    And existem 200 vídeos no Firestore
    And existem 5 vídeos novos no YouTube

  Scenario: Buscar detalhes apenas de vídeos novos
    When o sync é executado
    Then playlistItems.list deve ser chamado (para coletar IDs)
    And videos.list deve ser chamado apenas 1 vez
    And videos.list deve receber apenas os 5 IDs novos
    And os 45 IDs existentes na página não devem ter detalhes buscados

  Scenario: Muitos vídeos novos em múltiplas páginas
    Given 80 vídeos novos no YouTube
    When o sync é executado
    Then playlistItems.list deve ser chamado 2 vezes
    And videos.list deve ser chamado 2 vezes (80 IDs / 50 por chamada)
```

### Tarefas Técnicas

1. **Criar método `listPlaylistVideoIds()`** em `client.ts`
   - Retorna apenas IDs sem buscar detalhes
   - Implementa paginação com early exit

2. **Modificar fluxo de sync**
   - Fase 1: Coletar IDs novos (com early exit)
   - Fase 2: Buscar detalhes em batch único

3. **Otimizar `getVideoDetails()`**
   - Aceitar array > 50 IDs
   - Fazer chunking interno em lotes de 50

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/youtube/client.ts` | Novo método `listPlaylistVideoIds()`, otimizar `getVideoDetails()` |
| `src/lib/sync/sync-videos.ts` | Usar novo fluxo de 2 fases |

### Definição de Pronto

- [ ] Método `listPlaylistVideoIds()` implementado
- [ ] `getVideoDetails()` suporta > 50 IDs com chunking
- [ ] Sync usa fluxo otimizado de 2 fases
- [ ] Economia de quota validada em logs

### Estimativa

**Complexidade:** Média
**Impacto:** Médio (20-30% economia adicional de quota)

### Dependências

- Story 7.1 (Delta Sync) deve estar implementada

### Notas de Implementação

```typescript
// Pseudocódigo

class YouTubeClient {
  /**
   * Lista apenas IDs de vídeos da playlist (sem detalhes).
   * Mais eficiente quando precisamos filtrar antes de buscar detalhes.
   */
  async listPlaylistVideoIds(
    playlistId: string,
    options?: { maxResults?: number; pageToken?: string }
  ): Promise<{ videoIds: string[]; nextPageToken?: string }> {
    // Apenas playlistItems.list, sem videos.list
    return this.listPlaylistItems(playlistId, options?.maxResults, options?.pageToken)
  }

  /**
   * Busca detalhes de vídeos com chunking automático.
   * Aceita qualquer quantidade de IDs.
   */
  async getVideoDetailsBatch(videoIds: string[]): Promise<YouTubeVideoDataFromAPI[]> {
    if (videoIds.length === 0) return []

    const chunks = chunk(videoIds, 50) // Split em lotes de 50
    const results = await Promise.all(
      chunks.map(chunk => this.getVideoDetails(chunk))
    )

    return results.flat()
  }
}

// Em sync-videos.ts
async function fetchNewYouTubeVideosOptimized(
  client: YouTubeClient,
  channelId: string,
  existingIds: Set<string>
): Promise<YouTubeVideoDataFromAPI[]> {
  // Fase 1: Coletar apenas IDs novos
  const newVideoIds: string[] = []
  let pageToken: string | undefined
  const uploadsPlaylistId = YouTubeClient.channelIdToUploadsPlaylist(channelId)

  do {
    const { videoIds, nextPageToken } = await client.listPlaylistVideoIds(
      uploadsPlaylistId,
      { maxResults: 50, pageToken }
    )

    let foundExisting = false
    for (const id of videoIds) {
      if (existingIds.has(id)) {
        foundExisting = true
        break
      }
      newVideoIds.push(id)
    }

    if (foundExisting) break
    pageToken = nextPageToken
  } while (pageToken)

  // Fase 2: Buscar detalhes apenas dos novos
  if (newVideoIds.length === 0) return []
  return client.getVideoDetailsBatch(newVideoIds)
}
```

---

## Story 7.3: Paralelização de Download de Thumbnails

### Descrição

**Como** produtor de podcast
**Quero** que o sync de vídeos novos seja mais rápido
**Para** não esperar muito tempo durante a importação inicial

### Contexto Técnico

Atualmente, o download de thumbnails em `sync-videos.ts:269-287` é sequencial:

```typescript
for (const { ytVideo, videoType } of newVideosToProcess) {
  // Download sequencial - LENTO
  storageThumbnailUrl = await uploadVideoThumbnail(...)
}
```

**Problema:** Para 10 vídeos novos:
- Download sequencial: 10 × 1s = 10s
- Upload sequencial: 10 × 1s = 10s
- **Total: ~20s**

**Solução:** Paralelizar com limite de concorrência para não sobrecarregar.

### Premissas

1. Firebase Storage suporta uploads paralelos
2. Limite de 5 uploads simultâneos é seguro
3. Não há dependência entre uploads de diferentes vídeos

### Critérios de Aceite

```gherkin
Feature: Download Paralelo de Thumbnails

  Scenario: Sync com 10 vídeos novos
    Given 10 vídeos novos para importar
    When o sync é executado
    Then os thumbnails devem ser baixados em paralelo (max 5 simultâneos)
    And o tempo total deve ser menor que 8 segundos
    And todos os thumbnails devem ser salvos corretamente

  Scenario: Sync com 1 vídeo novo
    Given 1 vídeo novo para importar
    When o sync é executado
    Then o comportamento deve ser idêntico ao sequencial
    And o thumbnail deve ser salvo corretamente

  Scenario: Falha em download de thumbnail
    Given 5 vídeos novos para importar
    And 1 thumbnail está indisponível (404)
    When o sync é executado
    Then os outros 4 thumbnails devem ser salvos
    And o vídeo com falha deve usar fallback (null)
    And o sync não deve falhar
```

### Tarefas Técnicas

1. **Adicionar dependência `p-limit`**
   - Biblioteca leve para controle de concorrência
   - Alternativa: implementar manualmente com Promise

2. **Refatorar loop de thumbnails**
   - Usar `Promise.all` com limite de concorrência
   - Manter tratamento de erros individual

3. **Adicionar configuração de concorrência**
   - Constante `THUMBNAIL_CONCURRENCY = 5`
   - Possibilidade de ajuste futuro

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `package.json` | Adicionar `p-limit` (ou implementar nativo) |
| `src/lib/sync/sync-videos.ts` | Paralelizar loop de thumbnails |

### Definição de Pronto

- [ ] Controle de concorrência implementado
- [ ] Loop de thumbnails paralelizado
- [ ] Tratamento de erros mantido (falha individual não quebra sync)
- [ ] Tempo de sync reduzido em 60%+ (medido com 10+ vídeos)

### Estimativa

**Complexidade:** Baixa
**Impacto:** Alto em performance (60-70% redução de tempo)

### Notas de Implementação

```typescript
// Opção 1: Usando p-limit
import pLimit from 'p-limit'

const THUMBNAIL_CONCURRENCY = 5
const limit = pLimit(THUMBNAIL_CONCURRENCY)

const toCreate: VideoCreate[] = await Promise.all(
  newVideosToProcess.map(({ ytVideo, videoType }) =>
    limit(async () => {
      const thumbnailUrls = [
        ytVideo.thumbnails.maxres?.url,
        ytVideo.thumbnails.standard?.url,
        ytVideo.thumbnails.high?.url,
        ytVideo.thumbnails.medium?.url,
        ytVideo.thumbnails.default?.url,
      ].filter(Boolean) as string[]

      let storageThumbnailUrl: string | null = null
      if (thumbnailUrls.length > 0) {
        try {
          storageThumbnailUrl = await uploadVideoThumbnail(podcastId, ytVideo.id, thumbnailUrls)
        } catch (error) {
          log('WARN', 'Failed to upload thumbnail', { videoId: ytVideo.id, error })
          // Continua sem thumbnail - não quebra o sync
        }
      }

      return youtubeToVideoCreate(ytVideo, podcastId, videoType, storageThumbnailUrl)
    })
  )
)
```

```typescript
// Opção 2: Implementação nativa (sem dependência externa)
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = []
  const executing: Promise<void>[] = []

  for (const item of items) {
    const promise = fn(item).then(result => {
      results.push(result)
    })
    executing.push(promise)

    if (executing.length >= concurrency) {
      await Promise.race(executing)
      // Remove promises resolvidas
      executing.splice(0, executing.findIndex(p => p === promise) + 1)
    }
  }

  await Promise.all(executing)
  return results
}

// Uso
const toCreate = await parallelMap(
  newVideosToProcess,
  async ({ ytVideo, videoType }) => {
    // ... processamento
  },
  5 // concurrency
)
```

---

## Ordem de Implementação Recomendada

```
Story 7.1 (Delta Sync)
    ↓
Story 7.2 (Batch Details)  ←  Depende de 7.1
    ↓
Story 7.3 (Parallelização)  ←  Independente, pode ser feita em paralelo com 7.2
```

### Timeline Sugerida

| Story | Estimativa | Impacto |
|-------|------------|---------|
| 7.1 | 2-3 horas | 60-80% economia quota |
| 7.2 | 3-4 horas | 20-30% economia adicional |
| 7.3 | 1-2 horas | 60-70% redução tempo |
| **Total** | **6-9 horas** | **~85% economia quota, ~70% mais rápido** |

---

## Métricas de Validação

Após implementação, validar:

```typescript
// Adicionar ao log de sync
log('INFO', 'Sync metrics', {
  // Quota
  playlistItemsCalls: number,
  videoDetailsCalls: number,
  estimatedQuotaUsed: number,

  // Performance
  totalTimeMs: number,
  thumbnailDownloadTimeMs: number,
  firestoreWriteTimeMs: number,

  // Results
  newVideosImported: number,
  existingVideosSkipped: number,
  earlyExitTriggered: boolean,
})
```
