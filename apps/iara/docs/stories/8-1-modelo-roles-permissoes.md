# Story 8.1: Modelo de Roles e Permissões

Status: done

## Story

As a **administrador do podcast**,
I want **que apenas admins tenham acesso a configurações e gestão de usuários**,
so that **operações sensíveis sejam protegidas de usuários não autorizados**.

## Acceptance Criteria

```gherkin
Feature: Controle de Acesso por Roles

  Background:
    Given a aplicação IAra está rodando
    And existe um podcast configurado

  Scenario: Usuário admin acessa configurações
    Given um usuário autenticado com role "admin"
    When ele acessa a aplicação
    Then o menu lateral deve exibir "Configurações"
    And ele deve conseguir acessar /settings

  Scenario: Usuário comum não vê menu de configurações
    Given um usuário autenticado com role "user"
    When ele acessa a aplicação
    Then o menu lateral NÃO deve exibir "Configurações"

  Scenario: Usuário comum tenta acessar /settings diretamente
    Given um usuário autenticado com role "user"
    When ele tenta acessar /settings diretamente pela URL
    Then deve ser redirecionado para /videos

  Scenario: Atualização de último acesso no login
    Given um usuário autenticado
    When ele faz login via OAuth
    Then o campo lastAccessAt deve ser atualizado com timestamp atual

  Scenario: Proteção de endpoint no backend
    Given um usuário com role "user"
    When ele tenta chamar API protegida (ex: PATCH /api/podcast)
    Then deve receber erro 403 Forbidden
    And a resposta deve conter mensagem "Admin access required"

  Scenario: Criação de usuário no primeiro acesso
    Given um novo usuário que nunca acessou o podcast
    When ele faz login via OAuth pela primeira vez
    Then um documento deve ser criado em podcasts/{podcastId}/users/{oderId}
    And o role padrão deve ser "user"
    And createdAt deve ser setado
```

## Tasks / Subtasks

- [x] **Task 1: Criar schema e tipos de PodcastUser** (AC: #1, #2, #6)
  - [x] 1.1 Criar arquivo `src/types/user.ts` com interface PodcastUser
  - [x] 1.2 Criar schema Zod em `src/lib/schemas/user.ts`
  - [x] 1.3 Campos: oderId, email, displayName, photoURL, role, lastAccessAt, createdAt, deleted

- [x] **Task 2: Criar funções de acesso a usuários** (AC: #4, #6)
  - [x] 2.1 Criar arquivo `src/lib/firebase/users-admin.ts`
  - [x] 2.2 Implementar `getPodcastUser(podcastId, oderId)`
  - [x] 2.3 Implementar `createOrUpdateUserOnLogin(podcastId, userData)`
  - [x] 2.4 Implementar `isAdmin(podcastId, oderId)`
  - [x] 2.5 Adicionar testes unitários

- [x] **Task 3: Atualizar OAuth callback** (AC: #4, #6)
  - [x] 3.1 Chamar `createOrUpdateUserOnLogin()` após autenticação bem-sucedida
  - [x] 3.2 Atualizar lastAccessAt em cada login

- [x] **Task 4: Criar hook useCurrentUser** (AC: #1, #2)
  - [x] 4.1 Criar `src/hooks/use-current-user.ts`
  - [x] 4.2 Retornar dados do usuário incluindo role
  - [x] 4.3 Expor `isAdmin` como propriedade computada

- [x] **Task 5: Ocultar menu para não-admins** (AC: #1, #2)
  - [x] 5.1 Modificar sidebar para verificar isAdmin
  - [x] 5.2 Esconder item "Configurações" se não for admin

- [x] **Task 6: Proteger rota /settings no frontend** (AC: #3)
  - [x] 6.1 Verificar role antes de renderizar página
  - [x] 6.2 Redirecionar para /videos se não for admin

- [x] **Task 7: Proteger endpoints no backend** (AC: #5)
  - [x] 7.1 Criar função `requireAdmin()` para validação
  - [x] 7.2 Aplicar em endpoints sensíveis (settings)
  - [x] 7.3 Retornar 403 com mensagem apropriada

## Dev Notes

### Contexto Técnico

Atualmente a aplicação não possui controle de acesso baseado em roles. Qualquer usuário autenticado pode acessar todas as funcionalidades.

### Modelo de Dados

```typescript
// podcasts/{podcastId}/users/{oderId}
interface PodcastUser {
  oderId: string          // OAuth user ID (é o document ID)
  email: string
  displayName: string
  photoURL?: string
  role: 'user' | 'admin'  // Default: 'user', admin setado manualmente
  lastAccessAt: Timestamp // Atualizado a cada login
  createdAt: Timestamp
  deleted: boolean        // Soft delete (default: false)
}
```

### Arquitetura de Solução

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUXO DE AUTENTICAÇÃO                     │
├─────────────────────────────────────────────────────────────────┤
│  1. Usuário faz login OAuth                                      │
│  2. Callback recebe dados do usuário                             │
│  3. createOrUpdateUserOnLogin() é chamado                        │
│     ├── Se usuário existe: atualiza lastAccessAt                │
│     └── Se não existe: cria documento com role="user"           │
│  4. Frontend carrega dados do usuário via useCurrentUser         │
│  5. Sidebar verifica isAdmin para exibir/ocultar menus          │
└─────────────────────────────────────────────────────────────────┘
```

### Project Structure Notes

**Arquivos a criar:**

| Arquivo | Descrição |
|---------|-----------|
| `src/types/user.ts` | Interface PodcastUser |
| `src/lib/schemas/user.ts` | Schema Zod para validação |
| `src/lib/firebase/users-admin.ts` | Funções de acesso a usuários |
| `src/lib/firebase/users-admin.test.ts` | Testes unitários |
| `src/hooks/use-current-user.ts` | Hook para dados do usuário atual |

**Arquivos a modificar:**

| Arquivo | Modificação |
|---------|-------------|
| `src/app/api/auth/callback/route.ts` | Chamar createOrUpdateUserOnLogin |
| `src/components/layout/sidebar.tsx` | Verificar isAdmin para menu |
| `src/app/settings/page.tsx` | Verificar admin antes de renderizar |

### Padrões Existentes

- Firestore Admin SDK para operações de escrita
- Zod para validação de schemas
- Hooks customizados em `src/hooks/`
- Logging com `log()` de `@/lib/logger`

### References

- [Source: docs/stories/epic-settings-users.md#Story 8.1]
- [Source: src/app/api/auth/callback/route.ts] - OAuth callback existente
- [Source: src/components/layout/sidebar.tsx] - Sidebar atual

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Story criada a partir do epic `docs/stories/epic-settings-users.md`
- Fundação para Stories 8.3 e 8.4 que dependem do sistema de roles
- Implementado sistema de roles com 'admin' e 'user' (substituindo 'admin', 'editor', 'viewer')
- Adicionado campo `lastAccessAt` para rastrear último acesso
- Adicionado campo `deleted` para soft delete
- Role é armazenado no JWT token e session para acesso rápido
- Sidebar filtra menu de Configurações baseado em isAdmin
- Rota /settings verifica role admin no servidor
- API PATCH /api/podcast protegida com requireAdmin helper

**Code Review Fixes (2026-02-02):**
- H1: Adicionados 16 testes unitários para users-admin.ts
- H2: Adicionado @deprecated em users.ts (código duplicado com users-admin.ts)
- H3: Adicionados comentários explicando mapeamento displayName → name
- H4: Corrigido getUser() para verificar soft-delete
- M1: Corrigido AC para refletir endpoint real (PATCH /api/podcast)
- M3: Corrigido isActive no Sidebar para usar pathname ao invés de query param
- L2: Corrigido comentário desatualizado sobre default role

### Debug Log References

- Build passou sem erros
- 16 testes em users-admin.test.ts passando

### File List

**Arquivos criados:**
- `src/lib/firebase/users-admin.ts` - Funções admin para gestão de usuários
- `src/lib/firebase/users-admin.test.ts` - Testes unitários para users-admin
- `src/lib/auth/require-admin.ts` - Helper para proteção de rotas API
- `src/hooks/use-current-user.ts` - Hook para dados do usuário atual

**Arquivos modificados:**
- `src/lib/schemas/user.ts` - Atualizado roles para 'admin' | 'user', adicionados campos lastAccessAt e deleted
- `src/lib/firebase/users.ts` - Atualizado default role para 'user', adicionado lastAccessAt, adicionado soft-delete check, marcado como @deprecated
- `src/lib/auth.ts` - Adicionado role ao JWT e session, integrado createOrUpdateUserOnLogin
- `src/components/layout/sidebar.tsx` - Adicionado filtro de menu baseado em isAdmin, corrigido isActive para usar pathname
- `src/app/settings/page.tsx` - Adicionada verificação de admin
- `src/app/api/podcast/route.ts` - Protegido PATCH com requireAdmin
