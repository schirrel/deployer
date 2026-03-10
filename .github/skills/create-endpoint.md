# Skill: Criar Novo Endpoint de API

## Descrição
Use esta skill quando precisar criar um novo endpoint na API REST.

## Contexto Necessário
- Método HTTP (GET, POST, PUT, DELETE)
- Path do endpoint (ex: `/api/logs`, `/api/metrics`)
- O que o endpoint deve retornar

## Passos

### 1. Criar o Handler (routes/)

Crie um novo arquivo em `routes/`:

```javascript
// routes/meu-endpoint.js
'use strict';

/**
 * Meu Endpoint
 * Descrição do que faz.
 * 
 * @agent Backend Agent
 */

async function handler(req, res, jsonResponse) {
  try {
    // Sua lógica aqui
    const resultado = { mensagem: 'ok' };
    
    jsonResponse(res, 200, resultado);
  } catch (err) {
    jsonResponse(res, 500, { error: err.message });
  }
}

module.exports = { handler };
```

### 2. Registrar em server.js

Adicione o import e a rota:

```javascript
// No topo, com os outros requires
const meuEndpoint = require('./routes/meu-endpoint');

// No bloco de roteamento (após authMiddleware)
if (req.method === 'GET' && pathname === '/api/meu-endpoint') {
  return meuEndpoint.handler(req, res, jsonResponse);
}
```

### 3. Para rotas com parâmetros

```javascript
// Rota com parâmetro: /api/logs/:id
const logsMatch = pathname.match(/^\/api\/logs\/([^/]+)$/);
if (req.method === 'GET' && logsMatch) {
  req.params = { id: logsMatch[1] };
  return logsRoute.getById(req, res, jsonResponse);
}
```

### 4. Para rotas POST com body

```javascript
// No handler:
async function handler(req, res, jsonResponse) {
  // Ler body
  const body = await readBody(req);
  
  // Usar body.campo
  console.log(body.nome);
}

// Helper (já existe em deploy.js, pode copiar)
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
```

## Exemplo: Endpoint de Logs do Container

```javascript
// routes/container-logs.js
'use strict';

const docker = require('../services/docker');

async function getLogs(req, res, jsonResponse) {
  const { service } = req.params;
  
  try {
    const logs = await docker.getContainerLogs(service);
    jsonResponse(res, 200, { logs });
  } catch (err) {
    jsonResponse(res, 500, { error: err.message });
  }
}

module.exports = { getLogs };
```

## Testar

```bash
# GET
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/meu-endpoint

# POST
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"campo": "valor"}' \
  http://localhost:4000/api/meu-endpoint
```
