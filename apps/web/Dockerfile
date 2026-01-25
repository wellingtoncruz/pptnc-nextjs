FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

# Copia os arquivos necessários para rodar (dependendo se você usa output: 'standalone' ou não)
# Se você usa output: 'standalone' no next.config.js (recomendado):
COPY apps/web/.next/standalone ./
COPY apps/web/.next/static ./apps/web/.next/static
COPY apps/web/public ./apps/web/public

# Se NÃO usa standalone, precisaria copiar node_modules e .next inteiro:
# COPY node_modules ./node_modules
# COPY apps/web/.next ./apps/web/.next
# COPY apps/web/public ./apps/web/public
# COPY apps/web/package.json ./apps/web/package.json

EXPOSE 8080
ENV PORT 8080
ENV HOSTNAME "0.0.0.0"

CMD ["node", "apps/web/server.js"] 
# (O caminho do server.js depende da estrutura do standalone, verifique se é apps/web/server.js ou apenas server.js)