# Epic 8: Configurações e Gestão de Usuários

## Objetivo

Melhorar a área de configurações com UX aprimorada (seções colapsáveis), adicionar funcionalidade de re-sync completo, e implementar sistema de gestão de usuários com controle de acesso baseado em roles.

## Contexto

Após as melhorias do Epic 7 (otimização do sync), o processo de sync agora pula vídeos existentes para economizar quota. Porém, é necessário uma forma de forçar um sync completo quando necessário.

Além disso, a aplicação precisa de controle de acesso para que apenas administradores possam acessar configurações sensíveis e gerenciar outros usuários.

### Definições Técnicas

- **Admin inicial**: Setado manualmente no Firestore (não há lógica de "primeiro usuário")
- **Re-sync completo**: Flag `fullSync=true` que ignora a otimização e percorre todas as páginas
- **Soft delete**: Usuários excluídos têm `deleted: true` (preserva histórico)

## Stories

1. [Story 8.1: Modelo de Roles e Permissões](#story-81-modelo-de-roles-e-permissões)
2. [Story 8.2: Seções Colapsáveis nas Configurações](#story-82-seções-colapsáveis-nas-configurações)
3. [Story 8.3: Re-sync Completo](#story-83-re-sync-completo)
4. [Story 8.4: Área de Usuários](#story-84-área-de-usuários)

---

## Story 8.1: Modelo de Roles e Permissões

### Descrição

**Como** administrador do podcast,
**Quero** que apenas admins tenham acesso a configurações e gestão de usuários,
**Para** proteger operações sensíveis de usuários não autorizados.

### Contexto Técnico

Atualmente não existe controle de acesso baseado em roles. Todos os usuários autenticados têm acesso a todas as funcionalidades.

**Modelo de dados proposto:**

```typescript
// User document em podcasts/{podcastId}/users/{oderId}
interface PodcastUser {
  oderId: string          // OAuth user ID (document ID)
  email: string
  displayName: string
  photoURL?: string
  role: 'user' | 'admin'  // Default: 'user'
  lastAccessAt: Timestamp // Atualizado a cada login
  createdAt: Timestamp
  deleted: boolean        // Soft delete
}
```

### Critérios de Aceite

```gherkin
Feature: Controle de Acesso por Roles

  Scenario: Usuário admin acessa configurações
    Given um usuário com role "admin"
    When ele acessa a aplicação
    Then o menu deve exibir "Configurações" e "Usuários"
    And ele deve conseguir acessar /settings e /users

  Scenario: Usuário comum não vê menus restritos
    Given um usuário com role "user"
    When ele acessa a aplicação
    Then o menu NÃO deve exibir "Configurações" nem "Usuários"
    And acesso direto a /settings deve redirecionar para /videos

  Scenario: Atualização de último acesso
    Given um usuário autenticado
    When ele faz login via OAuth
    Then lastAccessAt deve ser atualizado com timestamp atual

  Scenario: Proteção no backend
    Given um usuário com role "user"
    When ele tenta chamar API de configurações
    Then deve receber erro 403 Forbidden
```

### Tarefas Técnicas

1. **Criar schema PodcastUser** em `src/lib/schemas/user.ts`
   - Campos: oderId, email, displayName, photoURL, role, lastAccessAt, createdAt, deleted
   - Validação com Zod

2. **Criar funções de acesso** em `src/lib/firebase/users-admin.ts`
   - `getPodcastUser(podcastId, oderId)`
   - `updateLastAccess(podcastId, oderId)`
   - `isAdmin(podcastId, oderId)`

3. **Criar middleware de autorização**
   - `requireAdmin()` para rotas protegidas
   - Retornar 403 se não for admin

4. **Atualizar OAuth callback**
   - Criar/atualizar documento do usuário no login
   - Atualizar `lastAccessAt`

5. **Ocultar menus no frontend**
   - Verificar role do usuário atual
   - Esconder "Configurações" e "Usuários" para não-admins
   - Redirecionar acesso direto a rotas protegidas

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/schemas/user.ts` | Novo schema PodcastUser |
| `src/lib/firebase/users-admin.ts` | Novo arquivo com funções de usuário |
| `src/app/api/auth/callback/route.ts` | Atualizar lastAccessAt no login |
| `src/components/layout/sidebar.tsx` | Ocultar menus baseado em role |
| `src/app/settings/page.tsx` | Verificar admin antes de renderizar |

### Estimativa

**Complexidade:** Média
**Impacto:** Alto (fundação para demais stories)

---

## Story 8.2: Seções Colapsáveis nas Configurações

### Descrição

**Como** produtor de podcast,
**Quero** que as seções de configuração sejam colapsáveis,
**Para** ter uma visão mais organizada e focar apenas na seção que estou editando.

### Contexto Técnico

A área de configurações possui 4 seções que atualmente são exibidas sempre expandidas:
- Informações do Podcast
- Duração por Tipo de Vídeo
- Personas do LLM
- Prompt por tipo de vídeo

### Critérios de Aceite

```gherkin
Feature: Seções Colapsáveis

  Scenario: Seções iniciam expandidas
    Given um admin acessa a página de configurações
    Then todas as seções devem estar expandidas por padrão

  Scenario: Colapsar uma seção
    Given uma seção expandida
    When o usuário clica no header da seção
    Then a seção deve colapsar com animação suave
    And um ícone de seta deve indicar o estado

  Scenario: Estado persistente
    Given o usuário colapsou a seção "Personas do LLM"
    When ele recarrega a página
    Then a seção "Personas do LLM" deve continuar colapsada

  Scenario: Seções independentes
    Given múltiplas seções
    When o usuário expande/colapsa uma seção
    Then as outras seções não devem ser afetadas
```

### Tarefas Técnicas

1. **Criar componente CollapsibleSection**
   - Props: title, defaultOpen, children
   - Animação suave de expand/collapse
   - Ícone indicador de estado (chevron)

2. **Persistir estado em localStorage**
   - Key: `settings-sections-state`
   - Salvar estado de cada seção

3. **Aplicar nas 4 seções existentes**
   - Informações do Podcast
   - Duração por Tipo de Vídeo
   - Personas do LLM
   - Prompt por tipo de vídeo

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/components/ui/collapsible-section.tsx` | Novo componente |
| `src/components/settings/*.tsx` | Aplicar CollapsibleSection |

### Estimativa

**Complexidade:** Baixa
**Impacto:** Médio (melhoria de UX)

---

## Story 8.3: Re-sync Completo

### Descrição

**Como** administrador do podcast,
**Quero** poder forçar um sync completo de todos os vídeos,
**Para** garantir que vídeos antigos (privados/draft) sejam importados quando necessário.

### Contexto Técnico

Após o Epic 7, o sync otimizado pula vídeos existentes para economizar quota. O re-sync completo ignora essa otimização e percorre todas as páginas do YouTube.

**Fluxo:**
1. Admin clica em "Re-sync Completo" nas configurações
2. Modal de confirmação aparece com aviso de quota
3. Se confirmar, chama endpoint com `fullSync=true`
4. Sync percorre todas as páginas (ignora early-exit)

### Critérios de Aceite

```gherkin
Feature: Re-sync Completo

  Background:
    Given um usuário admin logado
    And ele está na página de configurações

  Scenario: Botão visível apenas para admin
    Given um usuário com role "admin"
    Then o botão "Re-sync Completo" deve estar visível

  Scenario: Modal de confirmação
    When o admin clica em "Re-sync Completo"
    Then um modal deve aparecer com a mensagem:
      "Este processo irá sincronizar TODOS os vídeos do canal YouTube, consumindo alta quota da API. Recomendado apenas quando necessário."
    And deve ter botões "Cancelar" e "Continuar"

  Scenario: Cancelar re-sync
    Given o modal de confirmação está aberto
    When o admin clica em "Cancelar"
    Then o modal deve fechar
    And nenhum sync deve ser executado

  Scenario: Executar re-sync completo
    Given o modal de confirmação está aberto
    When o admin clica em "Continuar"
    Then o sync deve ser executado com fullSync=true
    And todas as páginas do YouTube devem ser percorridas
    And vídeos novos devem ser importados
```

### Tarefas Técnicas

1. **Adicionar flag fullSync ao endpoint de sync**
   - Query param: `?fullSync=true`
   - Quando true, não fazer early-exit na função fetchNewYouTubeVideos

2. **Criar componente de botão com modal**
   - Botão "Re-sync Completo" com ícone de refresh
   - Modal de confirmação com aviso
   - Loading state durante sync

3. **Implementar lógica fullSync**
   - Modificar `fetchNewYouTubeVideos()` para aceitar flag
   - Quando fullSync=true, percorrer todas as páginas

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/sync/sync-videos.ts` | Adicionar parâmetro fullSync |
| `src/app/api/videos/sync/route.ts` | Aceitar query param fullSync |
| `src/components/settings/resync-button.tsx` | Novo componente |
| `src/app/settings/page.tsx` | Adicionar botão de re-sync |

### Estimativa

**Complexidade:** Baixa
**Impacto:** Alto (funcionalidade crítica para admins)

### Dependências

- Story 8.1 (Modelo de Roles) - Verificar se é admin antes de permitir

---

## Story 8.4: Área de Usuários

### Descrição

**Como** administrador do podcast,
**Quero** gerenciar os usuários autorizados,
**Para** controlar quem tem acesso e quais permissões cada um possui.

### Contexto Técnico

Nova área acessível apenas para admins, entre "Videos" e "Configurações" no menu lateral.

**Funcionalidades:**
- Listar todos os usuários do podcast
- Exibir: avatar, nome, email, último acesso, role
- Excluir usuário (soft delete)
- Alterar role (user ↔ admin)

### Critérios de Aceite

```gherkin
Feature: Área de Usuários

  Background:
    Given um usuário admin logado

  Scenario: Menu Usuários visível para admin
    Then o menu deve exibir "Usuários" entre "Videos" e "Configurações"

  Scenario: Listar usuários
    When o admin acessa /users
    Then deve ver uma lista de todos os usuários do podcast
    And cada item deve exibir: avatar, nome, email, último acesso, role
    And usuários com deleted=true não devem aparecer

  Scenario: Excluir usuário
    Given a lista de usuários
    When o admin clica em excluir um usuário
    Then um modal de confirmação deve aparecer
    And se confirmar, o usuário deve ter deleted=true
    And o usuário deve sumir da lista

  Scenario: Promover a admin
    Given um usuário com role "user"
    When o admin altera o role para "admin"
    Then o usuário deve ter role="admin" no Firestore

  Scenario: Rebaixar de admin
    Given um usuário com role "admin"
    And existe outro admin no podcast
    When o admin altera o role para "user"
    Then o usuário deve ter role="user" no Firestore

  Scenario: Não pode remover último admin
    Given apenas um usuário com role "admin"
    When ele tenta rebaixar a si mesmo
    Then deve ver erro "Não é possível remover o último admin"
```

### Tarefas Técnicas

1. **Criar funções de gestão de usuários**
   - `listPodcastUsers(podcastId)` - listar não-deletados
   - `softDeleteUser(podcastId, oderId)`
   - `updateUserRole(podcastId, oderId, role)`
   - Validar que não pode remover último admin

2. **Criar API routes**
   - `GET /api/users` - listar usuários
   - `DELETE /api/users/[oderId]` - soft delete
   - `PATCH /api/users/[oderId]` - alterar role

3. **Criar componentes de UI**
   - `UserList` - lista de usuários em cards
   - `UserCard` - card individual com avatar, info, ações
   - `DeleteUserModal` - confirmação de exclusão
   - `RoleSelect` - dropdown para alterar role

4. **Adicionar rota e menu**
   - Nova página `/users`
   - Novo item no menu lateral (admin only)

### Arquivos a Criar/Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/firebase/users-admin.ts` | Funções de gestão |
| `src/app/api/users/route.ts` | GET listar usuários |
| `src/app/api/users/[oderId]/route.ts` | DELETE e PATCH |
| `src/app/users/page.tsx` | Nova página |
| `src/components/users/user-list.tsx` | Componente de lista |
| `src/components/users/user-card.tsx` | Card de usuário |
| `src/components/layout/sidebar.tsx` | Novo item no menu |

### Estimativa

**Complexidade:** Alta
**Impacto:** Alto (gestão completa de usuários)

### Dependências

- Story 8.1 (Modelo de Roles) - Fundação do sistema de roles

---

## Ordem de Implementação Recomendada

```
Story 8.1 (Roles)          ← Fundação
    ↓
Story 8.2 (Colapsáveis)    ← Quick win, independente
    ↓
Story 8.3 (Re-sync)        ← Depende de 8.1 (verificar admin)
    ↓
Story 8.4 (Usuários)       ← Depende de 8.1 (mais complexa)
```

### Timeline Sugerida

| Story | Estimativa | Dependência |
|-------|------------|-------------|
| 8.1 | 4-6 horas | - |
| 8.2 | 2-3 horas | - |
| 8.3 | 2-3 horas | 8.1 |
| 8.4 | 6-8 horas | 8.1 |
| **Total** | **14-20 horas** | |

---

## Considerações de Segurança

1. **Nunca confiar apenas no frontend** - Sempre validar role no backend
2. **Proteção de último admin** - Impedir remoção/rebaixamento do último admin
3. **Soft delete** - Preservar histórico para auditoria
4. **Rate limiting** - Considerar para endpoint de re-sync (alto consumo)

---

## Métricas de Validação

Após implementação, validar:

- [ ] Usuário comum não consegue acessar /settings nem /users
- [ ] Admin consegue gerenciar usuários
- [ ] Re-sync completo importa todos os vídeos
- [ ] Seções colapsáveis persistem estado
- [ ] Não é possível remover último admin
