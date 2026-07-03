FROM nginx:1.27-alpine

# App estático (single-file) — Painel do Expositor 58º CBPC/ML
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
