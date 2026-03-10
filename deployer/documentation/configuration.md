# Configuração do Deploy Platform

## Visão Geral

A configuração do Deploy Platform é feita em duas partes:
1. **Variáveis de ambiente** (`.env`) — configurações do servidor
2. **Arquivo de serviços** (`data/services.json`) — definição dos serviços Docker

---

## Variáveis de Ambiente (.env)

### Variáveis Obrigatórias

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DEPLOY_TOKEN` | Token secreto para autenticação | `meu_token_super_secreto` |
| `REPO_PATH` | Caminho absoluto do projeto na VPS | `/home/user/meu-projeto` |
| `COMPOSE_FILE` | Caminho do docker-compose.yml | `/home/user/meu-projeto/docker-compose.yml` |

### Variáveis Opcionais

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta do servidor HTTP | `4000` |
| `GIT_BRANCH` | Branch para git pull | `main` |

### Exemplo completo

```env
# Autenticação
DEPLOY_TOKEN=minha_senha_secreta_123

# Caminhos do projeto
REPO_PATH=/home/deploy/meu-saas
COMPOSE_FILE=/home/deploy/meu-saas/docker-compose.yml

# Servidor
PORT=4000
GIT_BRANCH=main
```

---

## Configuração de Serviços (services.json)

### Localização
```
deployer/
└── data/
    ├── services.json         # Sua configuração (criar)
    └── services.example.json # Exemplo de referência
```

### Estrutura Completa

```json
{
  "services": [
    {
      "key": "web",
      "label": "Web App",
      "subtitle": "Frontend Next.js",
      "composeName": "webapp",
      "deployable": true
    },
    {
      "key": "api",
      "label": "API Server",
      "subtitle": "Backend Node.js",
      "composeName": "api-server",
      "deployable": true
    },
    {
      "key": "worker",
      "label": "Background Worker",
      "subtitle": "Job processor",
      "composeName": "worker",
      "deployable": true
    },
    {
      "key": "db",
      "label": "PostgreSQL",
      "subtitle": "Database",
      "composeName": "postgres",
      "deployable": false
    },
    {
      "key": "redis",
      "label": "Redis",
      "subtitle": "Cache",
      "composeName": "redis",
      "deployable": false
    }
  ],
  "migration": {
    "enabled": true,
    "service": "prisma-migrate"
  }
}
```

### Campos de Serviço

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `key` | string | ✓ | Identificador único (usado na URL da API) |
| `label` | string | | Nome amigável exibido no painel |
| `subtitle` | string | | Descrição curta abaixo do nome |
| `composeName` | string | ✓ | Nome do serviço no `docker-compose.yml` |
| `deployable` | boolean | | Se `false`, não mostra botões de deploy |

### Configuração de Migration

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `enabled` | boolean | Se `true`, habilita botão "Run Migration" e executa migrations no deploy |
| `service` | string | Nome do serviço de migration no docker-compose |

---

## Exemplos por Tipo de Projeto

### Projeto Next.js com API

```json
{
  "services": [
    {
      "key": "web",
      "label": "Frontend",
      "subtitle": "Next.js App",
      "composeName": "nextjs",
      "deployable": true
    },
    {
      "key": "db",
      "label": "Database",
      "subtitle": "PostgreSQL 15",
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

### Microserviços

```json
{
  "services": [
    {
      "key": "gateway",
      "label": "API Gateway",
      "subtitle": "Kong/Nginx",
      "composeName": "gateway",
      "deployable": true
    },
    {
      "key": "users",
      "label": "Users Service",
      "subtitle": "Autenticação",
      "composeName": "users-api",
      "deployable": true
    },
    {
      "key": "orders",
      "label": "Orders Service",
      "subtitle": "Pedidos",
      "composeName": "orders-api",
      "deployable": true
    },
    {
      "key": "payments",
      "label": "Payments Service",
      "subtitle": "Pagamentos",
      "composeName": "payments-api",
      "deployable": true
    },
    {
      "key": "db",
      "label": "PostgreSQL",
      "composeName": "postgres",
      "deployable": false
    },
    {
      "key": "redis",
      "label": "Redis",
      "composeName": "redis",
      "deployable": false
    },
    {
      "key": "rabbitmq",
      "label": "RabbitMQ",
      "composeName": "rabbitmq",
      "deployable": false
    }
  ],
  "migration": {
    "enabled": false
  }
}
```

### WordPress / PHP

```json
{
  "services": [
    {
      "key": "wordpress",
      "label": "WordPress",
      "subtitle": "PHP 8.2",
      "composeName": "wordpress",
      "deployable": true
    },
    {
      "key": "nginx",
      "label": "Nginx",
      "subtitle": "Reverse Proxy",
      "composeName": "nginx",
      "deployable": true
    },
    {
      "key": "mysql",
      "label": "MySQL",
      "subtitle": "Database",
      "composeName": "mysql",
      "deployable": false
    }
  ],
  "migration": {
    "enabled": false
  }
}
```

---

## Configuração Docker

### docker-compose.yml Esperado

O Deploy Platform espera que seu `docker-compose.yml` siga algumas convenções:

```yaml
version: '3.8'

services:
  # Serviço principal (deployable: true)
  webapp:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # API backend (deployable: true)
  api:
    build: ./backend
    ports:
      - "4000:4000"
    depends_on:
      - postgres
      - redis

  # Database (deployable: false)
  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: myapp
      POSTGRES_PASSWORD: secret

  # Serviço de migration (usado pelo pipeline)
  prisma-migrate:
    build: ./backend
    command: npx prisma migrate deploy
    depends_on:
      - postgres

volumes:
  postgres_data:
```

### Health Checks

O Deploy Platform verifica a saúde dos containers após o deploy:

- **Com HEALTHCHECK**: Aguarda status `healthy` (polling 2s, timeout 30s)
- **Sem HEALTHCHECK**: Considera OK se status é `running`

Recomendamos sempre configurar HEALTHCHECK nos serviços deployáveis.

---

## Deploy via Docker

### Dockerfile do Deployer

O Deploy Platform já inclui um Dockerfile otimizado:

```dockerfile
FROM node:20-alpine

# Instala Docker CLI e Git
RUN apk add --no-cache docker-cli git

WORKDIR /app
COPY . .

EXPOSE 4000
CMD ["node", "server.js"]
```

### Comando de Deploy

```bash
# Build
docker build -t deploy-platform .

# Run
docker run -d \
  --name deploy-platform \
  --restart unless-stopped \
  -p 4000:4000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /home/user/meu-projeto:/repo:ro \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  deploy-platform
```

### Volumes Importantes

| Volume | Descrição |
|--------|-----------|
| `/var/run/docker.sock` | Acesso ao Docker daemon |
| `/repo` (ro) | Projeto a ser deployado (read-only) |
| `/app/data` | Persistência de histórico e config |

---

## Retrocompatibilidade

Se `services.json` não existir, o sistema tentará criar automaticamente a partir de variáveis legadas:

```env
# Variáveis legadas (funciona, mas não recomendado)
SERVICE_WEB=webapp
SERVICE_API=api
SERVICE_CRON=cron
SERVICE_DB=postgres
PRISMA_SERVICE=prisma-migrate
```

Ao iniciar, essas variáveis serão convertidas para `services.json`.

---

## Validação de Configuração

### Erros Comuns

1. **"Key duplicada"**
   - Duas entradas com mesmo `key` em services.json
   
2. **"composeName é obrigatório"**
   - Serviço sem o campo `composeName`

3. **"diretório cwd não encontrado"**
   - `REPO_PATH` aponta para diretório inexistente

4. **"docker compose build falhou"**
   - Erro no Dockerfile ou compose file

### Verificar Configuração

```bash
# Testar se o servidor inicia corretamente
node server.js

# Output esperado:
# [Deploy Platform] Servidor rodando em http://localhost:4000
# [Deploy Platform] Token: ✓ configurado
# [Deploy Platform] Repo:  /home/user/meu-projeto
```

Se `services.json` tiver erros, você verá:
```
[Config] Erros de validação em services.json:
  - services[0].composeName é obrigatório
[Config] Usando configuração padrão do .env
```
