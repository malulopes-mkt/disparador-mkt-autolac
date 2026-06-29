FROM nginx:1.27-alpine

# App estático (single-file) — Fábrica de Criativos Autolac
COPY index.html /usr/share/nginx/html/index.html
COPY conhecimento-autolac.js /usr/share/nginx/html/conhecimento-autolac.js

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
