/**
 * Pipeline Service
 * Orquestrador central do deploy. Encadeia git → build → down → up → health.
 * Usa EventEmitter para emitir eventos de log para SSE.
 * Persiste resultados em data/history.json.
 * 
 * @agent Backend Agent / DevOps Agent
 */

'use strict';

const EventEmitter = require('events');
const fs           = require('fs');
const path         = require('path');

const git    = require('./git');
const docker = require('./docker');
const prisma = require('./prisma');
const config = require('./config');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'history.json');
const LOGS_DIR     = path.join(__dirname, '..', 'data', 'logs');

// Mapa global de emitters por deployId
const emitters = new Map();

// Registra listener de evento para um deployId
function on(deployId, callback) {
  if (!emitters.has(deployId)) emitters.set(deployId, new EventEmitter());
  emitters.get(deployId).on('event', callback);
}

// Emite evento interno do pipeline
function emit(deployId, event) {
  const em = emitters.get(deployId);
  if (em) em.emit('event', event);
}

// Helper: emite log de linha
function log(deployId, line, stream = 'stdout') {
  appendLog(deployId, line);
  emit(deployId, { type: 'log', line, stream, ts: Date.now() });
}

// Helper: emite mudança de step
function step(deployId, stepName, status = 'running') {
  emit(deployId, { type: 'step', step: stepName, status, ts: Date.now() });
}

// ── Log file helpers ───────────────────────────────────────────────────────

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function appendLog(deployId, line) {
  try {
    ensureLogsDir();
    fs.appendFileSync(path.join(LOGS_DIR, `${deployId}.log`), line + '\n', 'utf8');
  } catch {}
}

// ── Histórico ──────────────────────────────────────────────────────────────

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch { return []; }
}

function writeHistory(records) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function saveRecord(record) {
  const history = readHistory();
  history.unshift(record); // mais recente primeiro
  if (history.length > 100) history.splice(100); // mantém até 100
  writeHistory(history);
}

// ── Pipeline principal ────────────────────────────────────────────────────

/**
 * Executa o pipeline completo para um serviço.
 * @param {string} serviceKey  — 'web' | 'cron' | 'whatsapp' | 'all'
 * @param {string} deployId
 * @param {object} options     — { force: bool, noCache: bool, noDeps: bool }
 */
async function run(serviceKey, deployId, options = {}) {
  if (!emitters.has(deployId)) emitters.set(deployId, new EventEmitter());

  const serviceMap    = config.getServiceMap();
  const startedAt     = new Date().toISOString();
  const startTime     = Date.now();
  let   deployStatus  = 'success';
  let   previousHash  = null;
  let   currentHash   = null;
  let   migrationRan  = false;

  // Serviços a deployar
  const targets = serviceKey === 'all'
    ? Object.entries(serviceMap).filter(([k]) => k !== 'all').map(([, v]) => v)
    : [serviceMap[serviceKey]];

  if (!targets.length || targets.includes(undefined)) {
    const err = `Serviço '${serviceKey}' não reconhecido`;
    log(deployId, err, 'stderr');
    emit(deployId, { type: 'done', status: 'failed', error: err });
    saveRecord({ id: deployId, service: serviceKey, status: 'failed', startedAt, duration: 0, error: err });
    emitters.delete(deployId);
    return { status: 'failed' };
  }

  try {
    // ── STEP 1: Git Pull ─────────────────────────────────────────────────
    step(deployId, 'git-pull', 'running');
    log(deployId, '▶ git pull origin main');

    previousHash = await git.getCurrentHash().catch(() => null);

    await git.pull((line, stream) => log(deployId, line, stream));
    currentHash  = await git.getCurrentHash().catch(() => null);

    step(deployId, 'git-pull', 'done');
    log(deployId, `✓ Pull concluído. Commit: ${currentHash?.slice(0, 7)}`);

    // ── STEP 3: Build ─────────────────────────────────────────────────────
    for (const svc of targets) {
      step(deployId, `build:${svc}`, 'running');
      log(deployId, `▶ docker compose build ${svc}${options.noCache ? ' --no-cache' : ''}${options.noDeps ? ' --no-deps' : ''}`);
      await docker.buildService(svc, (line, stream) => log(deployId, line, stream), { noCache: options.noCache, noDeps: options.noDeps });
      step(deployId, `build:${svc}`, 'done');
      log(deployId, `✓ Build de '${svc}' concluído`);
    }

    // ── STEP 4: Down ──────────────────────────────────────────────────────
    for (const svc of targets) {
      step(deployId, `down:${svc}`, 'running');
      log(deployId, `▶ docker compose stop + rm ${svc}`);
      await docker.downService(svc, (line, stream) => log(deployId, line, stream));
      step(deployId, `down:${svc}`, 'done');
    }

    // ── STEP 5: Prisma migrate deploy (sempre — é idempotente) ────────────
    step(deployId, 'prisma-migrate', 'running');
    log(deployId, '▶ docker compose run -T --rm prisma-migrate');
    await prisma.runMigrations((line, stream) => log(deployId, line, stream));
    step(deployId, 'prisma-migrate', 'done');
    log(deployId, '✓ Migrations aplicadas');
    migrationRan = true;

    // ── STEP 6: Up ────────────────────────────────────────────────────────
    for (const svc of targets) {
      step(deployId, `up:${svc}`, 'running');
      log(deployId, `▶ docker compose up -d ${svc}${options.noDeps ? ' --no-deps' : ''}`);
      await docker.upService(svc, (line, stream) => log(deployId, line, stream), { noDeps: options.noDeps });
      step(deployId, `up:${svc}`, 'done');
      log(deployId, `✓ '${svc}' subiu`);
    }

    // ── STEP 7: Health Check ──────────────────────────────────────────────
    for (const svc of targets) {
      step(deployId, `health:${svc}`, 'running');
      log(deployId, `▶ Aguardando health check de '${svc}' (30s timeout)`);
      const health = await docker.waitForHealthy(svc, (line, stream) => log(deployId, line, stream));

      if (health === 'healthy' || health === 'no-healthcheck') {
        step(deployId, `health:${svc}`, 'done');
        const label = health === 'no-healthcheck' ? '(sem healthcheck, container running)' : '';
        log(deployId, `✓ '${svc}' está OK ${label}`.trim());
      } else if (health === 'timeout') {
        step(deployId, `health:${svc}`, 'warning');
        log(deployId, `⚠️  Health check timeout para '${svc}'`, 'stderr');
        deployStatus = 'warning';
      } else {
        step(deployId, `health:${svc}`, 'failed');
        log(deployId, `✗ '${svc}' está unhealthy`, 'stderr');
        deployStatus = 'warning';
      }
    }

  } catch (err) {
    deployStatus = 'failed';
    log(deployId, `✗ ERRO: ${err.message}`, 'stderr');
    emit(deployId, { type: 'error', message: err.message });
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  appendLog(deployId, `── Deploy ${deployStatus.toUpperCase()} (${duration}s) ──`);

  // Persiste no histórico
  saveRecord({
    id:           deployId,
    service:      serviceKey,
    status:       deployStatus,
    startedAt,
    duration,
    commitBefore: previousHash,
    commitAfter:  currentHash,
    migrationRan,
  });

  // Limpa emitter
  setTimeout(() => emitters.delete(deployId), 60000);

  return { status: deployStatus, summary: { duration, currentHash, migrationRan } };
}

// ── Rollback ──────────────────────────────────────────────────────────────

/**
 * Reverte para o commit anterior e re-faz o deploy do serviço.
 */
async function rollback(serviceKey, deployId) {
  if (!emitters.has(deployId)) emitters.set(deployId, new EventEmitter());

  const serviceMap = config.getServiceMap();
  const svc        = serviceMap[serviceKey];
  const startedAt  = new Date().toISOString();
  const startTime  = Date.now();

  if (!svc) {
    const err = `Serviço '${serviceKey}' não reconhecido para rollback`;
    log(deployId, err, 'stderr');
    return { status: 'failed' };
  }

  try {
    // Busca hash anterior do histórico
    const history = readHistory().filter(r => r.service === serviceKey && r.status !== 'failed');
    const prevRecord = history[1]; // [0] é o atual, [1] é o anterior
    const targetHash = prevRecord?.commitBefore;

    if (!targetHash) {
      throw new Error('Nenhum commit anterior encontrado para rollback');
    }

    log(deployId, `▶ Rollback para commit ${targetHash.slice(0, 7)}`);
    step(deployId, 'git-checkout', 'running');
    await git.checkout(targetHash, (line, stream) => log(deployId, line, stream));
    step(deployId, 'git-checkout', 'done');

    // Re-executa build → down → up
    step(deployId, `build:${svc}`, 'running');
    await docker.buildService(svc, (line, stream) => log(deployId, line, stream));
    step(deployId, `build:${svc}`, 'done');

    step(deployId, `down:${svc}`, 'running');
    await docker.downService(svc, (line, stream) => log(deployId, line, stream));
    step(deployId, `down:${svc}`, 'done');

    step(deployId, `up:${svc}`, 'running');
    await docker.upService(svc, (line, stream) => log(deployId, line, stream));
    step(deployId, `up:${svc}`, 'done');

    const duration = Math.round((Date.now() - startTime) / 1000);
    log(deployId, `✓ Rollback para ${targetHash.slice(0, 7)} concluído em ${duration}s`);

    saveRecord({
      id: deployId, service: serviceKey, status: 'success',
      type: 'rollback', startedAt, duration,
      commitAfter: targetHash,
    });

    return { status: 'success' };

  } catch (err) {
    log(deployId, `✗ Rollback falhou: ${err.message}`, 'stderr');
    saveRecord({
      id: deployId, service: serviceKey, status: 'failed',
      type: 'rollback', startedAt,
      duration: Math.round((Date.now() - startTime) / 1000),
      error: err.message,
    });
    setTimeout(() => emitters.delete(deployId), 60000);
    return { status: 'failed' };
  }
}

module.exports = { run, rollback, runMigrationOnly, on };

// ── Migration standalone ───────────────────────────────────────────────────

/**
 * Executa apenas a migration Prisma, sem fazer deploy.
 */
async function runMigrationOnly(deployId) {
  if (!emitters.has(deployId)) emitters.set(deployId, new EventEmitter());

  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  let   status    = 'success';

  try {
    step(deployId, 'prisma-migrate', 'running');
    log(deployId, '▶ Executando prisma migrate deploy');

    await prisma.runMigrations((line, stream) => log(deployId, line, stream));

    step(deployId, 'prisma-migrate', 'done');
    log(deployId, '✓ Migrations aplicadas com sucesso');
  } catch (err) {
    status = 'failed';
    step(deployId, 'prisma-migrate', 'failed');
    log(deployId, `✗ ERRO: ${err.message}`, 'stderr');
    emit(deployId, { type: 'error', message: err.message });
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  appendLog(deployId, `── Migration ${status.toUpperCase()} (${duration}s) ──`);

  saveRecord({
    id:        deployId,
    service:   'migration',
    type:      'migration',
    status,
    startedAt,
    duration,
  });

  setTimeout(() => emitters.delete(deployId), 60000);
  return { status, summary: { duration } };
}
