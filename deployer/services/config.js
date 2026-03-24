/**
 * Config Service
 * Carrega configuração dinâmica de serviços a partir de services.json.
 * Permite que a plataforma seja genérica e reutilizável para diferentes projetos.
 * 
 * @agent Backend Agent
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_FILE   = path.join(__dirname, '..', 'data', 'services.json');
const EXAMPLE_FILE  = path.join(__dirname, '..', 'data', 'services.example.json');

// Cache da configuração
let configCache = null;
let configMtime = null;

/**
 * Estrutura padrão da configuração
 */
const DEFAULT_CONFIG = {
  services: [],
  migration: {
    enabled: false,
    service: 'prisma-migrate'
  }
};

/**
 * Exemplo de configuração para novos projetos
 */
const EXAMPLE_CONFIG = {
  services: [
    {
      key: 'web',
      label: 'Web App',
      subtitle: 'Main web application',
      composeName: 'webapp',
      deployable: true
    },
    {
      key: 'api',
      label: 'API Server',
      subtitle: 'Backend API service',
      composeName: 'api',
      deployable: true
    },
    {
      key: 'worker',
      label: 'Background Worker',
      subtitle: 'Async job processor',
      composeName: 'worker',
      deployable: true
    },
    {
      key: 'db',
      label: 'Database',
      subtitle: 'PostgreSQL',
      composeName: 'postgres',
      deployable: false
    }
  ],
  migration: {
    enabled: true,
    service: 'prisma-migrate'
  }
};

/**
 * Valida a estrutura de um serviço
 */
function validateService(svc, index) {
  const errors = [];
  
  if (!svc.key || typeof svc.key !== 'string') {
    errors.push(`services[${index}].key é obrigatório e deve ser string`);
  }
  if (!svc.composeName || typeof svc.composeName !== 'string') {
    errors.push(`services[${index}].composeName é obrigatório e deve ser string`);
  }
  if (svc.label && typeof svc.label !== 'string') {
    errors.push(`services[${index}].label deve ser string`);
  }
  if (svc.deployable !== undefined && typeof svc.deployable !== 'boolean') {
    errors.push(`services[${index}].deployable deve ser boolean`);
  }

  return errors;
}

/**
 * Valida a configuração completa
 */
function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return ['Configuração inválida: deve ser um objeto JSON'];
  }

  if (!Array.isArray(config.services)) {
    errors.push('services deve ser um array');
  } else {
    // Valida cada serviço
    config.services.forEach((svc, i) => {
      errors.push(...validateService(svc, i));
    });

    // Verifica keys duplicadas
    const keys = config.services.map(s => s.key);
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (duplicates.length > 0) {
      errors.push(`Keys duplicadas: ${[...new Set(duplicates)].join(', ')}`);
    }
  }

  return errors;
}

/**
 * Carrega a configuração do arquivo ou gera do .env
 * Usa cache para evitar leituras desnecessárias
 */
function loadConfig() {
  // Verifica se arquivo existe e se mudou
  let currentMtime = null;
  try {
    const stat = fs.statSync(CONFIG_FILE);
    currentMtime = stat.mtimeMs;
  } catch {
    // Arquivo não existe
  }

  // Retorna cache se válido
  if (configCache && configMtime === currentMtime) {
    return configCache;
  }

  let config;

  if (currentMtime !== null) {
    // Lê do arquivo
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      config = JSON.parse(raw);
      
      const errors = validateConfig(config);
      if (errors.length > 0) {
        console.error('[Config] Erros de validação em services.json:');
        errors.forEach(e => console.error(`  - ${e}`));
      }
    } catch (err) {
      console.error(`[Config] Erro ao ler services.json: ${err.message}`);
    }
  }

  // Aplica defaults
  config = { ...DEFAULT_CONFIG, ...config };
  
  // Atualiza cache
  configCache = config;
  configMtime = currentMtime;

  return config;
}

/**
 * Garante que o diretório data/ existe
 */
function ensureDataDir() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Cria arquivo de exemplo se não existir
 */
function ensureExampleFile() {
  if (!fs.existsSync(EXAMPLE_FILE)) {
    try {
      ensureDataDir();
      fs.writeFileSync(EXAMPLE_FILE, JSON.stringify(EXAMPLE_CONFIG, null, 2), 'utf8');
    } catch {}
  }
}

// Garante que o arquivo de exemplo exista na inicialização
ensureExampleFile();

// ── API Pública ────────────────────────────────────────────────────────────

/**
 * Retorna a lista de todos os serviços configurados
 */
function getServices() {
  const config = loadConfig();
  return config.services.map(svc => ({
    key: svc.key,
    label: svc.label || svc.key,
    subtitle: svc.subtitle || '',
    composeName: svc.composeName,
    deployable: svc.deployable !== false
  }));
}

/**
 * Retorna mapa de key → composeName para serviços deployáveis
 * Inclui 'all' como chave especial
 */
function getServiceMap() {
  const config = loadConfig();
  const map = {};
  
  for (const svc of config.services) {
    if (svc.deployable !== false) {
      map[svc.key] = svc.composeName;
    }
  }
  
  map.all = null; // especial: deploy de todos
  return map;
}

/**
 * Retorna mapa completo de key → composeName (inclui não-deployáveis)
 */
function getAllServicesMap() {
  const config = loadConfig();
  const map = {};
  
  for (const svc of config.services) {
    map[svc.key] = svc.composeName;
  }
  
  return map;
}

/**
 * Verifica se um serviço é deployável
 */
function isDeployable(key) {
  const config = loadConfig();
  const svc = config.services.find(s => s.key === key);
  return svc ? svc.deployable !== false : false;
}

/**
 * Retorna o composeName de um serviço pela key
 */
function getComposeName(key) {
  const config = loadConfig();
  const svc = config.services.find(s => s.key === key);
  return svc ? svc.composeName : null;
}

/**
 * Retorna configuração de migration
 */
function getMigrationConfig() {
  const config = loadConfig();
  return config.migration || { enabled: false };
}

/**
 * Verifica se migrations estão habilitadas
 */
function isMigrationEnabled() {
  const config = loadConfig();
  return config.migration?.enabled === true;
}

/**
 * Invalida o cache (útil para testes ou reload manual)
 */
function invalidateCache() {
  configCache = null;
  configMtime = null;
}

/**
 * Retorna a configuração completa (para API /api/services)
 */
function getFullConfig() {
  const config = loadConfig();
  return {
    services: getServices(),
    migration: config.migration || { enabled: false }
  };
}

function getConfig() {
  return loadConfig();
} 

module.exports = {
  getServices,
  getServiceMap,
  getAllServicesMap,
  isDeployable,
  getComposeName,
  getMigrationConfig,
  isMigrationEnabled,
  invalidateCache,
  getFullConfig,
  // Constantes para uso externo
  CONFIG_FILE,
  EXAMPLE_FILE,
  getConfig
};
