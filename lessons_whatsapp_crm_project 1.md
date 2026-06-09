---
name: licoes-aprendidas-whatsapp-crm
description: Documentação completa de lições aprendidas no projeto WhatsApp → HubSpot CRM da WMI. Voltada para quem vai implementar projeto similar com agente único (estilo Aurora).
metadata: 
  node_type: memory
  type: reference
  created: 2026-05-31
  originSessionId: c0b3589e-2a0d-4848-b08c-7e2daf788c5c
---

# Lições Aprendidas — WhatsApp CRM Integration

> **Para quem é este documento:** Quem quer construir um sistema que capta conversas do WhatsApp corporativo, classifica com IA e registra automaticamente no CRM — com um único número/agente orquestrando tudo.

---

## 1. ARQUITETURA RECOMENDADA (agente único)

```
WhatsApp (número único)
    │
    ▼
Evolution API (self-hosted)
    │  Webhook: evento messages.upsert
    ▼
n8n — Receptor (webhook)
    │  Filtra, extrai phone/texto, descarta grupos e internos
    ▼
n8n — Buffer (staticData global)
    │  Agrupa mensagens por phone até silêncio de N minutos
    ▼
n8n — Processador (timer every 1 min)
    │  Quando conversa ficou N min sem mensagem:
    │  1. Envia transcrição para Claude → resumo + classificação
    │  2. Busca contato no CRM por telefone
    │  3. Cria nota/comunicação no CRM
    │  4. Associa ao deal/lead/projeto ativo
    │  5. Grava no histórico (staticData)
    ▼
CRM (HubSpot)     + Painel HTML (opcional)
```

**Diferença do caso multi-vendedor:** Sem `instanceMap` (só 1 instância), sem roteamento por vendedor. O `ownerId` fixo é o do agente/responsável único.

---

## 2. EVOLUTION API — GOTCHAS CRÍTICOS

### 2.1 Formato @lid — problema com phones

**O problema:** WhatsApp moderno usa `remoteJid` em formato `@lid` (ex: `107670585524361@lid`) em vez do número real. Se usar só `remoteJid`, o phone extraído fica errado e a busca no CRM falha.

**A solução:** Usar `remoteJidAlt` quando disponível — ele tem o número real:

```javascript
const key     = data?.key || {};
const jidAlt  = key.remoteJidAlt || '';
const jid     = key.remoteJid || '';
const useJid  = (jidAlt && !jidAlt.includes('@g.us')) ? jidAlt : jid;
const rawNum  = useJid.replace('@s.whatsapp.net','').replace('@lid','');
const canonical = rawNum.startsWith('55') ? rawNum : '55' + rawNum;
const phone = '+' + canonical;
```

**Regra de ouro:** Sempre preferir `remoteJidAlt`. O `remoteJid` em formato `@lid` não tem o número real.

### 2.2 Variante 8 vs 9 dígitos (BR)

Celulares brasileiros têm variante antiga (8 dígitos) e nova (9 dígitos com o 9 extra). O WhatsApp pode registrar o mesmo contato com qualquer formato. Na busca do CRM, sempre tentar as duas variantes:

```javascript
// 9-digit: +5537999342672 (13 chars após +)
// 8-digit: +553799342672  (12 chars após +)
function generatePhoneVariants(phone) {
  const digits = phone.replace('+','');
  const variants = [phone];
  if (digits.length === 13 && digits[4] === '9') {
    variants.push('+' + digits.slice(0,4) + digits.slice(5)); // 9→8
  }
  if (digits.length === 12) {
    variants.push('+' + digits.slice(0,4) + '9' + digits.slice(4)); // 8→9
  }
  return variants;
}
```

Na busca HubSpot, usar `CONTAINS_TOKEN` com as duas variantes em `filterGroups` separados.

### 2.3 Paginação da Evolution API

A Evolution API usa **paginação por página** (não por offset):

```json
// CORRETO
POST /chat/findMessages/{instance}
{ "where": {}, "limit": 50, "page": 2, "order": "DESC" }

// ERRADO (não funciona como esperado)
{ "where": {}, "limit": 50, "offset": 50 }
```

Response: `{ messages: { total, pages, currentPage, records: [...] } }`

Para buscar dados históricos de forma eficiente: usar `order: "DESC"` (mais recente primeiro) e parar quando o timestamp for anterior ao período desejado.

### 2.4 Filtrar eventos

No webhook, só processar `event === 'messages.upsert'`. Ignorar status updates, grupos (`@g.us`), broadcasts:

```javascript
if (event !== 'messages.upsert') return [];
if (remoteJid.includes('@g.us')) return [];
if (remoteJid.includes('@broadcast')) return [];
if (key.fromMe === undefined) return []; // payload malformado
```

### 2.5 Extrair texto de diferentes tipos de mensagem

```javascript
function extractText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    (m.audioMessage || m.pttMessage ? '[audio]' : '') ||
    (m.stickerMessage ? '[sticker]' : '') ||
    ''
  ).trim();
}
```

---

## 3. BLOCKLIST DE NÚMEROS INTERNOS

**Problema:** Sem filtro, mensagens entre colegas da equipe entram no pipeline e criam notas desnecessárias no CRM.

**Solução:** Bloquear na entrada (node Extrair Mensagem do Receptor), antes de qualquer processamento:

```javascript
// Números internos — bloquear silenciosamente
const INTERNAL_PHONES = new Set([
  '5511999999999', // Fulano
  '5537999999999', // Ciclano
  // ...
]);

// Verificar ambas as variantes (8 e 9 dígitos)
const toCheck = new Set([canonical]);
if (canonical.length === 13 && canonical[4] === '9')
  toCheck.add(canonical.slice(0,4) + canonical.slice(5));
if (canonical.length === 12)
  toCheck.add(canonical.slice(0,4) + '9' + canonical.slice(4));

for (const num of toCheck) {
  if (INTERNAL_PHONES.has(num)) return []; // descarte silencioso
}
```

---

## 4. PADRÃO DO BUFFER (sessões de conversa)

O buffer agrupa mensagens por telefone com janela de silêncio:

```javascript
// staticData global do workflow n8n
const sd = $getWorkflowStaticData('global');
if (!sd.buffer) sd.buffer = {};

// Ao receber mensagem:
const { phone, text, from, ts, instancia } = input;
if (!sd.buffer[phone]) {
  sd.buffer[phone] = { messages: [], lastTs: ts, instancia };
}
sd.buffer[phone].messages.push({ from, text, ts });
sd.buffer[phone].lastTs = ts;

// Timer (1 min): encontrar conversas "stale"
const silenceMs = (sd.config?.silenceMinutes || 5) * 60 * 1000;
const stale = Object.entries(sd.buffer)
  .filter(([, conv]) => (Date.now() - conv.lastTs * 1000) >= silenceMs)
  .map(([phone, conv]) => ({ phone, ...conv }));
```

**Regras práticas:**
- Janela de silêncio padrão: 1–5 minutos para atendimento comercial
- Após enviar ao CRM, limpar o buffer (remover a entrada)
- Usar `ts * 1000` para converter Evolution timestamps (segundos) para ms

---

## 5. INTEGRAÇÃO COM HUBSPOT

### 5.1 Busca de contato por telefone

```javascript
// Buscar por phone E mobilephone E hs_whatsapp_phone_number
// Usando as duas variantes (8 e 9 dígitos) em filterGroups separados
{
  filterGroups: [
    { filters: [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: '37999342672' }] },
    { filters: [{ propertyName: 'mobilephone', operator: 'CONTAINS_TOKEN', value: '37999342672' }] },
    { filters: [{ propertyName: 'hs_whatsapp_phone_number', operator: 'CONTAINS_TOKEN', value: '37999342672' }] },
    // variante 8 dígitos...
  ],
  properties: ['firstname','lastname','phone','hubspot_owner_id'],
  limit: 1
}
```

### 5.2 Criar nota de conversa (Communication object)

```javascript
POST /crm/v3/objects/communications
{
  properties: {
    hs_communication_channel_type: 'WHATS_APP',
    hs_communication_body: '<html_transcricao>',
    hs_communication_logged_from: 'CRM',
    hs_timestamp: String(Date.now())  // ms, como string
  },
  associations: [
    // SEMPRE incluir o contato — preenche o campo "Contatado"
    { to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 81 }] },
    // Adicionar deal se existir
    { to: { id: dealId },    types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 85 }] }
  ]
}
```

**CRÍTICO:** Sempre associar o contato (typeId: 81) junto com o deal (typeId: 85). Sem isso, o campo "Contatado" fica vazio na interface do HubSpot.

### 5.3 Association TypeIds comuns (Communication como origem)

| Para | TypeId | Tipo |
|------|--------|------|
| Contact | 81 | HUBSPOT_DEFINED |
| Deal | 85 | HUBSPOT_DEFINED |
| Company | 87 | HUBSPOT_DEFINED |
| Lead (0-4) | via v4 API | PUT default |
| Project (0-970) | 1282 | HUBSPOT_DEFINED |

### 5.4 Criar contato novo (quando não encontrado)

```javascript
// Criar placeholder com nome genérico
POST /crm/v3/objects/contacts
{
  properties: {
    firstname: 'ContatoWhats01',  // incrementar contador
    phone: phone,
    mobilephone: phone,
    hs_whatsapp_phone_number: phone,
    hubspot_owner_id: ownerIdDoAgente
  }
}
// Depois criar nota no novo contato com aviso de revisão
```

---

## 6. CLASSIFICAÇÃO COM CLAUDE (custo zero em automações)

**Regra fundamental:** Automações recorrentes NUNCA devem chamar a API Claude paga diretamente. Usar o Claude via **credencial já contratada no n8n** (httpHeaderAuth com x-api-key).

### 6.1 Padrão do node HTTP Request para Claude no n8n

```json
{
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "parameters": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "anthropic-version", "value": "2023-06-01" },
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: $json.prompt }] }) }}"
  },
  "credentials": {
    "httpHeaderAuth": { "id": "<CREDENTIAL_ID>", "name": "Anthropic x-api-key" }
  }
}
```

### 6.2 Prompt de classificação de conversa

```
Analise essa conversa WhatsApp entre agente e contato. Retorne APENAS um JSON válido sem markdown:
{
  "tipo": "venda|suporte|reclamacao|outro",
  "tom": "positivo|neutro|negativo",
  "pontos": ["ponto 1","ponto 2"],
  "proximosPasso": "próxima ação sugerida"
}

Conversa:
{transcricao_formatada}
```

**Usar Claude Haiku** para classificação — rápido, barato, suficiente para essa tarefa.

---

## 7. CRIAÇÃO DE WORKFLOWS N8N VIA API

Para criar workflows programaticamente (sem clicar na UI):

```javascript
// POST /api/v1/workflows
const workflow = {
  name: "Nome do Workflow",
  nodes: [/* array de nodes */],
  connections: {
    "NodeName": {
      main: [[{ node: "NextNode", type: "main", index: 0 }]]
    }
  },
  settings: { saveManualExecutions: false }
};

// ATENÇÃO: 'active' é read-only no POST
// Ativar separadamente:
POST /api/v1/workflows/{id}/activate
Headers: { Content-Type: application/json }
Body: {}
```

### 7.1 Padrão de node Code (v2)

```json
{
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "parameters": {
    "jsCode": "const input = $input.first().json;\n// seu código aqui\nreturn [{ json: resultado }];"
  }
}
```

### 7.2 Padrão de Webhook responsivo

```json
{
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "parameters": {
    "path": "meu-webhook",
    "httpMethod": "POST",
    "responseMode": "responseNode",
    "options": {}
  },
  "webhookId": "uuid-unico"
}
```

Com `responseMode: "responseNode"`, sempre adicionar um node `respondToWebhook` ao final do fluxo.

### 7.3 Conexões — array duplo obrigatório

```javascript
// CORRETO: array de array
connections = {
  "Webhook": {
    main: [[{ node: "ProximoNode", type: "main", index: 0 }]]
  }
}

// ERRADO: array simples
connections = {
  "Webhook": {
    main: [{ node: "ProximoNode" }]
  }
}
```

---

## 8. PAINEL HTML DE MONITORAMENTO (opcional mas muito útil)

### 8.1 Arquitetura do painel

- HTML/CSS/JS puro (sem framework)
- Hospedado via Dockerfile + nginx no Coolify
- Comunica com n8n via bridge endpoint (não acessa CRM diretamente)
- Segredos injetados via `sed` no entrypoint (nunca hardcoded no HTML)

### 8.2 Padrão do Dockerfile

```dockerfile
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
```

```bash
# entrypoint.sh
#!/bin/sh
sed -i "s|__BRIDGE_KEY__|${BRIDGE_KEY}|g" /usr/share/nginx/html/index.html
nginx -g 'daemon off;'
```

### 8.3 Bridge pattern — n8n como intermediário

Em vez de expor tokens do CRM no browser, usar um webhook n8n como proxy:

```javascript
// No painel (browser):
async function bridge(action, payload = {}) {
  const r = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bridge-key': BRIDGE_KEY },
    body: JSON.stringify({ action, ...payload })
  });
  return r.json();
}

// No n8n (Bridge Handler — Code node):
const action = body.action;
if (action === 'get_state') { /* retorna estado */ }
if (action === 'get_history') { /* retorna histórico filtrado */ }
```

**IMPORTANTE:** Implementar `get_history` separado de `get_state`. Com 1000+ entradas no histórico, o payload do `get_state` fica pesado (200KB+) e causa timeouts. O `get_history` filtra por período no servidor e retorna só o necessário.

### 8.4 Histórico no staticData

O n8n permite persistir dados no `staticData` de um workflow:

```javascript
const sd = $getWorkflowStaticData('global');
if (!sd.history) sd.history = [];

// Adicionar entrada
sd.history.push({
  ts: Date.now(),           // ms — timestamp de processamento
  phone: phone,             // número do contato (E.164: +5537...)
  ownerId: hubspotOwnerId,  // ID do responsável no CRM
  duracaoMs: duracaoMs,     // duração da sessão em ms
  tom: 'positivo',          // classificação Claude
  tipo: 'venda',            // classificação Claude
  clienteRespondeu: true    // se o cliente respondeu
});

// Limitar a 60 dias
const sixtyDays = 60 * 24 * 60 * 60 * 1000;
sd.history = sd.history.filter(e => Date.now() - e.ts <= sixtyDays);
```

---

## 9. DEPLOY NO COOLIFY

### 9.1 Configuração do app

```
Build Pack: Dockerfile
FQDN: http://meuapp.apps.meudomain.com  ← http, NÃO https
  (Apache/Traefik faz SSL termination — se usar https no Coolify = loop redirect infinito)
Ports: 80
```

### 9.2 Dois remotes git

```bash
# origin: backup (Ferramentas internas)
# infra: o que o Coolify monitora para auto-deploy
git remote add infra https://.../_git/MeuRepo
git push infra main  # auto-deploy no Coolify
```

### 9.3 Variáveis de ambiente seguras

Nunca escrever tokens em arquivos git. Usar env vars no Coolify + sed no entrypoint:
- `BRIDGE_KEY` — chave do bridge n8n
- `ACCESS_PW` — senha do painel
- Outros tokens sensíveis

---

## 10. TIMESTAMPS — ARMADILHAS

| Fonte | Formato | Unidade |
|-------|---------|---------|
| Evolution `messageTimestamp` | Unix | **Segundos** |
| n8n `Date.now()` | Unix | **Milissegundos** |
| HubSpot `hs_timestamp` | String Unix | **Milissegundos** |
| JavaScript Date | | **Milissegundos** |

**Converter Evolution → bridge:** `ts_first * 1000` (segundos → ms)

**Nunca misturar** segundos e milissegundos no mesmo array de histórico.

---

## 11. MÉTRICAS E ANÁLISE

### 11.1 Tom positivo — cálculo correto

**Errado:** `positivo / (positivo + neutro + negativo)`  
Dilui o resultado quando há muitas entradas sem classificação (tom='neutro' default).

**Correto:** `positivo / (positivo + negativo)`  
Só considera entradas com sinal real de sentimento:

```javascript
const classif = toms.filter(t => t !== 'neutro');
const pctPos = classif.length
  ? Math.round(classif.filter(t => t === 'positivo').length / classif.length * 100)
  : null; // null = sem dados classificados
```

### 11.2 Nível de produtividade — por dia útil

Thresholds por conversas REAIS/dia útil (excluindo prospecção):
- ⬜ Improdutivo: 0–1/dia
- ✅ Normal: 2–4/dia
- 🌡️ Produtivo: 5–9/dia
- 🔥 Muito Produtivo: 10+/dia

```javascript
function countWorkingDays(from, to) {
  const holidays = new Set(['2026-01-01','2026-04-21','2026-05-01',
    '2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-12-25']);
  let count = 0;
  const d = new Date(from); d.setHours(12,0,0,0);
  const end = new Date(to);  end.setHours(12,0,0,0);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(d.toISOString().slice(0,10))) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 1);
}
```

### 11.3 Separar prospecção de conversa real

Usar o campo `clienteRespondeu: bool` em cada entrada do histórico:
- `false` → só o agente enviou mensagens → prospecção
- `true` → cliente respondeu → conversa real

Gravar no Limpar Buffer:
```javascript
const clienteRespondeu = msgs.some(m => m.from !== 'vendedor');
```

---

## 12. BACKFILL DE DADOS HISTÓRICOS

Para preencher dados históricos a partir da Evolution API:

### 12.1 Script Python (recomendado)

```python
import truststore; truststore.inject_into_ssl()  # SSL no Windows
import requests, time
from datetime import datetime, timezone

def fetch_page(instance, page, evo_key):
    r = requests.post(f"{EVO_URL}/chat/findMessages/{instance}",
        headers={"apikey": evo_key, "Content-Type": "application/json"},
        json={"where": {}, "limit": 50, "page": page, "order": "DESC"},
        timeout=30)
    r.raise_for_status()
    d = r.json()
    msgs = d["messages"]
    return msgs.get("records", []), int(msgs.get("pages", 1))
```

### 12.2 Deduplicação

A action `backfill_history` do bridge deve deduplicar por `ts`:

```javascript
if (action === 'backfill_history') {
  const entries = body.entries || [];
  const existingTs = new Set(sd.history.map(e => String(e.ts)));
  const toAdd = entries.filter(e => !existingTs.has(String(e.ts)));
  sd.history = [...sd.history, ...toAdd];
  sd.history.sort((a, b) => a.ts - b.ts);
  return [{ json: { ok: true, added: toAdd.length } }];
}
```

### 12.3 Limpeza de dados históricos

Se o backfill for executado sem filtrar números internos, limpar com:

```javascript
// Action 'purge_phones' no Bridge Handler
if (action === 'purge_phones') {
  const phones = new Set(body.phones || []);
  const before = sd.history.length;
  sd.history = sd.history.filter(e => !e.phone || !phones.has(e.phone));
  return [{ json: { ok: true, removed: before - sd.history.length } }];
}
```

---

## 13. SEGURANÇA

### 13.1 Nunca escrever em arquivos

- API keys do n8n → usar variáveis PowerShell em memória
- Token HubSpot → credencial n8n (nunca no HTML)
- API key Evolution → env var no Coolify
- Chave do bridge → env var no Coolify

### 13.2 Chave do bridge

Sempre validar no início do Bridge Handler:

```javascript
const key = (raw.headers && raw.headers['x-bridge-key']) || body['x-bridge-key'];
if (key !== 'minha-chave-secreta') return [{ json: { error: 'unauthorized' } }];
```

### 13.3 XSS no painel

- Todo conteúdo dinâmico no HTML: passar por `DOMPurify.sanitize()`
- Payloads com dados do usuário: **nunca** em atributos HTML — usar Map em memória JS
- Insight de IA (Claude): sanitizar com DOMPurify antes de `innerHTML`

---

## 14. PROBLEMAS COMUNS E SOLUÇÕES

| Problema | Causa | Solução |
|----------|-------|---------|
| SSL error no Python 3.14 no Windows | Python não usa cert store do Windows | `import truststore; truststore.inject_into_ssl()` |
| Phone errado nas notas HubSpot | JID @lid sem usar remoteJidAlt | Usar `remoteJidAlt` primeiro |
| Timeout no get_state com histórico grande | Payload 200KB+ | Criar action `get_history` com filtro por período |
| Tom positivo artificialmente baixo | Entradas sem classificação têm tom='neutro' | Calcular pctPos excluindo neutro do denominador |
| Conversas internas no histórico | Backfill sem blocklist | Filtrar por lista de phones internos |
| Deploy loop redirect | FQDN com https:// no Coolify | FQDN deve ser http:// (Apache termina SSL) |
| Duplicatas no histórico | Timestamp collision | Deduplicar por ts com Set antes de inserir |
| "Contatado: 0 contatos" no HubSpot | Só associa deal, não contato | Sempre incluir association typeId:81 (contato) |

---

## 15. ORDEM DE IMPLEMENTAÇÃO RECOMENDADA

Para quem vai começar do zero:

1. **Setup Evolution API** — instalar, criar instância, conectar WhatsApp
2. **Webhook básico no n8n** — receber e logar eventos (só debug)
3. **Extrator de mensagem** — `remoteJidAlt`, tipos de mensagem, blocklist
4. **Buffer** — staticData, janela de silêncio, timer
5. **Integração CRM** — busca por telefone, criar nota, associações
6. **Classificação Claude** — adicionar após CRM estar funcionando
7. **Histórico e painel** — opcional, após fluxo principal estável
8. **Backfill** — só se precisar de dados históricos

**Regra de ouro:** Testar cada etapa isoladamente antes de conectar com a próxima.

---

## 16. STACK PADRÃO WMI (referência)

| Componente | Tecnologia |
|-----------|------------|
| WhatsApp | Evolution API (self-hosted) |
| Automação | n8n (self-hosted, autolac.com.br) |
| CRM | HubSpot |
| Deploy | Coolify (self-hosted) |
| Repositório | Azure DevOps |
| IA | Claude Haiku (via n8n credential) |
| Painel | HTML/CSS/JS + nginx Docker |
| SSL | Apache wildcard + Let's Encrypt |

---

*Documentação gerada em 2026-05-31 com base no projeto WMI WhatsApp → HubSpot (agentes Comercial + CS).*
