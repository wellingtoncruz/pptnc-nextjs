FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Artefatos do build standalone (next.config.ts: output "standalone"), mesmo padrão do apps/web.
# static-assets/ (referência do Claude Design) NÃO entra na imagem.
COPY apps/hotsite-5a/.next/standalone ./
COPY apps/hotsite-5a/.next/static ./apps/hotsite-5a/.next/static
COPY apps/hotsite-5a/public ./apps/hotsite-5a/public

EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/hotsite-5a/server.js"]
