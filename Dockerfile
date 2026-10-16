# syntax=docker/dockerfile:1

# Image multi-étapes : on compile avec toutes les dépendances de dev, puis on ne garde
# dans l'image finale que le serveur bundlé, le client buildé et les dépendances de prod.

# --- 1. Build : client (Vite) + serveur (esbuild) -------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
# Les package.json d'abord : tant qu'ils ne changent pas, Docker réutilise la couche
# « npm ci » en cache, même si le code change.
COPY package.json package-lock.json .npmrc ./
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci
COPY . .
RUN npm run build

# --- 2. Dépendances de production du serveur uniquement --------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --omit=dev --workspace=@poker/server --include-workspace-root=false

# --- 3. Image finale ------------------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    CLIENT_DIR=/app/public \
    DATA_DIR=/app/data
WORKDIR /app
# Seul dossier où le serveur écrit : le classement (monté en volume par docker-compose).
RUN mkdir -p /app/data && chown node:node /app/data
# On garde l'arborescence du monorepo : certaines dépendances du serveur sont installées
# dans apps/server/node_modules (version différente de celle d'un outil de build).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/client/dist ./public
# Pas besoin d'être root pour écouter sur le port 3000.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/healthz > /dev/null || exit 1
CMD ["node", "--enable-source-maps", "apps/server/dist/index.js"]
