# Deployer Platform - GitHub Copilot Instructions

## Sobre o Projeto

Este é o **Deployer Platform**, uma plataforma web de deploy automatizado para projetos Docker.

### Stack Tecnológica
- **Backend**: Node.js puro (sem Express, sem frameworks)
- **Frontend**: HTML/CSS/JS puro (sem React, Vue, etc.)
- **Comunicação**: Server-Sent Events (SSE) para logs em tempo real
- **Persistência**: Arquivos JSON simples
- **Zero dependências externas**: Apenas módulos nativos do Node.js

### Princípios de Design
1. **Simplicidade** — código direto, sem abstrações desnecessárias
2. **Zero dependências** — não adicionar npm packages
3. **Configuração dinâmica** — serviços definidos via JSON, não hardcoded
4. **Stateless** — estado em arquivos JSON, fácil de inspecionar

---

## Estrutura do Código

```
deployer/
├── server.js              # Entry point (HTTP nativo, roteamento manual)
├── routes/                # Handlers de requisição
│   ├── auth.js            # Middleware Bearer token
│   ├── deploy.js          # Deploy, SSE, rollback
│   ├── status.js          # Status containers
│   └── history.js         # Histórico
├── services/              # Lógica de negócio
│   ├── config.js          # Carrega services.json
│   ├── pipeline.js        # Orquestrador de deploy
│   ├── docker.js          # Comandos docker
│   ├── git.js             # Comandos git
│   └── prisma.js          # Migrations
├── public/                # Frontend estático
│   ├── index.html
│   ├── css/style.css
│   └── js/{api,app,terminal}.js
└── data/                  # Persistência
    ├── services.json      # Config de serviços
    └── history.json       # Histórico de deploys
```

---

## Convenções Importantes

### JavaScript
- Usar `'use strict';` em todos os arquivos
- Preferir `const` sobre `let`, nunca `var`
- Usar async/await em vez de callbacks
- Documentar funções com JSDoc

### HTTP/Roteamento
- Roteamento manual em `server.js` via regex
- Helper `jsonResponse(res, status, data)` para respostas JSON
- CORS configurado para `*` (development)

### SSE (Server-Sent Events)
- Formato: `data: ${JSON.stringify(event)}\n\n`
- Tipos de evento: `log`, `step`, `done`, `error`
- Buffer de replay para clientes que conectam tarde

### Persistência
- Arquivos JSON em `data/`
- Histórico limitado a 100 entradas
- Logs de deploy em `data/logs/{deployId}.log`

---

## Ao Modificar o Código

### Adicionando Endpoint

1. Criar handler em `routes/`:
```javascript
'use strict';

async function handler(req, res, jsonResponse) {
  // ...
  jsonResponse(res, 200, { resultado: 'ok' });
}

module.exports = { handler };
```

2. Registrar em `server.js`:
```javascript
const meuHandler = require('./routes/meu-handler');

// No roteador:
if (req.method === 'GET' && pathname === '/api/meu-endpoint') {
  return meuHandler.handler(req, res, jsonResponse);
}
```

### Adicionando Serviço

1. Criar em `services/`:
```javascript
'use strict';

async function minhaFuncao() {
  // Usar spawn para comandos externos
  // Retornar Promise
}

module.exports = { minhaFuncao };
```

### Modificando Frontend

- Arquivos em `public/` são servidos estaticamente
- `api.js` — funções de fetch com auth
- `app.js` — lógica principal, carrega serviços via API
- `terminal.js` — componente de SSE

---

## Padrões de Código

### Executar Comando Externo
```javascript
const { spawn } = require('child_process');

function runCommand(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: process.env.REPO_PATH });
    
    proc.stdout.on('data', chunk => {
      chunk.toString().split('\n').forEach(line => {
        if (line && onLine) onLine(line, 'stdout');
      });
    });
    
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Exit code ${code}`));
    });
  });
}
```

### Emitir Evento SSE
```javascript
function emit(deployId, event) {
  const emitter = emitters.get(deployId);
  if (emitter) emitter.emit('event', event);
}

// Uso:
emit(deployId, { type: 'log', line: 'Mensagem', stream: 'stdout' });
emit(deployId, { type: 'step', step: 'build', status: 'running' });
emit(deployId, { type: 'done', status: 'success' });
```

### Resposta JSON
```javascript
function handler(req, res, jsonResponse) {
  // Sucesso
  jsonResponse(res, 200, { data: 'ok' });
  
  // Erro
  jsonResponse(res, 404, { error: 'Não encontrado' });
  
  // Aceito (async)
  jsonResponse(res, 202, { deployId: 'xxx', message: 'Iniciado' });
}
```

---

## O que NÃO Fazer

1. **Não adicionar dependências npm** — use apenas módulos nativos
2. **Não usar frameworks** — Express, Fastify, etc.
3. **Não hardcodar serviços** — use services.json
4. **Não usar banco de dados** — persistência em JSON
5. **Não criar abstrações complexas** — código direto e legível

---

## Testes

```bash
# Verificar sintaxe
node -c server.js

# Rodar servidor
DEPLOY_TOKEN=test node server.js

# Testar API
curl -H "Authorization: Bearer test" http://localhost:4000/api/status
```

---

## Documentação

Ver pasta `documentation/`:
- `architecture.md` — visão geral e diagramas
- `api.md` — referência completa da API
- `configuration.md` — como configurar
- `development.md` — guia de desenvolvimento
