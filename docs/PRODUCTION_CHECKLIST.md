# Checklist de Deploy em Produção

**Domínio:** pptnaocompila.com.br
**Data:** 2026-01-22
**Status:** Pendente

---

## 1. Google Cloud Platform (Cloud Run)

### 1.1 Criar Projeto de Produção (se separado de stage)
- [ ] Criar projeto GCP `pptnc-prod` (ou usar `pptnc-stage`)
- [ ] Habilitar APIs: Cloud Run, Artifact Registry, Secret Manager
- [ ] Configurar billing

### 1.2 Deploy da Aplicação
- [ ] Build e push da imagem Docker
  ```bash
  npm run build
  docker build -f Dockerfile.stage -t pptnc:prod .
  docker tag pptnc:prod us-east1-docker.pkg.dev/PROJECT_ID/pptnc/pptnc:prod
  docker push us-east1-docker.pkg.dev/PROJECT_ID/pptnc/pptnc:prod
  ```
- [ ] Deploy no Cloud Run
  ```bash
  gcloud run deploy pptnc \
    --image=us-east1-docker.pkg.dev/PROJECT_ID/pptnc/pptnc:prod \
    --region=us-east1 \
    --project=PROJECT_ID \
    --allow-unauthenticated
  ```

### 1.3 Variáveis de Ambiente
- [ ] `NEXT_PUBLIC_BASE_URL=https://pptnaocompila.com.br`
- [ ] `GOOGLE_PROJECT_ID=PROJECT_ID`
- [ ] `RESEND_API_KEY=re_xxxxxxxxxxxx`
- [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX` (Google Analytics)
- [ ] `UPSTASH_REDIS_REST_URL=https://xxx.upstash.io` (Rate Limiting)
- [ ] `UPSTASH_REDIS_REST_TOKEN=xxxxx` (Rate Limiting)

```bash
gcloud run services update pptnc \
  --region=us-east1 \
  --project=PROJECT_ID \
  --set-env-vars="NEXT_PUBLIC_BASE_URL=https://pptnaocompila.com.br,GOOGLE_PROJECT_ID=PROJECT_ID,RESEND_API_KEY=re_xxx,NEXT_PUBLIC_GA_MEASUREMENT_ID=G-xxx"
```

### 1.4 Domínio Custom no Cloud Run
- [ ] Mapear domínio no Cloud Run
  ```bash
  gcloud run domain-mappings create \
    --service=pptnc \
    --domain=pptnaocompila.com.br \
    --region=us-east1 \
    --project=PROJECT_ID
  ```
- [ ] Anotar os IPs/CNAMEs fornecidos pelo Cloud Run para configurar DNS

---

## 2. DNS (Registro.br ou seu provedor)

### 2.1 Apontar Domínio para Cloud Run
- [ ] Criar registro A ou CNAME conforme instruções do Cloud Run
  - **Opção A (recomendada):** CNAME `@` → `ghs.googlehosted.com`
  - **Opção B:** Registros A para IPs do Google

### 2.2 Subdomínio www (opcional)
- [ ] CNAME `www` → `pptnaocompila.com.br`
- [ ] Ou configurar redirect no Cloud Run

### 2.3 Aguardar Propagação
- [ ] DNS pode levar até 48h para propagar (geralmente minutos)
- [ ] Verificar com: `dig pptnaocompila.com.br`

---

## 3. SSL/HTTPS

- [ ] Cloud Run gera certificado SSL automaticamente após DNS configurado
- [ ] Verificar HTTPS funcionando: `curl -I https://pptnaocompila.com.br`
- [ ] Certificado pode levar alguns minutos após DNS propagar

---

## 4. Resend (Email)

### 4.1 Verificar Domínio
- [ ] Acessar https://resend.com/domains
- [ ] Clicar "Add Domain"
- [ ] Inserir: `pptnaocompila.com.br`
- [ ] Copiar DNS records fornecidos

### 4.2 Configurar DNS para Email
- [ ] **SPF** (TXT): Permite Resend enviar em nome do domínio
  ```
  Tipo: TXT
  Nome: @ (ou pptnaocompila.com.br)
  Valor: v=spf1 include:_spf.resend.com ~all
  ```
- [ ] **DKIM** (CNAME): Assinatura digital dos emails
  ```
  Tipo: CNAME
  Nome: resend._domainkey
  Valor: (fornecido pelo Resend)
  ```
- [ ] **DMARC** (TXT): Política de autenticação
  ```
  Tipo: TXT
  Nome: _dmarc
  Valor: v=DMARC1; p=none;
  ```

### 4.3 Verificar no Resend
- [ ] Aguardar verificação (pode levar alguns minutos)
- [ ] Status deve mudar para "Verified" no painel

### 4.4 Testar Envio
- [ ] Usar formulário de contato no site
- [ ] Verificar se email chega corretamente
- [ ] Verificar headers SPF/DKIM no email recebido

---

## 5. Google Analytics (Opcional)

- [ ] Criar propriedade GA4 em https://analytics.google.com
- [ ] Obter Measurement ID (G-XXXXXXXXXX)
- [ ] Configurar variável `NEXT_PUBLIC_GA_MEASUREMENT_ID` no Cloud Run

---

## 6. Upstash Redis - Rate Limiting (Opcional mas Recomendado)

- [ ] Criar conta em https://upstash.com
- [ ] Criar database Redis (região: us-east-1)
- [ ] Obter `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
- [ ] Configurar variáveis no Cloud Run

---

## 7. Validação Final

### 7.1 Funcionalidades
- [ ] Home page carrega corretamente
- [ ] Lista de episódios funciona
- [ ] Página de episódio individual funciona
- [ ] Player do YouTube funciona
- [ ] Formulário de contato envia email
- [ ] Formulário de sugestão envia email
- [ ] Midiakit acessível

### 7.2 SEO
- [ ] `https://pptnaocompila.com.br/sitemap.xml` acessível
- [ ] `https://pptnaocompila.com.br/robots.txt` acessível
- [ ] Meta tags corretas (verificar com https://metatags.io)
- [ ] Open Graph images funcionando

### 7.3 Performance
- [ ] Testar no PageSpeed Insights
- [ ] Verificar Core Web Vitals

### 7.4 Segurança
- [ ] HTTPS funcionando (cadeado verde)
- [ ] Headers de segurança (CSP, etc.)
- [ ] Rate limiting funcionando (testar com múltiplas requisições)

---

## 8. Pós-Deploy

- [ ] Submeter sitemap ao Google Search Console
- [ ] Configurar alertas de monitoramento (Cloud Monitoring)
- [ ] Documentar processo de deploy para futuras atualizações
- [ ] Criar backup da configuração

---

## Comandos Úteis

```bash
# Ver logs do Cloud Run
gcloud run services logs read pptnc --region=us-east1 --project=PROJECT_ID

# Ver status do serviço
gcloud run services describe pptnc --region=us-east1 --project=PROJECT_ID

# Verificar domínio mapeado
gcloud run domain-mappings describe --domain=pptnaocompila.com.br --region=us-east1

# Testar DNS
dig pptnaocompila.com.br
dig www.pptnaocompila.com.br

# Testar certificado SSL
openssl s_client -connect pptnaocompila.com.br:443 -servername pptnaocompila.com.br
```

---

## Contatos de Suporte

- **GCP:** https://cloud.google.com/support
- **Resend:** https://resend.com/support
- **Upstash:** https://upstash.com/support
