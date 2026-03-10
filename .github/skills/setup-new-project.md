# Skill: Configurar Novo Projeto

## Descrição
Use esta skill para configurar o Deploy Platform em um novo projeto.

## Pré-requisitos

- Projeto com `docker-compose.yml` funcionando
- Servidor/VPS com Docker instalado
- Node.js 18+ instalado

## Passos

### 1. Copiar o Deployer

```bash
# Na sua VPS
cd /home/user/
cp -r /caminho/do/deployer ./deployer

# Ou clone do repositório
git clone <repo-url> deployer
```

### 2. Configurar Variáveis de Ambiente

```bash
cd deployer
cp .env.example .env
nano .env
```

Preencher:
```env
DEPLOY_TOKEN=GERE_UM_TOKEN_SEGURO_AQUI
REPO_PATH=/caminho/absoluto/do/seu/projeto
COMPOSE_FILE=/caminho/absoluto/do/seu/projeto/docker-compose.yml
GIT_BRANCH=main
PORT=4000
```

### 3. Configurar Serviços

```bash
cp data/services.example.json data/services.json
nano data/services.json
```

Definir seus serviços:
```json
{
  "services": [
    {
      "key": "web",
      "label": "Seu App Web",
      "subtitle": "Frontend",
      "composeName": "NOME_NO_DOCKER_COMPOSE",
      "deployable": true
    },
    {
      "key": "api",
      "label": "Sua API",
      "subtitle": "Backend",
      "composeName": "NOME_NO_DOCKER_COMPOSE",
      "deployable": true
    },
    {
      "key": "db",
      "label": "Database",
      "subtitle": "PostgreSQL",
      "composeName": "NOME_NO_DOCKER_COMPOSE",
      "deployable": false
    }
  ],
  "migration": {
    "enabled": false
  }
}
```

### 4. Verificar docker-compose.yml

Certifique-se que os nomes em `composeName` correspondem aos serviços:

```yaml
# docker-compose.yml do seu projeto
services:
  NOME_NO_DOCKER_COMPOSE:   # ← Este nome
    build: ./frontend
    ports:
      - "3000:3000"
```

### 5. Testar Localmente

```bash
# Iniciar servidor
node server.js

# Verificar
curl -H "Authorization: Bearer SEU_TOKEN" http://localhost:4000/api/services
curl -H "Authorization: Bearer SEU_TOKEN" http://localhost:4000/api/status
```

### 6. Configurar para Produção (Docker)

```bash
# Build da imagem
docker build -t deployer .

# Criar diretório de dados persistente
mkdir -p /home/user/deployer-data

# Copiar configuração
cp data/services.json /home/user/deployer-data/

# Rodar
docker run -d \
  --name deployer \
  --restart unless-stopped \
  -p 4000:4000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /caminho/do/seu/projeto:/repo:ro \
  -v /home/user/deployer-data:/app/data \
  --env-file .env \
  deployer
```

### 7. Configurar Nginx (Opcional)

```nginx
server {
    listen 80;
    server_name deploy.seudominio.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Para SSE
        proxy_set_header X-Accel-Buffering no;
        proxy_buffering off;
    }
}
```

## Checklist Final

- [ ] `.env` configurado com token seguro
- [ ] `services.json` com todos os serviços do projeto
- [ ] Nomes de serviços correspondem ao docker-compose.yml
- [ ] Testar deploy de um serviço pelo painel
- [ ] Verificar se SSE funciona (logs em tempo real)
- [ ] Configurar HTTPS (em produção)

## Dicas de Segurança

1. **Token forte**: Use `openssl rand -hex 32` para gerar
2. **HTTPS**: Configure SSL/TLS via Nginx ou Traefik
3. **Firewall**: Restrinja acesso à porta 4000 se usar proxy
4. **Backup**: Mantenha backup do `data/` regularmente
