# Estado Atual do Projeto IAra

**Data**: 2026-01-27
**Sessão**: Implementação Story 3-5 (VideoListItem)

---

## O Que Foi Implementado (Story 3-5)

- `src/components/videos/video-list-item.tsx` - Componente de item da lista
- `src/components/videos/video-list-item.test.tsx` - Testes
- `src/hooks/use-videos.ts` - Hook para buscar vídeos via API
- `src/hooks/use-videos.test.ts` - Testes
- `src/app/api/videos/route.ts` - API endpoint (usa Admin SDK)
- Integração com `VideoListPanel` e `VideosLayout`

**Testes**: 575 passando
**Build**: Passando

---

## PROBLEMA PRINCIPAL (NÃO RESOLVIDO)

### Os vídeos existem no Firestore mas NÃO aparecem na interface

**Verificado**: Vídeos ESTÃO em `podcasts/pptnc/videos` no database `pptnc-stage`

```
podcasts/pptnc/videos: tem documentos
  - -1s3XJfYBHE "O Maior Ataque Hacker ao Banco Central"
  - (muitos outros)
```

### Causa provável (não confirmada)

A função `getVideosForDisplayAdmin` parece correta - ela lê os docs e aplica defaults. Mas algo está impedindo a exibição. Possíveis causas:

1. Estrutura de `thumbnails` diferente do esperado pelo componente
2. Erro silencioso na API ou hook
3. Problema de renderização no componente

### O que NÃO foi verificado

- Estrutura real dos documentos (campos disponíveis)
- Se a API retorna dados corretamente
- Se o hook recebe os dados
- Se o componente renderiza

---

## REGRAS ARQUITETURAIS VIOLADAS (corrigir)

1. **Schemas muito restritivos**: `VideoSchema` exigia `status` e `videoType` como obrigatórios, mas vídeos legados não têm esses campos.
   - **Parcialmente corrigido**: Tornei opcionais no schema
   - **Regra**: ID é a única validação necessária para saber se vídeo existe

2. **Compatibilidade retroativa**: IAra ADICIONA campos, não torna incompatível com portal-web

---

## ERROS CORRIGIDOS (colaterais)

Durante a sessão, vários erros pré-existentes foram encontrados e corrigidos:

- Scripts usando `getFirestore(undefined, ...)` → corrigido para `getFirestore(getApp(), ...)`
- Exports inexistentes em schemas (`YouTubeDataSchema`, `GeneratedDataSchema`)
- `direction` → `orientation` no ResizablePanelGroup
- `ZodError.errors` → `ZodError.issues`
- TimestampSchema incompatível entre Admin/Client SDK

---

## ARQUIVOS CHAVE MODIFICADOS

```
src/lib/schemas/video.ts          # Schemas - tornei campos IAra opcionais
src/lib/firebase/videos-admin.ts  # Função getVideosForDisplayAdmin
src/app/api/videos/route.ts       # API endpoint
src/hooks/use-videos.ts           # Hook do cliente
src/components/videos/video-list-panel.tsx  # Scroll fix
src/lib/sync/sync-videos.ts       # Re-categorização sempre aplica videoType
```

---

## PRÓXIMOS PASSOS SUGERIDOS

1. **Diagnosticar por que vídeos não aparecem**:
   - Verificar estrutura real do documento no Firestore
   - Testar API diretamente: `curl localhost:3000/api/videos`
   - Verificar console do browser para erros

2. **Verificar estrutura de thumbnails**:
   - Componente espera: `thumbnails.medium.url` ou `thumbnails.high.url`
   - Verificar o que está no Firestore

3. **Simplificar validação**:
   - Se documento tem ID, ele existe
   - Aplicar defaults para campos faltantes no display

---

## COMANDOS ÚTEIS

```bash
# Rodar testes
npm run test

# Build
npm run build

# Dev server
npm run dev

# Verificar vídeos no Firestore (requer gcloud auth)
npx tsx scripts/check-all-videos.ts
```

---

## PARA A PRÓXIMA SESSÃO

Copie este arquivo ou passe como contexto inicial:

```
Estou trabalhando no projeto IAra. Leia o arquivo CURRENT_STATE.md
para entender o estado atual. O problema principal é que os vídeos
existem no Firestore mas não aparecem na interface.
```
