# Guia de Onboarding — IAra para Novo Podcast

Este guia descreve o processo completo para instalar e deployar o IAra para um novo podcast.

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Clone e Setup Local](#2-clone-e-setup-local)
3. [Configuração GCP](#3-configuração-gcp)
4. [Configuração Firestore](#4-configuração-firestore)
5. [Seed do Podcast](#5-seed-do-podcast)
6. [Variáveis de Ambiente](#6-variáveis-de-ambiente)
7. [Execução Local](#7-execução-local)
8. [Deploy para Cloud Run](#8-deploy-para-cloud-run)
9. [Configuração Pós-Deploy](#9-configuração-pós-deploy)

---

## 1. Pré-requisitos

- **Node.js** 20+
- **pnpm** 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- **gcloud CLI** instalado e autenticado (`gcloud auth login`)
- **Projeto GCP** com billing ativo
- **Canal no YouTube** com permissão de gerenciamento

---

## 2. Clone e Setup Local

```bash
git clone <repo-url>
cd pptnc
pnpm install
```

O IAra fica em `apps/iara/` dentro do monorepo.

---

## 3. Configuração GCP

### 3.1 APIs necessárias

No [GCP Console](https://console.cloud.google.com/apis/library), ative as seguintes APIs:

- **YouTube Data API v3** — listagem e atualização de vídeos
- **Vertex AI API** — chamadas LLM (Gemini)
- **Cloud Run Admin API** — deploy
- **Cloud Build API** — CI/CD
- **Artifact Registry API** — Docker images
- **Firestore API** — banco de dados

```bash
gcloud services enable \
  youtube.googleapis.com \
  aiplatform.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  --project=SEU_PROJETO
```

### 3.2 Credenciais OAuth (Google Sign-In + YouTube)

1. Acesse [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Crie um **OAuth 2.0 Client ID** do tipo "Web application"
3. Configure as URIs de redirecionamento autorizadas:
   - Desenvolvimento: `http://localhost:3000/api/auth/callback/google`
   - Produção: `https://SEU_DOMINIO/api/auth/callback/google`
4. Anote o **Client ID** e **Client Secret**

### 3.3 Tela de Consentimento OAuth

1. Acesse [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Configure como "External" (ou "Internal" se G Suite)
3. Adicione os escopos:
   - `youtube.readonly`
   - `youtube.force-ssl`
4. Adicione os usuários de teste (enquanto o app estiver em modo "Testing")

### 3.4 Service Account para Cloud Build

```bash
# Criar service account
gcloud iam service-accounts create iara-build \
  --display-name="IAra Cloud Build" \
  --project=SEU_PROJETO

# Permissões necessárias
gcloud projects add-iam-policy-binding SEU_PROJETO \
  --member="serviceAccount:iara-build@SEU_PROJETO.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding SEU_PROJETO \
  --member="serviceAccount:iara-build@SEU_PROJETO.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding SEU_PROJETO \
  --member="serviceAccount:iara-build@SEU_PROJETO.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### 3.5 Application Default Credentials (local)

Para desenvolvimento local, autentique com ADC:

```bash
gcloud auth application-default login --project=SEU_PROJETO
```

---

## 4. Configuração Firestore

### 4.1 Criar database

```bash
gcloud firestore databases create \
  --database=SEU_DATABASE_ID \
  --location=us-east1 \
  --type=firestore-native \
  --project=SEU_PROJETO
```

> **Nota**: O `DATABASE_ID` pode ser o mesmo que o `PROJECT_ID` ou um nome personalizado.

### 4.2 Artifact Registry

Crie um repositório Docker para as imagens:

```bash
gcloud artifacts repositories create SEU_REPOSITORIO \
  --repository-format=docker \
  --location=us-east1 \
  --project=SEU_PROJETO
```

---

## 5. Seed do Podcast

O script `seed-podcast.ts` cria o documento inicial do podcast no Firestore:

```bash
cd apps/iara

pnpm tsx scripts/seed-podcast.ts <podcastId> "<podcastName>" <channelId>
```

**Exemplo:**

```bash
# Variáveis de ambiente para projeto diferente do default
export GCP_PROJECT_ID=meu-projeto
export FIRESTORE_DATABASE_ID=meu-projeto

pnpm tsx scripts/seed-podcast.ts meu-podcast "Meu Podcast Incrível" UC_MEU_CHANNEL_ID
```

**Parâmetros:**
- `podcastId` — ID único do podcast (usado em paths do Firestore)
- `podcastName` — Nome de exibição do podcast
- `channelId` — ID do canal do YouTube (formato `UC...`)

Para encontrar o Channel ID: acesse o [YouTube Studio](https://studio.youtube.com) > Configurações > Canal > Informações básicas.

---

## 6. Variáveis de Ambiente

### 6.1 Desenvolvimento local (`.env.local`)

Copie o arquivo de exemplo e preencha:

```bash
cp .env.example .env.local
```

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `AUTH_SECRET` | Segredo do Auth.js (gere com `openssl rand -base64 32`) | `K7x...` |
| `AUTH_GOOGLE_ID` | Client ID do OAuth (passo 3.2) | `123...apps.googleusercontent.com` |
| `AUTH_GOOGLE_SECRET` | Client Secret do OAuth (passo 3.2) | `GOCSPX-...` |
| `AUTH_TRUST_HOST` | Necessário para localhost | `true` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | API key do Firebase | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain | `projeto.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project ID | `meu-projeto` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket | `projeto.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID | `123456789` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID | `1:123:web:abc` |
| `BRIGHTDATA_API_KEY` | _(opcional)_ API key do BrightData para scraping LinkedIn | `brd-...` |

> **Onde encontrar as variáveis Firebase**: [Firebase Console](https://console.firebase.google.com) > Configurações do projeto > Geral > "Seus apps" > Web app.

### 6.2 Variáveis de runtime (Cloud Run)

Estas são passadas automaticamente pelo `cloudbuild.yaml`:

| Variável | Descrição | Default |
|----------|-----------|---------|
| `PODCAST_ID` | ID do podcast no Firestore | `pptnc` |
| `GCP_PROJECT_ID` | Projeto GCP | `pptnc-stage` |
| `GCP_REGION` | Região | `us-east1` |
| `FIRESTORE_DATABASE_ID` | Database do Firestore | `pptnc-stage` |
| `VERTEX_AI_MODEL` | _(opcional)_ Modelo Gemini | `gemini-2.5-flash` |

---

## 7. Execução Local

```bash
cd apps/iara
pnpm dev
```

Acesse `http://localhost:3000`. Faça login com a conta Google configurada no passo 3.3.

Na primeira execução:
1. O login cria o documento do usuário no Firestore
2. Acesse **Configurações** para configurar prompts e personas
3. Use **Sincronizar** para importar vídeos do YouTube

---

## 8. Deploy para Cloud Run

### 8.1 Criar trigger no Cloud Build

No [Cloud Build > Triggers](https://console.cloud.google.com/cloud-build/triggers):

1. **Evento**: Push to tag (ex: `v*`)
2. **Arquivo de configuração**: `apps/iara/cloudbuild.yaml`
3. **Substitution variables**:

| Substitution | Valor |
|-------------|-------|
| `_SERVICE_NAME` | `iara-meu-podcast` |
| `_PODCAST_ID` | `meu-podcast` |
| `_REGION` | `us-east1` |
| `_REPOSITORY` | `SEU_REPOSITORIO` |
| `_SERVICE_ACCOUNT` | `iara-build@SEU_PROJETO.iam.gserviceaccount.com` |
| `_FIRESTORE_DATABASE_ID` | `SEU_DATABASE_ID` |

### 8.2 Configurar secrets no Cloud Run

Após o primeiro deploy, configure as variáveis de auth no serviço Cloud Run:

```bash
gcloud run services update iara-meu-podcast \
  --region=us-east1 \
  --set-env-vars="AUTH_SECRET=$(openssl rand -base64 32)" \
  --set-env-vars="AUTH_GOOGLE_ID=seu-client-id" \
  --set-env-vars="AUTH_GOOGLE_SECRET=seu-client-secret" \
  --set-env-vars="AUTH_TRUST_HOST=true" \
  --project=SEU_PROJETO
```

> **Importante**: Cada deploy deve ter seu próprio `AUTH_SECRET`. Sessões não devem vazar entre pods.

### 8.3 Disparar deploy

```bash
git tag v2.2.0-meu-podcast
git push origin v2.2.0-meu-podcast
```

O Cloud Build vai: build da imagem Docker > push para Artifact Registry > deploy no Cloud Run com as env vars configuradas.

---

## 9. Configuração Pós-Deploy

Após o primeiro login no IAra:

### 9.1 Configurações do Podcast

Acesse **Configurações** e configure:

- **Nome do Podcast** — nome de exibição
- **Channel ID** — ID do canal YouTube (já preenchido pelo seed)
- **Nome do Host** — nome do apresentador (incluído nos prompts de descrição)

### 9.2 Prompts e Personas

Em **Configurações > Prompts**, configure os prompts por tipo de vídeo:
- **Episode** — episódios completos
- **Cut** — cortes de 3-20 minutos
- **Reel** — shorts/reels até 3 minutos

Cada tipo tem fases com prompts editáveis: crítica, edição, compliance, capítulos, título, descrição, tags.

### 9.3 Features

Em **Configurações > Features**, habilite/desabilite seções opcionais:
- **Editorial** — seção de acompanhamento editorial
- **Notícias** — seção de notícias curadas

### 9.4 Usuários

O primeiro usuário que fizer login será o proprietário. Para adicionar administradores:
1. O novo usuário faz login normalmente
2. O admin acessa **Usuários** e altera o role para "admin"

### 9.5 Sincronização Inicial

1. Acesse a página de **Vídeos**
2. Clique em **Sincronizar** para importar vídeos do canal YouTube
3. Os vídeos aparecerão na lista com status "new"

---

## Checklist de Verificação

- [ ] Login com Google funciona
- [ ] Lista de vídeos carrega após sync
- [ ] Wizard processa pelo menos a Fase 1 (LLM funcionando)
- [ ] Fase 8 envia metadados para o YouTube
- [ ] Logs no Cloud Logging mostram `podcastId` correto

---

## Troubleshooting

### "PODCAST_ID is required but empty"
A env var `PODCAST_ID` não está configurada no Cloud Run. Verifique o trigger do Cloud Build.

### "Application Default Credentials" error local
Execute `gcloud auth application-default login --project=SEU_PROJETO`.

### OAuth: "redirect_uri_mismatch"
A URI de callback não está cadastrada nas credenciais OAuth. Adicione a URL exata em [GCP Console > Credentials](https://console.cloud.google.com/apis/credentials).

### Wizard trava na Fase 1
Verifique se a **Vertex AI API** está ativada e se o service account tem role `aiplatform.user`.

### Vídeos não aparecem após sync
Verifique se o **Channel ID** está correto nas configurações e se a **YouTube Data API v3** está ativada.
