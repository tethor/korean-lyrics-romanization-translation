# K-Lyric Neo — Dockerfile
# Multi-stage: deps → build → runner
# Next.js 16 standalone + Playwright for Genius scraping

# ── Stage 1: Install dependencies ───────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ─────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npx next build

# ── Stage 3: Production runner ──────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Playwright: install browsers to a fixed path, accessible by nextjs user
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install system deps for Chromium + CJK fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libwayland-client0 \
    fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Create user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --home /home/nextjs --ingroup nodejs nextjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Install Playwright browsers to /ms-playwright (not /root/.cache)
RUN npx playwright install chromium

# Fix ownership: app + playwright cache
RUN chown -R nextjs:nodejs /app /ms-playwright /home/nextjs

USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]
