/**
 * Docker Service
 * Wrapper para comandos docker e docker-compose usando child_process.spawn.
 * Todas as funções retornam Promise e emitem stdout/stderr linha a linha.
 * 
 * @agent DevOps Agent
 */

'use strict';

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');

// Garante que PATH inclua os diretórios comuns de binários do sistema.
const SYSTEM_PATH = [
  '/usr/local/sbin',
  '/usr/local/bin',
  '/usr/sbin',
  '/usr/bin',
  '/sbin',
  '/bin',
  '/usr/lib/wsl/lib',
  '/snap/bin',
  process.env.PATH || '',
].join(':');

/**
 * Resolve o caminho absoluto de um binário procurando nos diretórios do SYSTEM_PATH.
 */
function resolveBin(cmd) {
  if (cmd.startsWith('/')) return cmd;
  const dirs = SYSTEM_PATH.split(':').filter(Boolean);
  for (const dir of dirs) {
    const full = path.join(dir, cmd);
    try { fs.accessSync(full, fs.constants.X_OK); return full; } catch {}
  }
  return cmd;
}

// Lê env dinamicamente (nunca em nível de módulo) para evitar problemas de ordem de carregamento
function getEnv() {
  return {
    repoPath:    process.env.REPO_PATH    || process.cwd(),
    composeFile: process.env.COMPOSE_FILE || '',
  };
}

/**
 * Executa um comando e retorna Promise<{ code, stdout, stderr }>.
 * Chama onLine(line, 'stdout'|'stderr') para cada linha emitida.
 */
function spawnCmd(cmd, args, options = {}, onLine = null) {
  const { repoPath } = getEnv();
  const resolvedCmd  = resolveBin(cmd);
  const cwd          = options.cwd || repoPath;

  // Valida cwd antes de spawnar para dar erro claro
  if (!cwd || !fs.existsSync(cwd)) {
    return Promise.reject(new Error(
      `diretório cwd não encontrado: "${cwd}" — verifique REPO_PATH no .env`
    ));
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(resolvedCmd, args, {
      cwd,
      env: { ...process.env, PATH: SYSTEM_PATH, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => {
      chunk.toString().split('\n').forEach(line => {
        if (line) { stdout += line + '\n'; if (onLine) onLine(line, 'stdout'); }
      });
    });

    proc.stderr.on('data', chunk => {
      chunk.toString().split('\n').forEach(line => {
        if (line) { stderr += line + '\n'; if (onLine) onLine(line, 'stderr'); }
      });
    });

    proc.on('close', code => resolve({ code, stdout, stderr }));
    proc.on('error', err => reject(err));
  });
}

// Monta args base para docker compose.
// Não usa -f: COMPOSE_FILE env var (definida no .env) é lida automaticamente pelo Docker Compose.
function composeArgs(extra = []) {
  return extra;
}

/**
 * Faz `docker compose build <service>`.
 * @param {string} service
 * @param {Function} onLine
 * @param {object} [options]
 * @param {boolean} [options.noCache=false]  — passa --no-cache ao build
 * @param {boolean} [options.noDeps=false]   — passa --no-deps ao build
 */
async function buildService(service, onLine, options = {}) {
  const buildArgs = ['build'];
  if (options.noCache) buildArgs.push('--no-cache');
  if (options.noDeps)  buildArgs.push('--no-deps');
  buildArgs.push(service);
  const result = await spawnCmd('docker', ['compose', ...composeArgs(buildArgs)], {}, onLine);
  if (result.code !== 0) throw new Error(`docker compose build falhou (exit ${result.code})`);
  return result;
}

/**
 * Faz `docker compose down <service>` (sem remover volumes).
 */
async function downService(service, onLine) {
  const result = await spawnCmd('docker', ['compose', ...composeArgs(['stop', service])], {}, onLine);
  if (result.code !== 0) throw new Error(`docker compose stop falhou (exit ${result.code})`);
  await spawnCmd('docker', ['compose', ...composeArgs(['rm', '-f', service])], {}, onLine);
  return result;
}

/**
 * Faz `docker compose up -d <service>`.
 * @param {string} service
 * @param {Function} onLine
 * @param {object} [options]
 * @param {boolean} [options.noDeps=false]  — passa --no-deps ao up
 */
async function upService(service, onLine, options = {}) {
  const upArgs = ['up', '-d', '--no-build'];
  if (options.noDeps) upArgs.push('--no-deps');
  upArgs.push(service);
  const result = await spawnCmd('docker', ['compose', ...composeArgs(upArgs)], {}, onLine);
  if (result.code !== 0) throw new Error(`docker compose up falhou (exit ${result.code})`);
  return result;
}

/**
 * Resolve o container ID/name real pelo nome do serviço compose.
 */
async function getContainerName(composeService) {
  const result = await spawnCmd('docker', ['compose', ...composeArgs(['ps', '-q', composeService])]);
  const id = result.stdout.trim();
  return id || composeService;
}

/**
 * Retorna status do container: { status, health, startedAt }.
 * Usa template seguro para containers sem HEALTHCHECK configurado.
 */
async function getContainerStatus(containerName) {
  // Primeiro: tenta resolver o container ID via docker compose ps -q
  const idResult = await spawnCmd('docker', ['compose', ...composeArgs(['ps', '-q', containerName])]);
  const containerId = idResult.stdout.trim();

  // Usa container ID se disponível, caso contrário usa o nome direto
  const target = containerId || containerName;

  // Template com fallback para containers sem healthcheck
  const fmt = '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.State.StartedAt}}';
  const result = await spawnCmd('docker', ['inspect', '--format', fmt, target]);

  if (result.code !== 0 || !result.stdout.trim()) {
    return { status: 'stopped', health: 'none', startedAt: null };
  }

  const parts     = result.stdout.trim().split('|');
  const status    = parts[0] || 'unknown';
  const health    = parts[1] || 'none';
  const startedAt = parts[2] || null;

  return { status, health, startedAt };
}

/**
 * Health check com polling a cada 2s, timeout 30s.
 * Resolve com 'healthy', 'unhealthy' ou 'timeout'.
 * Para containers sem HEALTHCHECK, resolve imediatamente com 'no-healthcheck'.
 */
async function waitForHealthy(containerName, onLine, timeoutMs = 30000) {
  const start    = Date.now();
  const interval = 2000;

  return new Promise((resolve) => {
    async function check() {
      const { health, status } = await getContainerStatus(containerName);

      if (onLine) onLine(`Health: ${health} | Status: ${status}`, 'stdout');

      // Container sem healthcheck configurado — considera OK se está rodando
      if (health === 'none' || health === 'no-healthcheck') {
        if (status === 'running') {
          resolve('no-healthcheck');
        } else {
          resolve('unhealthy');
        }
        return;
      }

      if (health === 'healthy') {
        resolve('healthy');
        return;
      }
      if (health === 'unhealthy') {
        resolve('unhealthy');
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve('timeout');
        return;
      }
      setTimeout(check, interval);
    }
    check();
  });
}


/**
 * Lê o upstream ativo do arquivo active-upstream.conf.
 * Retorna 'webapp' ou 'webapp-green'.
 */
function getActiveWebapp() {
  const { repoPath } = getEnv();
  const upstreamFile = path.join(repoPath, 'packages/infra/docker/nginx/active-upstream.conf');
  try {
    const content = fs.readFileSync(upstreamFile, 'utf8');
    return content.includes('webapp-green') ? 'webapp-green' : 'webapp';
  } catch {
    return 'webapp';
  }
}

/**
 * Retorna o webapp inativo (oposto do ativo).
 */
function getInactiveWebapp() {
  return getActiveWebapp() === 'webapp' ? 'webapp-green' : 'webapp';
}

/**
 * Altera o arquivo active-upstream.conf para apontar ao serviço informado.
 * @param {string} targetService — 'webapp' ou 'webapp-green'
 * @param {Function} [onLine]
 */
function switchUpstream(targetService, onLine) {
  const { repoPath } = getEnv();
  const upstreamFile = path.join(repoPath, 'packages/infra/docker/nginx/active-upstream.conf');
  const content = `set $active_webapp http://${targetService}:3000;\n`;
  fs.writeFileSync(upstreamFile, content, 'utf8');
  if (onLine) onLine(`Upstream switched to ${targetService}`, 'stdout');
}

/**
 * Recarrega configuração do nginx sem downtime.
 */
async function reloadNginx(onLine) {
  const result = await spawnCmd(
    'docker', ['exec', 'zelo-prd-nginx', 'nginx', '-s', 'reload'],
    {}, onLine
  );
  if (result.code !== 0) {
    throw new Error(`nginx reload falhou (exit ${result.code})`);
  }
  return result;
}

module.exports = {
  spawnCmd,
  buildService,
  downService,
  upService,
  getContainerName,
  getContainerStatus,
  waitForHealthy,
  getActiveWebapp,
  getInactiveWebapp,
  switchUpstream,
  reloadNginx,
};
