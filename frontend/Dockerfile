FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
# Serve the single-page app; unknown paths fall back to index.html (see Caddyfile).
COPY Caddyfile /etc/caddy/Caddyfile
