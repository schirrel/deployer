# Skill: Adicionar Comando Docker

## Descrição
Use esta skill quando precisar adicionar um novo comando Docker ao sistema.

## Contexto Necessário
- Qual comando docker/docker-compose executar
- Quais argumentos são necessários
- Se precisa streaming de output

## Passos

### 1. Adicionar função em services/docker.js

```javascript
/**
 * Descrição do que o comando faz.
 * @param {string} service - Nome do serviço
 * @param {function} onLine - Callback para cada linha de output
 * @returns {Promise<{code, stdout, stderr}>}
 */
async function meuComando(service, onLine) {
  const result = await spawnCmd('docker', [
    'compose',
    ...composeArgs(['COMANDO', service])
  ], {}, onLine);
  
  if (result.code !== 0) {
    throw new Error(`docker compose COMANDO falhou (exit ${result.code})`);
  }
  
  return result;
}

// Exportar no final do arquivo
module.exports = {
  // ... existentes ...
  meuComando,
};
```

### 2. Usar no Pipeline (se necessário)

```javascript
// Em services/pipeline.js

// Importar a função
const docker = require('./docker');

// Usar no pipeline
step(deployId, 'meu-comando', 'running');
log(deployId, '▶ docker compose meu-comando');
await docker.meuComando(svc, (line, stream) => log(deployId, line, stream));
step(deployId, 'meu-comando', 'done');
```

## Exemplos de Comandos

### Logs do Container

```javascript
async function getLogs(service, lines = 100, onLine) {
  return await spawnCmd('docker', [
    'compose',
    ...composeArgs(['logs', '--tail', String(lines), service])
  ], {}, onLine);
}
```

### Restart do Container

```javascript
async function restartService(service, onLine) {
  const result = await spawnCmd('docker', [
    'compose',
    ...composeArgs(['restart', service])
  ], {}, onLine);
  
  if (result.code !== 0) {
    throw new Error(`docker compose restart falhou (exit ${result.code})`);
  }
  
  return result;
}
```

### Exec no Container

```javascript
async function execInContainer(service, command, onLine) {
  const result = await spawnCmd('docker', [
    'compose',
    ...composeArgs(['exec', '-T', service, ...command.split(' ')])
  ], {}, onLine);
  
  return result;
}
```

### Scale

```javascript
async function scaleService(service, replicas, onLine) {
  const result = await spawnCmd('docker', [
    'compose',
    ...composeArgs(['up', '-d', '--scale', `${service}=${replicas}`, service])
  ], {}, onLine);
  
  if (result.code !== 0) {
    throw new Error(`docker compose scale falhou (exit ${result.code})`);
  }
  
  return result;
}
```

## Notas Importantes

1. **Sempre usar `spawnCmd`** — não usar `exec` ou `execSync`
2. **Sempre verificar exit code** — `result.code !== 0` significa erro
3. **Passar `onLine` callback** — para streaming de logs em tempo real
4. **Usar `composeArgs`** — mantém consistência com outras funções
