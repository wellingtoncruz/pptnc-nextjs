# syntax=docker/dockerfile:1

# Multi-stage Dockerfile for Next.js standalone deployment (monorepo)
# Build context must be the MONOREPO ROOT
#
# Usage:
#   docker build -f apps/web/Dockerfile -t pptnc:latest .

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps
WORKDIR /app

# Install dependencies needed for native modules
RUN apk add --no-cache libc6-compat

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/datastore/package.json ./packages/datastore/

# Install dependencies
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Builder
# ============================================
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy entire workspace with dependencies from deps stage
COPY --from=deps /app ./

# Copy source (overwrites package.json files with full source)
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @pptnc/web build

# ============================================
# Stage 3: Runner (Production)
# ============================================
FROM node:22-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder (monorepo-relative standalone output)
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Switch to non-root user
USER nextjs

# Cloud Run provides PORT env var (default 8080)
EXPOSE 8080

# Start the server
# HOSTNAME must be explicitly set to 0.0.0.0 because Cloud Run/K8s
# overrides the HOSTNAME env var with the pod instance name
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node apps/web/server.js"]
