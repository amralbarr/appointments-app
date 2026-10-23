# syntax=docker/dockerfile:1
# BuildKit cache mounts below (--mount=type=cache) persist npm's/apk's own
# download caches ACROSS separate builds (and across every other project
# on this host built the same way, since cache mount ids default to a
# shared per-Dockerfile-path cache unless pinned to a shared `id`) instead
# of re-downloading every package from scratch each time - real storage
# and time savings on a host that rebuilds images repeatedly. Needs
# DOCKER_BUILDKIT=1 (default in any reasonably current `docker build`/
# `docker compose build`).
#
# Build context is the REPO ROOT, not backend/ - `docker build -f
# backend/Dockerfile .` from the repo root, never `docker build ./backend`.
# Needed because the runtime stage copies in two sibling directories
# (prompts/, mcp-gateway/configs/) that live outside backend/ - see that
# stage's own comment for why. Every COPY below is written relative to
# that root context accordingly (`backend/...`, not `./...`). The root
# .dockerignore (not backend/.dockerignore) is what applies to this build.
FROM node:22-alpine AS builder
WORKDIR /usr/src/app
COPY backend/package*.json ./
# MONOREPO-AND-DEPLOYMENT.md's own template says `npm ci --ignore-scripts`
# here. Verified by actually running the built image: that skips bcrypt's
# (a real dependency, not bcryptjs) own install step entirely, which is
# what fetches/builds the musl-correct native binary alpine needs - the
# container crashed on boot with "Exec format error" without it. Plain
# `npm ci` lets bcrypt's own node-pre-gyp install step fetch its real
# musl-tagged prebuilt (it publishes one per {libc}, not just glibc).
RUN --mount=type=cache,target=/root/.npm npm ci
COPY backend/. .
# Prisma's own openssl-version auto-detection needs a real openssl
# present to detect against - without it (verified by actually running
# the built image first) detection fails and silently falls back to a
# stale "openssl-1.1.x" engine target that matches neither this builder
# stage nor the final runtime stage, which both actually have openssl 3.x
# (alpine 3.24 doesn't ship an openssl 1.1 compat package anymore - it
# was fully removed, not just deprecated). Installing the real openssl
# here lets `prisma generate` correctly detect and fetch the matching
# "openssl-3.0.x" engine binary that alpine 3.24 can actually load.
RUN --mount=type=cache,target=/var/cache/apk apk add openssl
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-alpine
# The runtime stage needs the same real openssl the builder stage used
# to generate the matching Prisma engine binary (see builder stage's own
# comment on this) - verified by actually running the built image:
# without it, Prisma's compiled query engine can't dlopen libssl at all.
RUN --mount=type=cache,target=/var/cache/apk apk add postgresql-client openssl
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY backend/package*.json ./
# Two sibling repo-root data files the app reads at runtime via a
# process.cwd()-relative "../" path (chat.service.ts's PROMPT_PATH reads
# ../prompts/ai-prompt.json, mcp-tool-schema.ts's YAML_PATH reads
# ../mcp-gateway/configs/appointments.yaml - both deliberately outside
# backend/ so a non-engineer can edit the AI assistant's persona or the
# MCP tool list without touching code). This image's WORKDIR is
# /usr/src/app, so that same "../" needs to resolve to /usr/src here too
# - found missing by actually running the built image and hitting a real
# ENOENT on POST .../chat (ai-prompt.json falls back to a safe inline
# default if missing, but appointments.yaml has no such fallback and
# crashed the request outright), not assumed from reading the Dockerfile.
COPY prompts /usr/src/prompts
COPY mcp-gateway/configs /usr/src/mcp-gateway/configs
EXPOSE 3000
# An earlier draft of this Dockerfile said "dist/main.js" - verified by
# actually running the built image (not assumed): this project's real tsc
# output nests under dist/src/ (nest-cli.json's sourceRoot is "src",
# tsconfig.json's outDir is the project-root-relative "./dist", so tsc
# preserves the src/ prefix). The literal "dist/main.js" path 404s with
# MODULE_NOT_FOUND; confirmed that failure for real before fixing it to
# match what this repo actually produces.
CMD ["node", "dist/src/main.js"]
