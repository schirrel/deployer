# Guia de Desenvolvimento

## Setup Local

### Pré-requisitos

- Node.js 18+ (recomendado: 20 LTS)
- Docker e Docker Compose
- Git

### Instalação

```bash
# Clone o repositório
git clone <repo-url>
cd deployer

# Configure o ambiente
cp .env.example .env
nano .env

# Configure os serviços
cp data/services.example.json data/services.json
nano data/services.json

# Inicie o servidor
node server.js
```

### Desenvolvimento sem Docker

Para testar localmente sem um projeto Docker real:

```bash
# .env mínimo para desenvolvimento
DEPLOY_TOKEN=dev123
REPO_PATH=/tmp/fake-repo
COMPOSE_FILE=/tmp/fake-repo/docker-compose.yml
PORT=4000

# Criar diretório fake
mkdir -p /tmp/fake-repo
echo "version: '3'" > /tmp/fake-repo/docker-compose.yml
git -C /tmp/fake-repo init

# Rodar
node server.js
```

---

## Estrutura do Projeto

```
deployer/
├── server.js                 # Entry point
├── Dockerfile                # Imagem de produção
├── .env.example              # Template de configuração
│
├── routes/                   # Handlers HTTP
│   ├── auth.js               # Middleware de autenticação
│   ├── deploy.js             # Deploy, stream SSE, rollback
│   ├── status.js             # Status dos containers
│   └── history.js            # Histórico de deploys
│
├── services/                 # Lógica de negócio
│   ├── config.js             # Carrega services.json
│   ├── pipeline.js           # Orquestrador de deploy
│   ├── docker.js             # Wrapper docker/compose
│   ├── git.js                # Wrapper git
│   └── prisma.js             # Migrations
│
├── public/                   # Frontend (servido estaticamente)
│   ├── index.html            # Página única (SPA)
│   ├── css/style.css         # Estilos (dark theme)
│   └── js/
│       ├── api.js            # Cliente HTTP + auth
│       ├── terminal.js       # Componente SSE
│       └── app.js            # Lógica principal
│
├── data/                     # Persistência
│   ├── services.json         # Config de serviços
│   ├── history.json          # Histórico
│   └── logs/                 # Logs de cada deploy
│
├── documentation/            # Esta documentação
│
├── tests/                    # Testes manuais
│   ├── test-auth.js
│   ├── test-history.js
│   └── test-sse.js
│
└── .github/                  # GitHub Copilot
    ├── copilot-instructions.md
    └── skills/
```

---

## Convenções de Código

### JavaScript

- **ES6+** — `const`/`let`, arrow functions, async/await
- **Strict mode** — `'use strict';` em todos os arquivos
- **Sem dependências** — apenas módulos nativos do Node.js
- **JSDoc** — comentários de documentação para funções públicas

```javascript
/**
 * Executa o pipeline completo para um serviço.
 * @param {string} serviceKey  — 'web' | 'api' | 'all'
 * @param {string} deployId
 * @param {object} options     — { force: bool }
 * @returns {Promise<{status: string, summary: object}>}
 */
async function run(serviceKey, deployId, options = {}) {
  // ...
}
```

### CSS

- **Custom Properties** — variáveis CSS para theming
- **BEM** — Block Element Modifier para classes
- **Mobile-first** — media queries para telas maiores

```css
.card__header {
  display: flex;
  justify-content: space-between;
}

.card__name {
  font-size: var(--font-lg);
  color: var(--text-primary);
}

.btn--primary {
  background: var(--accent);
}
```

### Arquivos

- **camelCase** — `pipelineService.js`
- **Módulos** — um export por arquivo principal
- **Index não usado** — imports explícitos

---

## Adicionando Novo Serviço

### 1. Backend (services/)

```javascript
// services/meu-servico.js
'use strict';

/**
 * Meu Serviço
 * Descrição do que faz.
 * 
 * @agent Backend Agent
 */

async function minhaFuncao() {
  // ...
}

module.exports = { minhaFuncao };
```

### 2. Rota (routes/)

```javascript
// routes/meu-endpoint.js
'use strict';

const meuServico = require('../services/meu-servico');

async function handler(req, res, jsonResponse) {
  try {
    const result = await meuServico.minhaFuncao();
    jsonResponse(res, 200, result);
  } catch (err) {
    jsonResponse(res, 500, { error: err.message });
  }
}

module.exports = { handler };
```

### 3. Registrar em server.js

```javascript
const meuEndpoint = require('./routes/meu-endpoint');

// No roteador:
if (req.method === 'GET' && pathname === '/api/meu-endpoint') {
  return meuEndpoint.handler(req, res, jsonResponse);
}
```

---

## Testando

### Testes Manuais

```bash
# Autenticação
DEPLOY_TOKEN=test node tests/test-auth.js

# Histórico
node tests/test-history.js

# SSE (com servidor rodando)
DEPLOY_TOKEN=test node server.js &
DEPLOY_TOKEN=test node tests/test-sse.js
```

### Testando API com cURL

```bash
export TOKEN=dev123

# Status
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/status

# Serviços
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/services

# Deploy (retorna deployId para SSE)
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/deploy/web
```

### Testando SSE

```javascript
// No navegador:
const es = new EventSource('/api/deploy/stream/deploy_123?token=dev123');
es.onmessage = e => console.log(JSON.parse(e.data));
```

---

## Debug

### Logs do Servidor

```bash
# Ver logs em tempo real
node server.js 2>&1 | tee server.log

# Filtrar erros
node server.js 2>&1 | grep -E "(ERRO|Error|error)"
```

### Logs de Deploy

```bash
# Listar logs
ls -la data/logs/

# Ver log específico
cat data/logs/deploy_1710000000000_web.log
```

### Inspecionar Config

```bash
# Ver services.json atual
cat data/services.json | jq .

# Ver histórico
cat data/history.json | jq '.[0]'
```

---

## Fluxo de Alterações

### 1. Backend

```
1. Criar/editar arquivo em services/ ou routes/
2. Testar manualmente com cURL
3. Verificar logs
```

### 2. Frontend

```
1. Editar arquivos em public/
2. Refresh no navegador (Ctrl+Shift+R)
3. Verificar console do navegador
```

### 3. Configuração

```
1. Editar services.json ou .env
2. Reiniciar servidor
3. Testar /api/services
```

---

## Troubleshooting

### "ENOENT: no such file or directory"

Verifique `REPO_PATH` no `.env`.

### "docker compose: command not found"

O binário `docker` não está no PATH. Verifique instalação do Docker.

### "401 Unauthorized" em tudo

Token incorreto ou não definido. Verifique `DEPLOY_TOKEN`.

### SSE não conecta

1. Verifique se o deployId existe
2. Confirme o token no query param
3. Verifique se o deploy ainda está rodando

### Frontend não carrega serviços

1. Verifique `/api/services` no navegador
2. Confirme que `services.json` existe e é válido
3. Veja erros no console do navegador

---

## Performance

### Cache de Configuração

`services/config.js` usa cache baseado em mtime:
- Não recarrega arquivo se não foi modificado
- Invalide manualmente com `config.invalidateCache()`

### Buffer de SSE

`routes/deploy.js` mantém buffer de eventos por 5 minutos:
- Clientes que conectam tarde recebem eventos passados
- Buffer é limpo após TTL

### Histórico

`data/history.json` mantém últimos 100 deploys:
- Mais antigos são removidos automaticamente
- Logs individuais em `data/logs/` permanecem
