# Skill: Debug de Deploy

## Descrição
Use esta skill quando um deploy falhar ou apresentar comportamento inesperado.

## Passos de Diagnóstico

### 1. Verificar Logs do Deploy

```bash
# Listar deploys recentes
ls -lt data/logs/ | head -10

# Ver log do deploy que falhou
cat data/logs/deploy_TIMESTAMP_SERVICE.log
```

### 2. Verificar Histórico

```bash
# Ver últimos deploys
cat data/history.json | jq '.[0:3]'

# Filtrar por status failed
cat data/history.json | jq '[.[] | select(.status == "failed")]'
```

### 3. Testar Comandos Manualmente

```bash
# Navegar para o diretório do projeto
cd $REPO_PATH

# Testar git pull
git pull origin main

# Testar build
docker compose build SERVICE_NAME

# Testar up
docker compose up -d SERVICE_NAME

# Ver logs do container
docker compose logs SERVICE_NAME
```

## Erros Comuns

### "diretório cwd não encontrado"

**Causa**: `REPO_PATH` no `.env` aponta para diretório inexistente.

**Solução**:
```bash
# Verificar se existe
ls -la $REPO_PATH

# Corrigir no .env
REPO_PATH=/caminho/correto
```

### "docker compose build falhou"

**Causa**: Erro no Dockerfile ou no código.

**Diagnóstico**:
```bash
# Ver log completo
cat data/logs/deploy_XXX.log | grep -A 10 "build"

# Rodar build manualmente com mais detalhes
cd $REPO_PATH
docker compose build --no-cache --progress=plain SERVICE_NAME
```

### "docker compose up falhou"

**Causa**: Container não inicia (porta em uso, dependência faltando, etc.)

**Diagnóstico**:
```bash
# Ver logs do container
docker compose logs SERVICE_NAME

# Ver status
docker compose ps

# Verificar porta
netstat -tlnp | grep PORTA
```

### "Health check timeout"

**Causa**: Container subiu mas não está respondendo.

**Diagnóstico**:
```bash
# Ver status do health check
docker inspect SERVICE_NAME --format='{{.State.Health.Status}}'

# Ver logs do health check
docker inspect SERVICE_NAME --format='{{json .State.Health.Log}}' | jq

# Testar manualmente
docker compose exec SERVICE_NAME curl -f http://localhost:PORT/health
```

### "git pull falhou"

**Causa**: Conflitos, permissões, ou branch inexistente.

**Diagnóstico**:
```bash
cd $REPO_PATH

# Ver status
git status

# Ver branch atual
git branch

# Verificar remote
git remote -v

# Tentar pull manual
git pull origin main
```

## Verificar Configuração

```bash
# Testar sintaxe do servidor
node -c server.js

# Verificar services.json
cat data/services.json | jq .

# Verificar variáveis de ambiente
grep -E "^[A-Z]" .env
```

## Verificar Conectividade Docker

```bash
# Testar acesso ao Docker socket
docker ps

# Testar docker compose
docker compose ps

# Verificar versão
docker --version
docker compose version
```

## Logs em Tempo Real

```bash
# Logs do servidor deployer
node server.js 2>&1 | tee -a deployer.log

# Em outro terminal, seguir logs
tail -f deployer.log
```

## Reiniciar do Zero

Se nada funcionar:

```bash
# Parar tudo
docker compose down

# Limpar containers órfãos
docker container prune -f

# Limpar imagens não usadas
docker image prune -f

# Rebuild completo
docker compose build --no-cache

# Subir
docker compose up -d
```
