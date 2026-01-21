# Deployment Guide - PPTNC

## Ambiente de Stage (pptnc-stage)

### Processo de Deploy Atual

> ⚠️ **TODO: Melhorar este processo** - O build deveria ser feito diretamente no CI/CD (Cloud Build) para evitar dependência do ambiente local.

Para o ambiente de stage, o processo atual requer build local:

```bash
# 1. Build do Next.js localmente
npm run build

# 2. Build da imagem Docker usando Dockerfile.stage (usa os artefatos do build local)
docker build -f Dockerfile.stage -t pptnc:latest .

# 3. Tag para o Artifact Registry
docker tag pptnc:latest us-east1-docker.pkg.dev/pptnc-stage/pptnc/pptnc:latest

# 4. Push para o Artifact Registry
docker push us-east1-docker.pkg.dev/pptnc-stage/pptnc/pptnc:latest

# 5. Deploy no Cloud Run
gcloud run deploy pptnc \
  --image=us-east1-docker.pkg.dev/pptnc-stage/pptnc/pptnc:latest \
  --region=us-east1 \
  --project=pptnc-stage \
  --allow-unauthenticated
```

### Configurações

| Item | Valor |
|------|-------|
| Projeto GCP | `pptnc-stage` |
| Região | `us-east1` |
| Artifact Registry | `us-east1-docker.pkg.dev/pptnc-stage/pptnc/pptnc` |
| Cloud Run Service | `pptnc` |
| URL | https://pptnc-1073356999241.us-east1.run.app |

### Variáveis de Ambiente no Cloud Run

Certifique-se de que as seguintes variáveis estão configuradas:

- `GOOGLE_PROJECT_ID` - ID do projeto GCP
- `RESEND_API_KEY` - Chave da API Resend para envio de emails
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` - ID do Google Analytics
- `NEXT_PUBLIC_BASE_URL` - URL base do site

### Pré-requisitos

1. Docker instalado e rodando
2. gcloud CLI autenticado (`gcloud auth login`)
3. Docker configurado para Artifact Registry:
   ```bash
   gcloud auth configure-docker us-east1-docker.pkg.dev
   ```

---

## Melhorias Futuras

### 1. CI/CD com Cloud Build
- [ ] Configurar `cloudbuild.yaml` para build automatizado
- [ ] Trigger automático no push para branch `main`
- [ ] Build do Next.js dentro do Cloud Build (não local)

### 2. Ambiente de Produção
- [ ] Criar projeto GCP de produção separado
- [ ] Configurar domínio personalizado
- [ ] Configurar Cloud CDN para cache

### 3. Preview Deployments
- [ ] Deploy automático de PRs para URLs de preview
- [ ] Cleanup automático após merge
