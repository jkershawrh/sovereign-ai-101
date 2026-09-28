# Development / REHEARSAL only. Build with --platform linux/amd64.
ARG NODE_IMAGE=docker.io/library/node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13@sha256:7924c53f56526359d0f491c22517306d8d92f1b285656a6094398e2c55bbaeca
FROM ${NODE_IMAGE} AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig*.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY contracts ./contracts
RUN npm run build

FROM ${RUNTIME_IMAGE}
ARG SOURCE_REVISION
ARG SOURCE_DIRTY=true
LABEL org.opencontainers.image.title="Sovereign AI 101 presentation" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.sovereign.source-dirty="${SOURCE_DIRTY}" \
      io.sovereign.delivery="development" \
      io.sovereign.source="REHEARSAL"
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY packaging/runtime/config.mjs packaging/runtime/healthcheck.mjs packaging/runtime/presentation.mjs ./packaging/runtime/
ENV NODE_ENV=production PORT=8080 SOVEREIGN_SOURCE=REHEARSAL DELIVERY_STATUS=development SERVICE_URL=http://rehearsal:8787
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=4s --start-period=10s --retries=3 CMD ["/nodejs/bin/node", "packaging/runtime/healthcheck.mjs"]
CMD ["packaging/runtime/presentation.mjs"]
