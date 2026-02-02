# Story 7.2: Otimização de Batch Video Details

Status: done

## Story

As a **desenvolvedor**,
I want **otimizar as chamadas de API para detalhes de vídeos**,
so that **reduzo ainda mais o consumo de quota do YouTube API**.

## Acceptance Criteria

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

  Scenario: Nenhum vídeo novo
    Given nenhum vídeo novo no YouTube
    When o sync é executado
    Then playlistItems.list deve ser chamado 1 vez
    And videos.list NÃO deve ser chamado
    And result.added deve ser 0
```

## Tasks / Subtasks

- [x] **Task 1: Adicionar método `getVideoDetailsBatch()` no YouTubeClient** (AC: #1, #2)
  - [x] 1.1 Criar método que aceita array de qualquer tamanho
  - [x] 1.2 Implementar chunking automático em lotes de 50 (limite da API)
  - [x] 1.3 Usar `Promise.all` para processar chunks em paralelo
  - [x] 1.4 Adicionar testes unitários

- [x] **Task 2: Refatorar `fetchNewYouTubeVideos()` para fluxo 2-fases** (AC: #1, #2, #3)
  - [x] 2.1 Fase 1: Usar `client.listPlaylistItems()` diretamente para coletar apenas IDs
  - [x] 2.2 Filtrar IDs existentes ANTES de buscar detalhes
  - [x] 2.3 Fase 2: Chamar `getVideoDetailsBatch()` apenas para IDs novos
  - [x] 2.4 Preservar early exit logic
  - [x] 2.5 Atualizar logging com métricas de economia

- [x] **Task 3: Adicionar testes para nova lógica** (AC: #1, #2, #3)
  - [x] 3.1 Testar chunking de > 50 IDs em getVideoDetailsBatch
  - [x] 3.2 Testar que videos.list só é chamado para IDs novos
  - [x] 3.3 Testar cenário sem vídeos novos (videos.list não chamado)

## Dev Notes

### Contexto Técnico

A Story 7.1 (Delta Sync) implementou early exit, mas ainda há desperdício de quota:

**Problema anterior em `fetchNewYouTubeVideos()` (antes da Story 7.2):**

```typescript
// INEFICIENTE: client.listVideos() busca detalhes para TODOS os 50 vídeos
const result = await client.listVideos({ maxResults: 50, pageToken, channelId })

// Depois filtra para apenas os novos - mas já gastou quota buscando detalhes dos existentes!
for (const video of result.videos) {
  if (existingIds.has(video.id)) break
  newVideos.push(video)
}
```

**Fluxo atual:**
```
listVideos() →
  ├── playlistItems.list (50 IDs)     → 1 call
  └── videos.list (50 IDs)            → 1 call (DESPERDÍCIO!)
```

**Fluxo otimizado (2-fases):**
```
Fase 1: listPlaylistItems() (50 IDs)  → 1 call
        └── Filtra: 5 novos, 45 existentes descartados
Fase 2: getVideoDetails(5 novos)      → 1 call (ECONOMIA!)
```

### Implementação do YouTubeClient

O método `listPlaylistItems()` já existe em `client.ts:296-310` e retorna apenas IDs:

```typescript
async listPlaylistItems(
  playlistId: string,
  maxResults = 50,
  pageToken?: string
): Promise<{ videoIds: string[]; nextPageToken?: string }>
```

Precisamos adicionar `getVideoDetailsBatch()` para lidar com > 50 IDs:

```typescript
/**
 * Fetches video details with automatic chunking for large ID arrays.
 * Handles YouTube API limit of 50 IDs per request.
 *
 * @param videoIds - Array of video IDs (any size)
 * @returns Array of video details
 */
async getVideoDetailsBatch(videoIds: string[]): Promise<YouTubeVideoDataFromAPI[]> {
  if (videoIds.length === 0) return []

  // Chunk into batches of 50 (YouTube API limit)
  const chunks: string[][] = []
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50))
  }

  // Fetch all chunks in parallel
  const results = await Promise.all(
    chunks.map(chunk => this.getVideoDetails(chunk))
  )

  return results.flat()
}
```

### Refatoração de fetchNewYouTubeVideos()

```typescript
async function fetchNewYouTubeVideos(
  client: YouTubeClient,
  channelId: string,
  existingIds: Set<string>
): Promise<YouTubeVideoDataFromAPI[]> {
  const newVideoIds: string[] = []
  let pageToken: string | undefined
  let pagesChecked = 0
  let earlyExit = false
  let totalIdsChecked = 0

  const isFirstSync = existingIds.size === 0
  const uploadsPlaylistId = YouTubeClient.channelIdToUploadsPlaylist(channelId)

  // FASE 1: Coletar apenas IDs novos
  do {
    pagesChecked++
    const { videoIds, nextPageToken } = await client.listPlaylistItems(
      uploadsPlaylistId,
      50,
      pageToken
    )

    totalIdsChecked += videoIds.length

    for (const id of videoIds) {
      if (!isFirstSync && existingIds.has(id)) {
        earlyExit = true
        break
      }
      newVideoIds.push(id)
    }

    if (earlyExit) break
    pageToken = nextPageToken
  } while (pageToken)

  // FASE 2: Buscar detalhes APENAS dos novos
  const newVideos = newVideoIds.length > 0
    ? await client.getVideoDetailsBatch(newVideoIds)
    : []

  log('INFO', 'Delta sync fetch completed (optimized)', {
    pagesChecked,
    earlyExit,
    isFirstSync,
    totalIdsChecked,
    idsSkipped: totalIdsChecked - newVideoIds.length,
    newVideosFound: newVideos.length,
    videoDetailsCalls: Math.ceil(newVideoIds.length / 50),
    existingVideosCount: existingIds.size,
  })

  return newVideos
}
```

### Project Structure Notes

**Arquivos a modificar:**

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/youtube/client.ts` | Novo método `getVideoDetailsBatch()` |
| `src/lib/sync/sync-videos.ts` | Refatorar `fetchNewYouTubeVideos()` para fluxo 2-fases |
| `src/lib/youtube/client.test.ts` | Testes para `getVideoDetailsBatch()` |
| `src/lib/sync/sync-videos.test.ts` | Testes para fluxo otimizado |

**Padrões existentes a seguir:**

- Logging com `log()` de `@/lib/logger` (níveis: INFO, WARN, ERROR)
- Documentação JSDoc em todas as funções exportadas
- Tipagem TypeScript estrita
- Mocks com vitest para testes unitários

### Dependências

- **Story 7.1 (Delta Sync):** ✅ Implementada - `fetchNewYouTubeVideos()` e `getExistingVideoIds()` já existem

### Métricas de Economia

**Cenário: 200 vídeos existentes, 5 novos na primeira página**

| Métrica | Antes (7.1) | Depois (7.2) |
|---------|-------------|--------------|
| playlistItems.list calls | 1 | 1 |
| videos.list calls | 1 (50 IDs) | 1 (5 IDs) |
| Quota por sync | 3 units | 3 units |
| IDs processados em videos.list | 50 | 5 |

**Cenário: 200 existentes, 5 novos, early exit na 1ª página**

A economia real é no processamento:
- Antes: Busca detalhes de 50 vídeos, descarta 45
- Depois: Busca detalhes de 5 vídeos, usa todos

**Economia adicional em cenários específicos:**
- Quando há muitos vídeos novos (80+), os chunks de 50 evitam erros da API
- Quando há 0 vídeos novos, `videos.list` não é chamado (economia de 1 call)

### References

- [Source: docs/stories/epic-sync-optimization.md#Story 7.2]
- [Source: docs/stories/7-1-delta-sync-early-exit.md] - Story anterior implementada
- [Source: src/lib/sync/sync-videos.ts:72-118] - Função `fetchNewYouTubeVideos()` atual
- [Source: src/lib/youtube/client.ts:296-310] - Método `listPlaylistItems()` existente
- [Source: src/lib/youtube/client.ts:321-344] - Método `getVideoDetails()` existente
- [Source: src/lib/youtube/client.ts:369-394] - Método `listVideos()` a ser substituído

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Story criada a partir do epic `docs/stories/epic-sync-optimization.md`
- Depende da Story 7.1 que já está implementada (status: done)
- Implementação seguiu o padrão estabelecido em Story 7.1
- `getVideoDetailsBatch()` implementado com chunking automático de 50 IDs
- `fetchNewYouTubeVideos()` refatorada para fluxo 2-fases:
  - Fase 1: `listPlaylistItems()` coleta apenas IDs
  - Fase 2: `getVideoDetailsBatch()` busca detalhes apenas de IDs novos
- 70 testes passando (37 client.test.ts + 18 sync-videos.test.ts + 15 videos-admin.test.ts)

### Debug Log References

- Logging atualizado em `fetchNewYouTubeVideos()` com métricas detalhadas:
  - `pagesChecked`, `earlyExit`, `isFirstSync`
  - `totalIdsChecked`, `idsSkipped`, `newVideosFound`
  - `playlistItemsCalls`, `videoDetailsCalls`, `quotaUsed`, `quotaSaved`

### File List

- `src/lib/youtube/client.ts` - Novo método `getVideoDetailsBatch()` (linhas 361-391)
- `src/lib/youtube/client.test.ts` - 5 novos testes para `getVideoDetailsBatch()`
- `src/lib/sync/sync-videos.ts` - Refatoração de `fetchNewYouTubeVideos()` (linhas 75-145)
- `src/lib/sync/sync-videos.test.ts` - 3 novos testes "2-Phase Optimized Flow (Story 7.2)"
