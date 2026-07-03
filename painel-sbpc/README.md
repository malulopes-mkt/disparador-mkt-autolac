# Painel do Expositor — 58º CBPC/ML

Painel estático (single-file) com o cronograma e plano de ação do estande **nº 131 (42 m²)** da WMI na Exposição Técnico-científica do 58º Congresso Brasileiro de Patologia Clínica / Medicina Laboratorial (CentroSul, Florianópolis — 15 a 17 de setembro de 2026).

## O que tem

- **Contagem regressiva** para o prazo crítico (03/08/2026) e para o início da montagem (11/09).
- **Cronograma faseado** (5 fases) com 21 tarefas, datas, responsáveis/destinatários e filtros.
- **Checklist interativo** com progresso salvo no navegador (`localStorage`).
- **Documentação obrigatória** agrupada por destinatário e **contatos-chave**.

Feito no padrão visual WMI/Autolac (tema escuro, aurora, glassmorphism, Poppins).

## Rodar local

```bash
npx http-server . -p 4174 -c-1
# ou
python -m http.server 4174
```

## Deploy no Coolify

App estático servido por nginx. No Coolify:

1. **New Resource → Application → Dockerfile** (aponte para esta pasta `painel-sbpc/`).
2. Porta exposta: **80**.
3. Defina o domínio (http) e os **limites de CPU/RAM** no painel (app leve: 0,25 vCPU / 128 MB são suficientes).
4. Healthcheck já embutido no Dockerfile (`wget` em `/`).

Imagem final baseada em `nginx:1.27-alpine` (~50 MB).
