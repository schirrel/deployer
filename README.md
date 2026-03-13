# Deployer Platform

Plataforma web de deploy automatizado para projetos Docker.  
**Stack:** Node.js puro (sem frameworks) + HTML/CSS/JS puro + SSE.  
**Zero dependências externas** — apenas módulos nativos do Node.js.  
**Configuração dinâmica** — serviços definidos via `services.json`, reutilizável para diferentes projetos.

<img width="1828" height="799" alt="Captura de tela 2026-03-09 234615" src="https://github.com/user-attachments/assets/694160b0-25e7-4501-9ace-0fb317d9ccaa" />


---

## Início Rápido

```bash
# 1. Clone ou copie deploy-platform/ para sua VPS
cd deployer

# 2. Configure o ambiente
cp .env.example .env
nano .env  # preencha DEPLOY_TOKEN, REPO_PATH, COMPOSE_FILE

# 3. Configure seus serviços
cp data/services.example.json data/services.json
nano data/services.json  # defina os serviços do seu projeto

# 4. Rode o servidor
node server.js
# → http://localhost:4000
```

---

## Configuração de Serviços

Os serviços são definidos no arquivo `data/services.json`. Isso permite usar a mesma plataforma para diferentes projetos.

### Estrutura do `services.json`

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
      "key": "api",
      "label": "API Server",
      "subtitle": "Backend API",
      "composeName": "api",
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

### Campos de cada serviço

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `key` | string | ✓ | Identificador único (usado nas URLs da API) |
| `label` | string | | Nome amigável exibido no painel |
| `subtitle` | string | | Descrição curta |
| `composeName` | string | ✓ | Nome do serviço no `docker-compose.yml` |
| `deployable` | boolean | | Se `false`, não mostra botões deploy/rollback (ex: database) |

### Configuração de Migration

| Campo | Descrição |
|-------|-----------|
| `enabled` | Se `true`, mostra botão "Run Migration" e executa migrations no deploy |
| `service` | Nome do serviço de migration no docker-compose (ex: `prisma-migrate`) |

### Retrocompatibilidade

Se `services.json` não existir, a plataforma criará automaticamente a partir das variáveis `SERVICE_*` do `.env` (legado).

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `DEPLOY_TOKEN` | ✓ | Token secreto para autenticação do painel |
| `REPO_PATH` | ✓ | Caminho absoluto do projeto na VPS |
| `COMPOSE_FILE` | ✓ | Caminho absoluto do `docker-compose.yml` |
| `GIT_BRANCH` | | Branch do git pull (padrão: `main`) |
| `PORT` | | Porta do servidor (padrão: `4000`) |

---

## Deploy via Docker (recomendado)

```bash
# Build da imagem
docker build -t deploy-platform .

# Rodar com acesso ao socket Docker e ao projeto
docker run -d \
  --name deploy-platform \
  --restart unless-stopped \
  -p 4000:4000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /caminho/do/projeto:/repo:ro \
  -v ${PWD}/data:/app/data \
  --env-file .env \
  deploy-platform
```

Add to docker-compose
```
# ── Deployer ──────────────────────────────────────────────────────────────
  deployer:
    build:
      context: ./deployer # (if in same folder or ../../to-deployer-path)
      dockerfile: Dockerfile
    container_name: deployer
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      PORT: 4000
      DEPLOY_TOKEN: ${DEPLOY_TOKEN}
      REPO_PATH: ${REPO_PATH:-/root/repo-path}
      COMPOSE_FILE: ${COMPOSE_FILE:-/root/repo-path/docker-compose.yml}
      GIT_BRANCH: ${GIT_BRANCH:-main}
      PRISMA_SCHEMA_PATH: ${PRISMA_SCHEMA_PATH:-/root/repo-path/schema.prisma}
      PRISMA_SERVICE: prisma-migrate
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${REPO_PATH:-/root/repo-path}:${REPO_PATH:-/root/repo-path}
      - deployer_data:/app/data
      - /root/.ssh:/root/.ssh:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:4000/"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "7"
    networks:
      - network-name

```

---



## Arquitetura

```
                    Browser
                       │
              ┌────────▼────────┐
              │   server.js     │  HTTP nativo, roteamento manual
              │   (porta 4000)  │
              └──┬──────────┬───┘
                 │          │
        ┌────────▼───┐  ┌───▼────────┐
        │  routes/   │  │  public/   │
        │ deploy.js  │  │ index.html │
        │ status.js  │  │ app.js     │
        │ history.js │  │ terminal.js│
        └────────┬───┘  └────────────┘
                 │
        ┌────────▼────────┐
        │   services/     │
        │  pipeline.js    │  Orquestrador + EventEmitter (SSE)
        │  docker.js      │  spawn docker/compose
        │  git.js         │  spawn git
        │  prisma.js      │  detecção de migration
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │  Docker Socket  │  /var/run/docker.sock
        └─────────────────┘
```

---

## Pipeline de Deploy

```
① git pull → ② detectar migration → ③ build → ④ down → ⑤ migrate? → ⑥ up → ⑦ health check
```

- Health check: polling a cada 2s, timeout 30s
- Se migration detectada: aviso visual + `npx prisma migrate deploy` antes do `up`
- Rollback: `git checkout <hash_anterior>` + build + down + up

---

## API Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/services` | Configuração de serviços (do `services.json`) |
| `GET` | `/api/status` | Status de todos os containers |
| `GET` | `/api/status/:service` | Status de um container |
| `GET` | `/api/history` | Histórico de deploys |
| `POST` | `/api/deploy/:service` | Inicia deploy (retorna `deployId`) |
| `GET` | `/api/deploy/stream/:id` | SSE stream de logs |
| `POST` | `/api/rollback/:service` | Inicia rollback |
| `POST` | `/api/migrate` | Executa migration standalone |

**Autenticação:** `Authorization: Bearer SEU_TOKEN`  
**SSE:** `?token=SEU_TOKEN` (EventSource não suporta headers)

---

## Testes Manuais

```bash
# Sem servidor:
DEPLOY_TOKEN=mytoken node tests/test-auth.js
node tests/test-history.js

# Com servidor rodando:
DEPLOY_TOKEN=test node server.js &
DEPLOY_TOKEN=test node tests/test-sse.js
```

---

## Manutenção por Agentes IA

Ver [`AGENTS.md`](./AGENTS.md) e os prompts em [`agents/`](./agents/) para
o fluxo completo de desenvolvimento e manutenção 100% IA-driven.

---

## Estrutura de Arquivos

```
deploy-platform/
├── server.js              # Entry point (HTTP nativo)
├── Dockerfile             # Container com Docker CLI + git
├── .env.example           # Template de variáveis
├── AGENTS.md              # Estrutura de agentes IA
├── routes/
│   ├── auth.js            # Middleware Bearer token
│   ├── deploy.js          # Deploy, SSE stream, rollback
│   ├── status.js          # Status dos containers
│   └── history.js         # Histórico JSON
├── services/
│   ├── config.js          # Carregador de services.json (dinâmico)
│   ├── docker.js          # Wrapper docker/compose (spawn)
│   ├── git.js             # Wrapper git (spawn)
│   ├── prisma.js          # Detecção e execução de migrations
│   └── pipeline.js        # Orquestrador + EventEmitter
├── public/
│   ├── index.html         # Painel principal
│   ├── css/style.css      # Dark theme (CSS custom properties)
│   └── js/
│       ├── api.js         # Fetch wrapper + auth
│       ├── terminal.js    # Terminal SSE (EventSource)
│       └── app.js         # Lógica do painel (carrega serviços via API)
├── data/
│   ├── services.json      # Configuração de serviços (você cria)
│   ├── services.example.json  # Exemplo de configuração
│   └── history.json       # Persistência de deploys
├── tests/
│   ├── test-auth.js       # Testes de autenticação
│   ├── test-history.js    # Testes de histórico
│   └── test-sse.js        # Testes de SSE
└── agents/
    ├── architect.prompt.md
    ├── pm.prompt.md
    ├── devops.prompt.md
    ├── backend.prompt.md
    ├── frontend.prompt.md
    ├── qa.prompt.md
    └── docs.prompt.md
```
