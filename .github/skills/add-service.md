# Skill: Adicionar Novo Serviço Docker

## Descrição
Use esta skill quando precisar adicionar um novo serviço ao sistema de deploy.

## Contexto Necessário
- Nome do serviço (ex: `worker`, `mailer`, `websocket`)
- Nome no docker-compose (ex: `background-worker`)
- Se é deployável ou não (ex: databases não são deployáveis)

## Passos

### 1. Adicionar ao services.json

Edite `data/services.json` e adicione o novo serviço:

```json
{
  "services": [
    // ... serviços existentes ...
    {
      "key": "NOME_CURTO",
      "label": "Nome Amigável",
      "subtitle": "Descrição curta",
      "composeName": "nome-no-docker-compose",
      "deployable": true
    }
  ]
}
```

### 2. Verificar

```bash
# Reiniciar servidor
node server.js

# Verificar se aparece
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/services
```

### 3. Testar Deploy

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/deploy/NOME_CURTO
```

## Exemplo Completo

Para adicionar um serviço de envio de emails:

```json
{
  "key": "mailer",
  "label": "Email Service",
  "subtitle": "SMTP Worker",
  "composeName": "email-worker",
  "deployable": true
}
```

## Notas
- `key` deve ser único e usar apenas letras minúsculas, números e hífen
- `composeName` deve corresponder exatamente ao nome no docker-compose.yml
- Serviços com `deployable: false` não mostram botões de deploy no painel
