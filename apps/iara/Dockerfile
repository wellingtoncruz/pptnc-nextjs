# ============================================
# Stage 1: Builder (deps + build combined for pnpm)
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/iara/package.json ./apps/iara/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter iara...

# Copy source code
COPY apps/iara ./apps/iara

# Build argument for app version (embedded at build time)
ARG NEXT_PUBLIC_APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION}

# Build the application
ENV NODE_ENV=production
RUN pnpm --filter iara build

# ============================================
# Stage 2: Runner
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy standalone output from builder
COPY --from=builder /app/apps/iara/.next/standalone ./
COPY --from=builder /app/apps/iara/.next/static ./apps/iara/.next/static
COPY --from=builder /app/apps/iara/public ./apps/iara/public

# Cloud Run uses port 8080 by default
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Start the Next.js server
CMD ["node", "apps/iara/server.js"]
