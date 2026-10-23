# syntax=docker/dockerfile:1
# the npm cache mount persists package downloads across separate builds
# (and across every other project on this host built the same way) instead
# of re-fetching from scratch each time - real storage/time savings on a
# host that rebuilds images repeatedly. Needs DOCKER_BUILDKIT=1 (default
# in any reasonably current docker build/docker compose build).
FROM node:22-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY . .
RUN npm run build
# devDependencies (typescript, eslint, the whole build toolchain) are
# needed to build but not to run `next start` - pruned before the runtime
# stage copies node_modules over, same reasoning as backend/Dockerfile's
# own prune step, so the shipped image doesn't carry build-only weight.
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-alpine
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY package*.json next.config.ts ./
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
