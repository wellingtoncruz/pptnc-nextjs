FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy standalone output from Next.js build
# Standalone includes minimal node_modules needed for production
COPY apps/iara/.next/standalone ./
COPY apps/iara/.next/static ./apps/iara/.next/static
COPY apps/iara/public ./apps/iara/public

# Cloud Run uses port 8080 by default
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Start the Next.js server
CMD ["node", "apps/iara/server.js"]
