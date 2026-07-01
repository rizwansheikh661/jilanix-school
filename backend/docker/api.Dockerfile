# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:20.11.0-alpine AS builder
WORKDIR /workspace

ENV CI=true \
    HUSKY=0

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY apps ./apps
COPY src ./src
COPY scripts ./scripts

# Generate Prisma client BEFORE the Nest build so dist/ contains valid JS
# referencing the generated module.
RUN npx prisma generate --schema prisma/schema

ARG APP_BUILD_SHA=unknown
ARG APP_BUILD_TIME=unknown
ENV APP_BUILD_SHA=${APP_BUILD_SHA} \
    APP_BUILD_TIME=${APP_BUILD_TIME}

RUN npm run build \
 && npm prune --omit=dev

# ---------- runtime ----------
FROM node:20.11.0-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn

RUN apk add --no-cache tini \
 && addgroup -S app -g 10001 \
 && adduser -S app -G app -u 10001

COPY --from=builder --chown=app:app /workspace/node_modules ./node_modules
COPY --from=builder --chown=app:app /workspace/dist ./dist
COPY --from=builder --chown=app:app /workspace/prisma ./prisma
COPY --from=builder --chown=app:app /workspace/package.json ./package.json

ARG APP_BUILD_SHA=unknown
ARG APP_BUILD_TIME=unknown
ENV APP_BUILD_SHA=${APP_BUILD_SHA} \
    APP_BUILD_TIME=${APP_BUILD_TIME}

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/apps/api/main.js"]
