FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat git
WORKDIR /app

COPY package.json package-lock.json* ./
# Use cache mount for npm cache to speed up dependency installation
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1

# Use cache mount for Next.js build cache to speed up subsequent builds
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Use build arguments for user/group IDs to match host user
ARG USER_ID=1023
ARG GROUP_ID=1023

# Create group and user with the same IDs as host user
RUN addgroup --system --gid ${GROUP_ID} nodejs 2>/dev/null || true
RUN adduser --system --uid ${USER_ID} --ingroup nodejs nextjs 2>/dev/null || \
    adduser --system --uid ${USER_ID} nextjs 2>/dev/null || true

# Make sure git is available in the container
RUN apk add --no-cache git

# Copy necessary files
# In standalone mode, Next.js creates a minimal server in .next/standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Create directory for repositories (will be mounted as volume)
RUN mkdir -p /repos && chown -R nextjs:nodejs /repos

# Configure Git for nextjs user to trust mounted repositories
USER nextjs
RUN git config --global --add safe.directory '*'

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
