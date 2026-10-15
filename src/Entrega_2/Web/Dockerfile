# ASA Conecta — portal web. Build estático do Vite servido pelo nginx, que também repassa /api e /health
# para a API (mesma origem: cookies de sessão HttpOnly funcionam sem CORS aberto).
#   docker build -t asa-conecta-web .   (o docker-compose do Backend já faz isso: serviço `web`)
# Nenhum segredo entra na imagem: o build só usa configuração pública.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
# API_UPSTREAM é aplicado no template na subida do container (envsubst da imagem oficial do nginx)
ENV API_UPSTREAM=http://api:3000
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
