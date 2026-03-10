# Deployer Platform — Dockerfile
# Roda como container na VPS com acesso ao socket Docker.
# @agent DevOps Agent

FROM node:20-alpine

# Instala Docker CLI (para executar comandos docker dentro do container)
RUN apk add --no-cache docker-cli docker-cli-compose git openssh-client

WORKDIR /app

# Copia apenas os arquivos necessários (sem node_modules — zero dependências!)
COPY server.js      ./
COPY routes/        ./routes/
COPY services/      ./services/
COPY public/        ./public/
COPY data/          ./data/

# Cria diretório de dados com permissão de escrita
RUN mkdir -p /app/data && chmod 777 /app/data

EXPOSE 4000

# Healthcheck do próprio servidor
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:4000/ || exit 1

CMD ["node", "server.js"]
