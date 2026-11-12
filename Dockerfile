# syntax=docker/dockerfile:1.7
# Imagem do office-imp: servidor (API + tempo real + tarefas) servindo também o cliente web.
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH ELECTRON_SKIP_BINARY_DOWNLOAD=1 CI=1
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/web ./apps/web
# só os package.json dos outros pacotes, para o lockfile do workspace continuar válido
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/updater/package.json ./apps/updater/package.json
COPY e2e/package.json ./e2e/package.json
RUN pnpm install --frozen-lockfile --filter "@office-imp/server..." --filter "@office-imp/web..."
ARG APP_VERSION=1.0.0
ENV APP_VERSION=$APP_VERSION
RUN pnpm --filter @office-imp/web build && pnpm --filter @office-imp/server build
RUN pnpm --filter @office-imp/server deploy --prod --legacy /out

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
ARG APP_VERSION=1.0.0
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data WEB_DIST=/app/web APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./web
RUN mkdir -p /data/meetings /data/uploads && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
LABEL org.opencontainers.image.source="https://github.com/marcelolucas11/office-imp" \
      org.opencontainers.image.description="office-imp — escritório virtual open source" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
