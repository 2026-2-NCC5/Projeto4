# ---- build ---------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /srv/api
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime -------------------------------------------------------------
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /srv/api
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /srv/api/dist ./dist
# migrations e seeds sao lidos em runtime a partir de /srv/database
COPY --from=build /srv/api/dist/db ./dist/db
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
