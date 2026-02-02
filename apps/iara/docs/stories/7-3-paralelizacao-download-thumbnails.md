# Story 7.3: Paralelização de Download de Thumbnails

Status: done

## Story

As a **produtor de podcast**,
I want **que o sync de vídeos novos seja mais rápido**,
so that **não espero muito tempo durante a importação inicial**.

## Acceptance Criteria

```gherkin
Feature: Download Paralelo de Thumbnails

  Background:
    Given Delta Sync está implementado (Stories 7.1 e 7.2)
    And existe um podcast com channelId configurado

  Scenario: Sync com 10 vídeos novos
    Given 10 vídeos novos para importar
    When o sync é executado
    Then os thumbnails devem ser baixados em paralelo (max 5 simultâneos)
    And o tempo total deve ser significativamente menor que sequencial
    And todos os thumbnails devem ser salvos corretamente no Storage

  Scenario: Sync com 1 vídeo novo
    Given 1 vídeo novo para importar
    When o sync é executado
    Then o comportamento deve ser equivalente ao sequencial
    And o thumbnail deve ser salvo corretamente

  Scenario: Falha em download de thumbnail
    Given 5 vídeos novos para importar
    And 1 thumbnail está indisponível (404 ou erro de rede)
    When o sync é executado
    Then os outros 4 thumbnails devem ser salvos
    And o vídeo com falha deve continuar sem storageThumbnailUrl
    And o sync não deve falhar
    And um log de warning deve ser emitido para a falha

  Scenario: Muitos vídeos novos (>15)
    Given 20 vídeos novos para importar
    When o sync é executado
    Then no máximo 5 uploads simultâneos devem ocorrer
    And todos os thumbnails devem ser processados
```

## Tasks / Subtasks

- [x] **Task 1: Implementar função de controle de concorrência** (AC: #1, #4)
  - [x] 1.1 Criar função `parallelMap<T, R>()` em `sync-videos.ts`
  - [x] 1.2 Aceitar parâmetros: items, async function, concurrency limit
  - [x] 1.3 Garantir que no máximo N operações executam simultaneamente
  - [x] 1.4 Preservar ordem dos resultados (opcional, mas preferível)

- [x] **Task 2: Refatorar loop de thumbnails para usar paralelização** (AC: #1, #2, #3, #4)
  - [x] 2.1 Substituir loop `for...of` sequencial por `parallelMap()`
  - [x] 2.2 Usar constante `THUMBNAIL_UPLOAD_CONCURRENCY = 5`
  - [x] 2.3 Manter tratamento de erro individual (try/catch dentro de cada operação)
  - [x] 2.4 Adicionar logging com métricas de tempo

- [x] **Task 3: Adicionar testes** (AC: #1, #2, #3)
  - [x] 3.1 Testar upload de múltiplos thumbnails em paralelo
  - [x] 3.2 Testar que falha em um item não afeta outros
  - [x] 3.3 Testar que não chama upload quando não há vídeos novos

## Dev Notes

### Contexto Técnico

Atualmente, o upload de thumbnails em `sync-videos.ts:362-380` é **sequencial**:

```typescript
// LENTO: Upload sequencial
for (const { ytVideo, videoType } of newVideosToProcess) {
  // ... build thumbnailUrls
  storageThumbnailUrl = await uploadVideoThumbnail(podcastId, ytVideo.id, thumbnailUrls)
  // ...
}
```

**Problema:** Para 10 vídeos novos, se cada upload leva ~1s:
- Sequential: 10 × 1s = **10s**
- Parallel (5 concurrent): ceil(10/5) × 1s = **2s**

### Arquitetura de Solução

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANTES (Sequencial)                           │
├─────────────────────────────────────────────────────────────────┤
│  Video 1 ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Video 2 ░░░░████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Video 3 ░░░░░░░░████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ...                                                             │
│  Total: 10s                                                      │
├─────────────────────────────────────────────────────────────────┤
│                    DEPOIS (Paralelo, max 5)                      │
├─────────────────────────────────────────────────────────────────┤
│  Video 1 ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Video 2 ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Video 3 ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Video 4 ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Video 5 ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Video 6 ░░░░████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ...                                                             │
│  Total: 2s                                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Project Structure Notes

**Arquivos a modificar:**

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/sync/sync-videos.ts` | Nova função `parallelMap()`, refatorar loop de thumbnails (linhas 360-380) |
| `src/lib/sync/sync-videos.test.ts` | Testes para paralelização |

**Padrões existentes a seguir:**

- Logging com `log()` de `@/lib/logger` (níveis: INFO, WARN, ERROR)
- Tratamento de erro com fallback (falha individual não quebra sync)
- Tipagem TypeScript estrita com generics

### Código de Referência

**Task 1 - parallelMap (implementação nativa sem dependência):**

```typescript
/**
 * Maps over items with controlled concurrency.
 *
 * Unlike Promise.all which runs everything at once, this limits
 * the number of concurrent operations to avoid overwhelming
 * external services (Firebase Storage, network, etc).
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum concurrent operations
 * @returns Array of results in same order as input
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let currentIndex = 0

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++
      results[index] = await fn(items[index], index)
    }
  }

  // Start `concurrency` workers
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  )

  await Promise.all(workers)
  return results
}
```

**Task 2 - Refatoração do loop de thumbnails:**

```typescript
const THUMBNAIL_UPLOAD_CONCURRENCY = 5

// Parallel thumbnail upload with concurrency limit
log('INFO', 'Uploading thumbnails to Storage (parallel)', {
  podcastId,
  count: newVideosToProcess.length,
  concurrency: THUMBNAIL_UPLOAD_CONCURRENCY,
})

const startTime = Date.now()

const toCreate: VideoCreate[] = await parallelMap(
  newVideosToProcess,
  async ({ ytVideo, videoType }) => {
    // Build list of thumbnail URLs to try (prefer higher resolution)
    const thumbnailUrls: string[] = []
    const thumbs = ytVideo.thumbnails
    if (thumbs.maxres?.url) thumbnailUrls.push(thumbs.maxres.url)
    if (thumbs.standard?.url) thumbnailUrls.push(thumbs.standard.url)
    if (thumbs.high?.url) thumbnailUrls.push(thumbs.high.url)
    if (thumbs.medium?.url) thumbnailUrls.push(thumbs.medium.url)
    if (thumbs.default?.url) thumbnailUrls.push(thumbs.default.url)

    // Upload thumbnail to Storage (with error handling)
    let storageThumbnailUrl: string | null = null
    if (thumbnailUrls.length > 0) {
      try {
        storageThumbnailUrl = await uploadVideoThumbnail(podcastId, ytVideo.id, thumbnailUrls)
      } catch (error) {
        log('WARN', 'Failed to upload thumbnail, continuing without it', {
          videoId: ytVideo.id,
          error: error instanceof Error ? error.message : String(error),
        })
        // Continue without thumbnail - sync should not fail
      }
    }

    return youtubeToVideoCreate(ytVideo, podcastId, videoType, storageThumbnailUrl)
  },
  THUMBNAIL_UPLOAD_CONCURRENCY
)

const uploadTimeMs = Date.now() - startTime
log('INFO', 'Thumbnail uploads completed', {
  podcastId,
  count: toCreate.length,
  timeMs: uploadTimeMs,
  avgTimePerVideo: Math.round(uploadTimeMs / toCreate.length),
})
```

### Dependências

- **Story 7.1 (Delta Sync):** ✅ Implementada
- **Story 7.2 (Batch Video Details):** ✅ Implementada

### Métricas de Sucesso

| Métrica | Antes | Depois |
|---------|-------|--------|
| Tempo para 10 thumbnails | ~10s | ~2s |
| Tempo para 20 thumbnails | ~20s | ~4s |
| Redução de tempo | - | ~80% |

### Alternativas Consideradas

1. **Usar biblioteca `p-limit`**: Adiciona dependência externa, mas é mais testada
2. **`Promise.all` sem limite**: Pode sobrecarregar Firebase Storage com muitas conexões
3. **Implementação nativa (escolhida)**: Sem dependências, código simples, fácil de testar

### References

- [Source: docs/stories/epic-sync-optimization.md#Story 7.3]
- [Source: src/lib/sync/sync-videos.ts:393-445] - Loop de thumbnails (paralelo com parallelMap)
- [Source: src/lib/sync/sync-videos.ts:46-69] - Função `parallelMap()`
- [Source: src/lib/firebase/storage-admin.ts] - Função `uploadVideoThumbnail()`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Story criada a partir do epic `docs/stories/epic-sync-optimization.md`
- Depende das Stories 7.1 e 7.2 que já estão implementadas (status: done)
- Implementação nativa preferida para evitar dependências externas
- `parallelMap<T, R>()` implementada com worker pattern para controle de concorrência
- Loop de thumbnails refatorado para usar `parallelMap()` com `THUMBNAIL_UPLOAD_CONCURRENCY = 5`
- Tratamento de erro individual: falha em um thumbnail não quebra o sync
- 76 testes passando (37 client.test.ts + 24 sync-videos.test.ts + 15 videos-admin.test.ts)

### Debug Log References

- Logging atualizado com métricas de tempo:
  - `'Uploading thumbnails to Storage (parallel)'` com count e concurrency
  - `'Thumbnail uploads completed'` com timeMs e avgTimePerVideo
  - `'Failed to upload thumbnail, continuing without it'` (WARN) para falhas individuais

### File List

- `src/lib/sync/sync-videos.ts` - `THUMBNAIL_UPLOAD_CONCURRENCY` (linha 32), `parallelMap()` (linhas 46-70), refatoração do loop (linhas 394-446)
- `src/lib/sync/sync-videos.test.ts` - Mock `uploadVideoThumbnail`, 6 testes "Parallel Thumbnail Upload (Story 7.3)"
