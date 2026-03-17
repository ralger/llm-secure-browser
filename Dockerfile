# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:18-bookworm-slim AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
# node:18-bookworm-slim + Playwright-managed Chromium.
# Using the Playwright-bundled browser (not system Chromium) guarantees the
# browser version exactly matches the Playwright library version — this avoids
# subtle automation breakage from version skew.
FROM node:18-bookworm-slim AS runtime

# Put Playwright browsers in a fixed, predictable path under /app so they are
# not lost if the home directory changes.
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers
ENV NODE_ENV=production
ENV PORT=3000

# Run Chromium in headed mode — required to bypass Cloudflare on ChurchSuite.
# Xvfb (added below) provides a virtual framebuffer so headed mode works
# inside a headless container without a physical display.
ENV BROWSER_HEADLESS=false

WORKDIR /app

# Install production dependencies first (better layer caching — this layer
# only rebuilds when package.json changes, not when src changes).
COPY package*.json ./
RUN npm ci --omit=dev

# Download Chromium and install all required system libraries, plus Xvfb.
# `--with-deps` runs the OS-level package installer for every library Chromium
# needs (libnss3, libatk, libgbm, etc.) — equivalent to the old manual apt list
# but version-safe and maintained by the Playwright team.
# Xvfb provides a virtual X display so headed Chromium works without a screen.
# Clean up the apt cache in the same layer to keep the image lean.
RUN npx playwright install chromium --with-deps \
    && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled application from builder stage.
COPY --from=builder /app/dist ./dist

# Copy startup script that launches Xvfb then execs node.
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3000

# Inline healthcheck — uses Node itself (no curl required in the image).
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["./start.sh"]
