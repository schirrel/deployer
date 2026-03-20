# Arquitetura do Deploy Platform

## Visão Geral

O Deploy Platform é uma aplicação web para automação de deploys de projetos Docker. Foi projetado com os seguintes princípios:

- **Zero dependências externas** — apenas módulos nativos do Node.js
- **Configuração dinâmica** — serviços definidos via JSON, não hardcoded
- **Streaming em tempo real** — logs via Server-Sent Events (SSE)
- **Stateless** — estado persistido em arquivos JSON simples

---

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │  index.html │  │   app.js    │  │ terminal.js │                      │
│  │  (UI/CSS)   │  │  (lógica)   │  │   (SSE)     │                      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                      │
│         └────────────────┼────────────────┘                              │
│                          │ HTTP/SSE                                      │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────────┐
│                           SERVER (Node.js)                               │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         server.js                                   │ │
│  │  • HTTP nativo (sem Express)                                        │ │
│  │  • Roteamento manual via regex                                      │ │
│  │  • Serve arquivos estáticos (public/)                               │ │
│  │  • CORS headers                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                               │                                          │
│         ┌─────────────────────┼─────────────────────┐                   │
│         ▼                     ▼                     ▼                   │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐              │
│  │ routes/     │      │ routes/     │      │ routes/     │              │
│  │ auth.js     │      │ deploy.js   │      │ status.js   │              │
│  │             │      │ history.js  │      │             │              │
│  └─────────────┘      └──────┬──────┘      └──────┬──────┘              │
│                              │                    │                      │
│         ┌────────────────────┼────────────────────┘                     │
│         ▼                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        services/                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │config.js │  │pipeline.js│ │ docker.js│  │  git.js  │         │   │
│  │  │          │  │          │  │          │  │          │         │   │
│  │  │Carrega   │  │Orquestra │  │Executa   │  │Executa   │         │   │
│  │  │services. │  │o fluxo   │  │docker    │  │git pull/ │         │   │
│  │  │json      │  │de deploy │  │compose   │  │checkout  │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │   │
│  │                     │                                            │   │
│  │               ┌─────┴─────┐                                      │   │
│  │               │ prisma.js │                                      │   │
│  │               │           │                                      │   │
│  │               │ Executa   │                                      │   │
│  │               │ migrations│                                      │   │
│  │               └───────────┘                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                               │                                          │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│                           SISTEMA                                         │
│                                                                           │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │
│  │  Docker Socket  │    │   Git Repository │    │   data/         │       │
│  │  /var/run/      │    │   (REPO_PATH)    │    │   • history.json│       │
│  │  docker.sock    │    │                  │    │   • services.json│      │
│  └─────────────────┘    └─────────────────┘    │   • logs/       │       │
│                                                 └─────────────────┘       │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Deploy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          PIPELINE DE DEPLOY                               │
└──────────────────────────────────────────────────────────────────────────┘

  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
  │ 1. GIT  │───▶│ 2. BUILD│───▶│ 3. DOWN │───▶│4.MIGRATE│───▶│ 5. UP   │
  │  PULL   │    │         │    │         │    │         │    │         │
  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
  git pull       docker         docker         docker         docker
  origin main    compose        compose        compose        compose
                 build          stop + rm      run migrate    up -d
                 --no-cache

                                                                    │
                                                                    ▼
                                                             ┌─────────┐
                                                             │6.HEALTH │
                                                             │  CHECK  │
                                                             └─────────┘
                                                                    │
                                                                    ▼
                                                             Polling 2s
                                                             Timeout 30s
```

### Estados do Deploy

| Estado | Descrição |
|--------|-----------|
| `running` | Deploy em execução |
| `success` | Todos os steps concluídos com sucesso |
| `warning` | Deploy concluído mas health check falhou/timeout |
| `failed` | Erro em algum step |

---

## Fluxo de Dados SSE

```
┌─────────┐          ┌─────────┐          ┌─────────┐
│ Browser │          │ Server  │          │Pipeline │
└────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │
     │ POST /api/deploy/  │                    │
     │ ──────────────────▶│                    │
     │                    │ pipeline.run()     │
     │ { deployId }       │───────────────────▶│
     │ ◀──────────────────│                    │
     │                    │                    │
     │ GET /api/deploy/   │                    │
     │ stream/:deployId   │                    │
     │ ──────────────────▶│                    │
     │                    │◀─ on('event') ─────│
     │ SSE: step changed  │                    │
     │ ◀──────────────────│                    │
     │                    │                    │
     │ SSE: log line      │◀─ on('event') ─────│
     │ ◀──────────────────│                    │
     │                    │                    │
     │ SSE: done          │◀─ on('event') ─────│
     │ ◀──────────────────│                    │
     │                    │                    │
```

---

## Componentes Principais

### 1. server.js
Entry point da aplicação. Responsável por:
- Criar servidor HTTP nativo
- Carregar variáveis de ambiente do `.env`
- Rotear requisições para handlers corretos
- Servir arquivos estáticos da pasta `public/`
- Configurar CORS headers

### 2. services/config.js
Gerencia configuração dinâmica de serviços:
- Carrega `data/services.json`
- Valida estrutura do arquivo
- Fornece funções de acesso aos serviços
- Cache com invalidação automática baseada em mtime

### 3. services/pipeline.js
Orquestrador central do deploy:
- Encadeia steps: git → build → down → migrate → up → health
- Usa EventEmitter para emitir eventos (consumidos via SSE)
- Persiste resultados em `data/history.json`
- Gerencia rollback para commit anterior

### 4. services/docker.js
Wrapper para comandos Docker:
- Resolve binários no PATH do sistema
- Executa `docker compose` via child_process.spawn
- Streaming de stdout/stderr linha a linha
- Health check com polling

### 5. services/git.js
Wrapper para comandos Git:
- `git pull origin <branch>`
- `git checkout <hash>` (rollback)
- `git rev-parse HEAD` (hash atual)

### 6. routes/deploy.js
Handler de rotas de deploy:
- Inicia pipeline assíncrono
- Gerencia conexões SSE (Server-Sent Events)
- Buffer de eventos para reconexão
- Rollback e migration standalone

### 7. routes/status.js
Consulta status dos containers:
- Usa `docker inspect` para obter status/health
- Retorna todos os serviços configurados

---

## Persistência de Dados

### data/services.json
Configuração dos serviços (criado pelo usuário ou migrado do .env):
```json
{
  "services": [...],
  "migration": { "enabled": true, "service": "prisma-migrate" }
}
```

### data/history.json
Histórico de deploys (gerenciado automaticamente):
```json
[
  {
    "id": "deploy_1709..._web",
    "service": "web",
    "status": "success",
    "startedAt": "2024-03-10T...",
    "duration": 45,
    "commitBefore": "abc1234",
    "commitAfter": "def5678",
    "migrationRan": true
  }
]
```

### data/logs/{deployId}.log
Logs completos de cada deploy (um arquivo por deploy).

---

## Segurança

### Autenticação
- Token único configurado via `DEPLOY_TOKEN`
- Enviado via header `Authorization: Bearer <token>`
- Para SSE: via query param `?token=<token>` (EventSource não suporta headers)

### Proteções
- Path traversal prevenido no serving de arquivos estáticos
- Validação de input em todos os endpoints
- Sem execução de comandos arbitrários (apenas comandos predefinidos)
