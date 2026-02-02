# Story 7.1: Delta Sync com Early Exit

Status: done

## Story

As a **produtor de podcast**,
I want **que o sync busque apenas vídeos novos do YouTube**,
so that **economizo quota da API e tenho syncs mais rápidos**.

## Acceptance Criteria

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

## Tasks / Subtasks

- [x] **Task 1: Criar função `getExistingVideoIds()`** (AC: #1, #2, #3, #4)
  - [x] 1.1 Criar função em `src/lib/firebase/videos-admin.ts`
  - [x] 1.2 Usar query otimizada com `.select()` para retornar apenas IDs
  - [x] 1.3 Retornar `Set<string>` para lookup O(1)
  - [x] 1.4 Adicionar logging de contagem de IDs carregados

- [x] **Task 2: Criar função `fetchNewYouTubeVideos()`** (AC: #1, #2, #3)
  - [x] 2.1 Criar função em `src/lib/sync/sync-videos.ts`
  - [x] 2.2 Receber `existingIds: Set<string>` como parâmetro
  - [x] 2.3 Implementar early exit ao encontrar primeiro ID existente
  - [x] 2.4 Coletar apenas vídeos novos no array de retorno

- [x] **Task 3: Refatorar `syncVideos()` para usar Delta Sync** (AC: #1, #2, #3, #4)
  - [x] 3.1 Chamar `getExistingVideoIds()` no início do sync
  - [x] 3.2 Substituir `fetchAllYouTubeVideos()` por `fetchNewYouTubeVideos()`
  - [x] 3.3 Manter compatibilidade com fluxo existente (re-evaluate sent videos)
  - [x] 3.4 Preservar comportamento de primeiro sync (Firestore vazio)

- [x] **Task 4: Adicionar logging de métricas** (AC: #1)
  - [x] 4.1 Log de páginas requisitadas vs páginas evitadas
  - [x] 4.2 Log de economia estimada de quota
  - [x] 4.3 Log de `earlyExit: true/false` para debugging

- [ ] **Task 5: Testes manuais** (AC: #1, #2, #3, #4)
  - [ ] 5.1 Testar sync com vídeos novos (canal real)
  - [ ] 5.2 Testar sync sem vídeos novos
  - [ ] 5.3 Verificar logs de economia de quota

## Dev Notes

### Contexto Técnico

O sync atual em `fetchAllYouTubeVideos()` (`sync-videos.ts:62-76`) busca TODOS os vídeos usando paginação completa:

```typescript
// PROBLEMA: Busca todos os vídeos sempre
async function fetchAllYouTubeVideos(client, channelId) {
  const allVideos = []
  let pageToken
  do {
    const result = await client.listVideos({ maxResults: 50, pageToken, channelId })
    allVideos.push(...result.videos)
    pageToken = result.nextPageToken
  } while (pageToken)
  return allVideos
}
```

**Ineficiência:** Canal com 200 vídeos = 4 páginas × 2 calls = 8 API calls, mesmo que 95%+ já existam.

### Premissas Validadas

1. **YouTube API retorna vídeos ordenados por data de adição** (mais recentes primeiro)
2. **Vídeos novos sempre aparecem no início da lista**
3. **Se encontramos um vídeo existente, todos os subsequentes também existem**

### Arquitetura de Solução

```
┌─────────────────────────────────────────────────────────────────┐
│                        syncVideos()                              │
├─────────────────────────────────────────────────────────────────┤
│  1. getExistingVideoIds(podcastId)  →  Set<string>              │
│  2. fetchNewYouTubeVideos(client, channelId, existingIds)       │
│     └── Para cada página:                                        │
│         ├── Se video.id in existingIds → EARLY EXIT             │
│         └── Senão → adiciona ao array de novos                  │
│  3. Processa apenas vídeos novos (thumbnails, Firestore)        │
└─────────────────────────────────────────────────────────────────┘
```

### Project Structure Notes

**Arquivos a modificar:**

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/firebase/videos-admin.ts` | Nova função `getExistingVideoIds()` |
| `src/lib/sync/sync-videos.ts` | Nova função `fetchNewYouTubeVideos()`, refatorar `syncVideos()` |

**Padrões existentes a seguir:**

- Logging com `log()` de `@/lib/logger` (níveis: INFO, WARN, ERROR)
- Funções async com tratamento de erro e logging
- Documentação JSDoc em todas as funções exportadas
- Tipagem TypeScript estrita

### Código de Referência

**Task 1 - getExistingVideoIds:**

```typescript
// src/lib/firebase/videos-admin.ts

/**
 * Gets all existing video IDs for a podcast (optimized query).
 *
 * Uses .select() to return only document IDs without fetching data.
 * Returns a Set for O(1) lookup performance in delta sync.
 *
 * @param podcastId - The podcast document ID
 * @returns Set of existing video IDs
 */
export async function getExistingVideoIds(podcastId: string): Promise<Set<string>> {
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  const snapshot = await videosRef.select().get()  // Apenas IDs, sem dados

  const ids = new Set(snapshot.docs.map(doc => doc.id))

  log('INFO', 'Existing video IDs loaded for delta sync', {
    podcastId,
    count: ids.size,
  })

  return ids
}
```

**Task 2 - fetchNewYouTubeVideos:**

```typescript
// src/lib/sync/sync-videos.ts

/**
 * Fetches only NEW videos from YouTube using delta sync with early exit.
 *
 * Stops fetching when encountering a video that already exists in Firestore.
 * This optimizes quota usage by avoiding re-fetching existing videos.
 *
 * @param client - YouTube API client
 * @param channelId - YouTube channel ID
 * @param existingIds - Set of video IDs that already exist in Firestore
 * @returns Array of new videos only
 */
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
    estimatedQuotaSaved: earlyExit ? `~${(existingIds.size / 50) * 2} units` : '0 units',
  })

  return newVideos
}
```

### References

- [Source: docs/stories/epic-sync-optimization.md#Story 7.1]
- [Source: src/lib/sync/sync-videos.ts:62-76] - Função atual `fetchAllYouTubeVideos()`
- [Source: src/lib/firebase/videos-admin.ts:309-325] - Função existente `getAllVideosRaw()`
- [Source: src/lib/youtube/client.ts:369-394] - Método `listVideos()` do YouTube client

### Métricas de Sucesso

| Métrica | Antes | Depois |
|---------|-------|--------|
| Quota por sync (200 vídeos, 3 novos) | ~8 units | ~2 units |
| API calls por sync | 8 | 2 |
| Economia de quota | - | 60-80% |

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Story criada a partir do epic `docs/stories/epic-sync-optimization.md`
- Código de referência incluído para acelerar implementação
- Premissas sobre ordenação do YouTube API validadas na documentação

### Debug Log References

(A ser preenchido durante implementação)

### File List

- `src/lib/firebase/videos-admin.ts` - Nova função `getExistingVideoIds()`
- `src/lib/firebase/videos-admin.test.ts` - Testes para `getExistingVideoIds()`
- `src/lib/sync/sync-videos.ts` - Nova função `fetchNewYouTubeVideos()`, refatoração de `syncVideos()`
- `src/lib/sync/sync-videos.test.ts` - Testes para delta sync com early exit
