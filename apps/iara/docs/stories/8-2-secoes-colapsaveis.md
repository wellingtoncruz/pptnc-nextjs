# Story 8.2: Seções Colapsáveis nas Configurações

Status: done

## Story

As a **produtor de podcast**,
I want **que as seções de configuração sejam colapsáveis**,
so that **tenha uma visão mais organizada e focar apenas na seção que estou editando**.

## Acceptance Criteria

```gherkin
Feature: Seções Colapsáveis nas Configurações

  Background:
    Given um usuário admin autenticado
    And ele está na página de configurações

  Scenario: Seções iniciam expandidas
    When a página de configurações carrega pela primeira vez
    Then todas as 4 seções devem estar expandidas por padrão
    And cada seção deve ter um ícone de chevron apontando para baixo

  Scenario: Colapsar uma seção
    Given todas as seções estão expandidas
    When o usuário clica no header da seção "Informações do Podcast"
    Then a seção deve colapsar com animação suave
    And o ícone de chevron deve rotacionar 180° (apontando para cima)
    And o conteúdo da seção deve ficar oculto

  Scenario: Expandir uma seção colapsada
    Given a seção "Personas do LLM" está colapsada
    When o usuário clica no header da seção
    Then a seção deve expandir com animação suave
    And o ícone de chevron deve rotacionar para baixo
    And o conteúdo da seção deve ficar visível

  Scenario: Estado persistente após reload
    Given o usuário colapsou as seções "Personas do LLM" e "Prompt por tipo"
    And manteve expandidas "Informações do Podcast" e "Duração"
    When ele recarrega a página (F5)
    Then as seções "Personas do LLM" e "Prompt por tipo" devem estar colapsadas
    And as seções "Informações do Podcast" e "Duração" devem estar expandidas

  Scenario: Seções são independentes
    Given múltiplas seções com estados mistos
    When o usuário expande/colapsa a seção "Duração"
    Then as outras seções NÃO devem ser afetadas
    And cada seção mantém seu estado individual
```

## Tasks / Subtasks

- [x] **Task 1: Refatorar SettingsPageClient para usar Accordion** (AC: #1, #2, #3, #4)
  - [x] 1.1 Importar componentes Accordion existentes de `@/components/ui/accordion`
  - [x] 1.2 Usar `type="multiple"` para permitir múltiplas seções abertas
  - [x] 1.3 Implementar `defaultValue` com todas as seções (4 items) para iniciar expandidas
  - [x] 1.4 Envolver cada form em AccordionItem com value único

- [x] **Task 2: Criar hook useAccordionState para persistência** (AC: #4, #5)
  - [x] 2.1 Criar `src/hooks/use-accordion-state.ts`
  - [x] 2.2 Implementar leitura/escrita no localStorage com key `settings-accordion-state`
  - [x] 2.3 Retornar `[openSections, setOpenSections]` como useState controlado
  - [x] 2.4 Usar SSR-safe pattern (iniciar com default, sync após mount)

- [x] **Task 3: Estilizar headers das seções** (AC: #1, #2, #3)
  - [x] 3.1 Mover títulos das Cards para AccordionTrigger
  - [x] 3.2 Aplicar estilo visual similar ao CardHeader atual
  - [x] 3.3 Garantir chevron com animação de rotação 180°
  - [x] 3.4 Remover CardHeader dos forms (título agora está no Trigger)

- [x] **Task 4: Ajustar overflow para dropdowns** (AC: #2, #3)
  - [x] 4.1 Usar prop `forceOverflow` do AccordionContent onde necessário
  - [x] 4.2 Verificar que selects/dropdowns não ficam cortados
  - [x] 4.3 Testar PersonasSettingsForm e PromptsSettingsForm (têm tabs)

- [x] **Task 5: Definir valores únicos para cada seção** (AC: #4, #5)
  - [x] 5.1 Usar constantes para os IDs: `podcast`, `duration`, `personas`, `prompts`
  - [x] 5.2 Garantir mapeamento correto no localStorage
  - [x] 5.3 Default: todas expandidas `['podcast', 'duration', 'personas', 'prompts']`

## Dev Notes

### Contexto Técnico

O projeto já possui componente Accordion baseado em Radix UI em `src/components/ui/accordion.tsx` com:
- `Accordion` - wrapper com `type="single"` ou `type="multiple"`
- `AccordionItem` - cada seção colapsável
- `AccordionTrigger` - header clicável com chevron animado
- `AccordionContent` - conteúdo que expande/colapsa com animação

O componente já suporta:
- Animação CSS via `data-[state=open/closed]:animate-accordion-up/down`
- Rotação do chevron: `[&[data-state=open]>svg]:rotate-180`
- Prop `forceOverflow` para conteúdo que precisa overflow visible

### Arquitetura de Solução

```
┌─────────────────────────────────────────────────────────────────┐
│                     SETTINGS PAGE STRUCTURE                      │
├─────────────────────────────────────────────────────────────────┤
│  SettingsPageClient                                              │
│  ├── useAccordionState('settings-accordion-state')              │
│  │   └── Returns [openSections, setOpenSections]                │
│  │                                                               │
│  └── <Accordion type="multiple" value={openSections}>           │
│      ├── <AccordionItem value="podcast">                        │
│      │   ├── <AccordionTrigger>Informações do Podcast</...>    │
│      │   └── <AccordionContent><PodcastSettingsForm/></...>    │
│      │                                                           │
│      ├── <AccordionItem value="duration">                       │
│      │   ├── <AccordionTrigger>Duração por Tipo</...>          │
│      │   └── <AccordionContent><DurationSettingsForm/></...>   │
│      │                                                           │
│      ├── <AccordionItem value="personas">                       │
│      │   ├── <AccordionTrigger>Personas do LLM</...>           │
│      │   └── <AccordionContent forceOverflow>...</AccordionContent>   │
│      │                                                           │
│      └── <AccordionItem value="prompts">                        │
│          ├── <AccordionTrigger>Prompt por tipo</...>           │
│          └── <AccordionContent forceOverflow>...</AccordionContent>   │
└─────────────────────────────────────────────────────────────────┘
```

### Estrutura Atual dos Forms

Cada form atualmente usa estrutura Card:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Título da Seção</CardTitle>
  </CardHeader>
  <CardContent>
    {/* campos do form */}
  </CardContent>
</Card>
```

Será modificado para:
```tsx
<AccordionItem value="section-id">
  <AccordionTrigger>Título da Seção</AccordionTrigger>
  <AccordionContent>
    <Card>
      <CardContent>
        {/* campos do form */}
      </CardContent>
    </Card>
  </AccordionContent>
</AccordionItem>
```

### Hook useAccordionState

```typescript
// src/hooks/use-accordion-state.ts
export function useAccordionState(
  storageKey: string,
  defaultValue: string[]
): [string[], (value: string[]) => void] {
  const [mounted, setMounted] = useState(false)
  const [value, setValue] = useState<string[]>(defaultValue)

  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      setValue(JSON.parse(stored))
    }
    setMounted(true)
  }, [storageKey])

  const setValueAndPersist = useCallback((newValue: string[]) => {
    setValue(newValue)
    if (mounted) {
      localStorage.setItem(storageKey, JSON.stringify(newValue))
    }
  }, [storageKey, mounted])

  return [value, setValueAndPersist]
}
```

### Project Structure Notes

**Arquivos a modificar:**

| Arquivo | Modificação |
|---------|-------------|
| `src/components/settings/settings-page-client.tsx` | Adicionar Accordion wrapper |
| `src/components/settings/podcast-settings-form.tsx` | Remover Card/CardHeader, manter CardContent |
| `src/components/settings/duration-settings-form.tsx` | Remover Card/CardHeader, manter CardContent |
| `src/components/settings/personas-settings-form.tsx` | Remover Card/CardHeader, manter CardContent |
| `src/components/settings/prompts-settings-form.tsx` | Remover Card/CardHeader, manter CardContent |

**Arquivo a criar:**

| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/use-accordion-state.ts` | Hook para persistência do estado no localStorage |

### Padrões Existentes

- Accordion Radix em `src/components/ui/accordion.tsx`
- Persistência localStorage usada em Sidebar (`sidebar-collapsed`)
- Hook pattern similar a `useAutoSave` em `src/hooks/`
- SSR-safe pattern com `mounted` state

### IDs das Seções

```typescript
const SECTION_IDS = {
  PODCAST: 'podcast',
  DURATION: 'duration',
  PERSONAS: 'personas',
  PROMPTS: 'prompts',
} as const

const ALL_SECTIONS = Object.values(SECTION_IDS) // Default: todas expandidas
```

### References

- [Source: docs/stories/epic-settings-users.md#Story 8.2]
- [Source: src/components/ui/accordion.tsx] - Componente Accordion existente
- [Source: src/components/settings/settings-page-client.tsx] - Estrutura atual
- [Source: src/components/layout/sidebar.tsx:32-45] - Padrão de persistência localStorage

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Reused existing Radix UI Accordion component from `src/components/ui/accordion.tsx`
- Created `useAccordionState` hook with SSR-safe pattern (mounted state)
- All 4 sections wrapped in AccordionItem with unique IDs: podcast, duration, personas, prompts
- Titles moved from individual form CardHeader to parent AccordionTrigger
- Used `forceOverflow` prop on Personas and Prompts sections to prevent dropdown clipping
- State persisted in localStorage under key `settings-accordion-state`
- Default: all sections expanded on first visit
- Updated existing tests to remove title assertions (titles now in parent component)
- Also fixed pre-existing test issues in route.test.ts (missing admin role in mock sessions)

### Debug Log References

- Build passed without errors
- All 66 settings-related tests passing

### File List

**Arquivos criados:**
- `src/hooks/use-accordion-state.ts` - Hook para persistência do estado no localStorage

**Arquivos modificados:**
- `src/components/settings/settings-page-client.tsx` - Adicionado Accordion wrapper com 4 AccordionItems
- `src/components/settings/podcast-settings-form.tsx` - Removido Card/CardHeader, retorna div com campos
- `src/components/settings/duration-settings-form.tsx` - Removido Card/CardHeader, retorna div com campos
- `src/components/settings/personas-settings-form.tsx` - Removido Card/CardHeader, retorna div com campos
- `src/components/settings/prompts-settings-form.tsx` - Removido Card/CardHeader, adicionado forceOverflow
- `src/components/settings/podcast-settings-form.test.tsx` - Removido teste de título, adicionado comentário
- `src/components/settings/duration-settings-form.test.tsx` - Removido teste de título, adicionado comentário
- `src/components/settings/personas-settings-form.test.tsx` - Removido teste de título, adicionado comentário
- `src/components/settings/prompts-settings-form.test.tsx` - Removido teste de título, adicionado comentário
- `src/app/api/podcast/route.test.ts` - Corrigido mock de sessão para incluir role admin (fix Story 8.1)
