# API Reference

## Autenticação

Todas as rotas da API requerem autenticação via Bearer token.

### Header padrão
```
Authorization: Bearer SEU_DEPLOY_TOKEN
```

### Para SSE (Server-Sent Events)
EventSource não suporta headers customizados, então use query param:
```
GET /api/deploy/stream/:deployId?token=SEU_DEPLOY_TOKEN
```

### Resposta de erro (401)
```json
{
  "error": "Unauthorized"
}
```

---

## Endpoints

### GET /api/services

Retorna a configuração de serviços carregada do `services.json`.

**Response 200:**
```json
{
  "services": [
    {
      "key": "web",
      "label": "Web App",
      "subtitle": "Next.js Application",
      "composeName": "webapp",
      "deployable": true
    },
    {
      "key": "db",
      "label": "Database",
      "subtitle": "PostgreSQL",
      "composeName": "postgres",
      "deployable": false
    }
  ],
  "migration": {
    "enabled": true,
    "service": "prisma-migrate"
  }
}
```

---

### GET /api/status

Retorna o status de todos os containers configurados.

**Response 200:**
```json
{
  "services": [
    {
      "key": "web",
      "name": "webapp",
      "status": "running",
      "health": "healthy",
      "startedAt": "2024-03-10T12:00:00.000Z"
    },
    {
      "key": "db",
      "name": "postgres",
      "status": "running",
      "health": "none",
      "startedAt": "2024-03-10T11:00:00.000Z"
    }
  ]
}
```

**Campos de status:**
| Campo | Valores possíveis |
|-------|-------------------|
| `status` | `running`, `stopped`, `exited`, `unknown` |
| `health` | `healthy`, `unhealthy`, `starting`, `none` |

---

### GET /api/status/:service

Retorna o status de um container específico.

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `service` | string | Key do serviço (ex: `web`, `db`) |

**Response 200:**
```json
{
  "key": "web",
  "name": "webapp",
  "status": "running",
  "health": "healthy",
  "startedAt": "2024-03-10T12:00:00.000Z"
}
```

**Response 404:**
```json
{
  "error": "Serviço 'xyz' não encontrado"
}
```

---

### POST /api/deploy/:service

Inicia o pipeline de deploy para um serviço.

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `service` | string | Key do serviço ou `all` para todos |

**Request Body (opcional):**
```json
{
  "force": true
}
```

**Response 202:**
```json
{
  "deployId": "deploy_1710000000000_web",
  "service": "web",
  "message": "Deploy iniciado"
}
```

**Uso:**
```bash
# Deploy de um serviço
curl -X POST http://localhost:4000/api/deploy/web \
  -H "Authorization: Bearer $TOKEN"

# Deploy de todos
curl -X POST http://localhost:4000/api/deploy/all \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/deploy/stream/:deployId

Conecta ao stream SSE de logs do deploy.

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `deployId` | string | ID retornado pelo POST /api/deploy |
| `token` | query | Token de autenticação |

**Headers da resposta:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Eventos SSE:**

1. **log** — Linha de log
```json
{
  "type": "log",
  "line": "▶ docker compose build webapp",
  "stream": "stdout",
  "ts": 1710000000000
}
```

2. **step** — Mudança de step
```json
{
  "type": "step",
  "step": "build:webapp",
  "status": "running",
  "ts": 1710000000000
}
```

3. **done** — Deploy concluído
```json
{
  "type": "done",
  "status": "success",
  "summary": {
    "duration": 45,
    "currentHash": "abc1234",
    "migrationRan": true
  }
}
```

4. **error** — Erro no pipeline
```json
{
  "type": "error",
  "message": "docker compose build falhou (exit 1)"
}
```

**Uso com JavaScript:**
```javascript
const es = new EventSource('/api/deploy/stream/deploy_123?token=SEU_TOKEN');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};

es.onerror = () => {
  es.close();
};
```

---

### POST /api/rollback/:service

Reverte o serviço para o commit anterior e re-deploya.

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `service` | string | Key do serviço |

**Response 202:**
```json
{
  "deployId": "rollback_1710000000000_web",
  "service": "web",
  "message": "Rollback iniciado"
}
```

**Fluxo do rollback:**
1. Busca o commit anterior no histórico
2. `git checkout <hash_anterior>`
3. `docker compose build`
4. `docker compose stop + rm`
5. `docker compose up -d`

---

### POST /api/migrate

Executa migrations Prisma de forma standalone (sem fazer deploy).

**Response 202:**
```json
{
  "deployId": "migrate_1710000000000",
  "message": "Migration iniciada"
}
```

**Fluxo:**
1. Executa `docker compose run --rm prisma-migrate`
2. Emite logs via SSE (mesmo endpoint de stream)

---

### GET /api/history

Retorna o histórico de deploys.

**Response 200:**
```json
{
  "deploys": [
    {
      "id": "deploy_1710000000000_web",
      "service": "web",
      "type": "deploy",
      "status": "success",
      "startedAt": "2024-03-10T12:00:00.000Z",
      "duration": 45,
      "commitBefore": "abc1234",
      "commitAfter": "def5678",
      "migrationRan": true
    },
    {
      "id": "rollback_1710000000000_web",
      "service": "web",
      "type": "rollback",
      "status": "success",
      "startedAt": "2024-03-10T11:00:00.000Z",
      "duration": 30,
      "commitAfter": "abc1234"
    }
  ]
}
```

---

### GET /api/history/:deployId

Retorna detalhes de um deploy específico, incluindo logs.

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `deployId` | string | ID do deploy |

**Response 200:**
```json
{
  "deploy": {
    "id": "deploy_1710000000000_web",
    "service": "web",
    "status": "success",
    "startedAt": "2024-03-10T12:00:00.000Z",
    "duration": 45,
    "commitBefore": "abc1234",
    "commitAfter": "def5678",
    "migrationRan": true
  },
  "logs": "▶ git pull origin main\n✓ Pull concluído...\n..."
}
```

**Response 404:**
```json
{
  "error": "Deploy não encontrado"
}
```

---

## Códigos de Status HTTP

| Código | Significado |
|--------|-------------|
| `200` | Sucesso |
| `202` | Aceito (deploy/rollback iniciado) |
| `401` | Não autorizado (token inválido ou ausente) |
| `404` | Recurso não encontrado |
| `500` | Erro interno do servidor |

---

## Exemplos com cURL

```bash
# Definir token
export TOKEN="seu_deploy_token"

# Listar serviços configurados
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/services

# Verificar status de todos os containers
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/status

# Iniciar deploy do serviço "web"
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/deploy/web

# Deploy de todos os serviços
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/deploy/all

# Ver histórico
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/history

# Executar migration
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/migrate

# Rollback
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/rollback/web
```
