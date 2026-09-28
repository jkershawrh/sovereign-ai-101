# Development / REHEARSAL only. Build with --platform linux/amd64.
ARG NODE_IMAGE=docker.io/library/node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
FROM ${NODE_IMAGE} AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig*.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY contracts ./contracts
RUN npm run build

FROM ${NODE_IMAGE}
ARG SOURCE_REVISION
ARG SOURCE_DIRTY=true
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
       /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
LABEL org.opencontainers.image.title="Sovereign AI 101 presentation" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.sovereign.source-dirty="${SOURCE_DIRTY}" \
      io.sovereign.delivery="development" \
      io.sovereign.source="REHEARSAL"
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY packaging/runtime/config.mjs packaging/runtime/healthcheck.mjs packaging/runtime/presentation.mjs ./packaging/runtime/
ENV NODE_ENV=production PORT=8080 SOVEREIGN_SOURCE=REHEARSAL DELIVERY_STATUS=development SERVICE_URL=http://rehearsal:8787
USER 1001:0
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=4s --start-period=10s --retries=3 CMD ["node", "packaging/runtime/healthcheck.mjs"]
CMD ["node", "packaging/runtime/presentation.mjs"]
