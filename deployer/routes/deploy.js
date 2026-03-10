/**
 * Deploy Route
 * Inicia pipeline de deploy, serve SSE e executa rollback.
 * 
 * @agent Backend Agent
 */

'use strict';

const pipeline = require('../services/pipeline');

// Map de streams SSE ativos: deployId → Set<http.ServerResponse>
const activeStreams = new Map();

// Buffer de eventos por deployId — permite replay para clientes que conectam tarde
// deployId → Array<string> (linhas SSE já serializadas)
const eventBuffers = new Map();
const BUFFER_TTL_MS = 5 * 60 * 1000; // mantém buffer 5 min após conclusão

function getBuffer(deployId) {
  if (!eventBuffers.has(deployId)) eventBuffers.set(deployId, []);
  return eventBuffers.get(deployId);
}

function scheduleBufferCleanup(deployId) {
  setTimeout(() => eventBuffers.delete(deployId), BUFFER_TTL_MS);
}

// Registra cliente SSE; faz replay de eventos anteriores para não perder nada
function registerStream(deployId, res) {
  if (!activeStreams.has(deployId)) activeStreams.set(deployId, new Set());
  activeStreams.get(deployId).add(res);

  // Replay: envia todos os eventos que já ocorreram antes desta conexão
  const buf = eventBuffers.get(deployId) || [];
  for (const line of buf) {
    try { res.write(line); } catch {}
  }
}

// Envia evento SSE para todos os clientes e salva no buffer
function broadcastSSE(deployId, event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;

  // Salva no buffer para clientes que conectam depois
  getBuffer(deployId).push(data);

  const clients = activeStreams.get(deployId);
  if (!clients) return;
  for (const res of clients) {
    try { res.write(data); } catch {}
  }
}

// Fecha todos os clientes SSE de um deploy
function closeSSE(deployId) {
  const clients = activeStreams.get(deployId);
  if (!clients) return;
  for (const res of clients) {
    try { res.end(); } catch {}
  }
  activeStreams.delete(deployId);
  scheduleBufferCleanup(deployId);
}

// POST /api/deploy/:service
async function start(req, res, jsonResponse) {
  const { service } = req.params;

  // Lê body JSON (opcional: pode conter { force: true })
  let body = {};
  try {
    body = await readBody(req);
  } catch {}

  const deployId = `deploy_${Date.now()}_${service}`;

  // Inicializa buffer vazio para este deploy imediatamente
  getBuffer(deployId);

  // Responde imediatamente com o deployId — frontend conecta no SSE
  jsonResponse(res, 202, { deployId, service, message: 'Deploy iniciado' });

  // Redireciona eventos do pipeline para SSE ANTES de iniciar
  pipeline.on(deployId, (event) => broadcastSSE(deployId, event));

  // Executa pipeline de forma assíncrona
  pipeline.run(service, deployId, body)
    .then(result => {
      broadcastSSE(deployId, { type: 'done', status: result.status, summary: result.summary });
      closeSSE(deployId);
    })
    .catch(err => {
      broadcastSSE(deployId, { type: 'done', status: 'failed', error: err.message });
      closeSSE(deployId);
    });
}

// GET /api/deploy/stream/:deployId
function stream(req, res) {
  const { deployId } = req.params;

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no', // desativa buffer do Nginx para SSE
  });

  // Heartbeat para manter conexão viva
  res.write(': heartbeat\n\n');

  registerStream(deployId, res);

  req.on('close', () => {
    const clients = activeStreams.get(deployId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) activeStreams.delete(deployId);
    }
  });
}

// POST /api/rollback/:service
async function rollback(req, res, jsonResponse) {
  const { service } = req.params;
  const deployId    = `rollback_${Date.now()}_${service}`;

  jsonResponse(res, 202, { deployId, service, message: 'Rollback iniciado' });

  pipeline.rollback(service, deployId)
    .then(result => {
      broadcastSSE(deployId, { type: 'done', status: result.status });
      closeSSE(deployId);
    })
    .catch(err => {
      broadcastSSE(deployId, { type: 'done', status: 'failed', error: err.message });
      closeSSE(deployId);
    });

  pipeline.on(deployId, (event) => broadcastSSE(deployId, event));
}

// POST /api/migrate  — executa migration standalone
async function migrate(req, res, jsonResponse) {
  const deployId = `migrate_${Date.now()}`;

  getBuffer(deployId);

  jsonResponse(res, 202, { deployId, message: 'Migration iniciada' });

  pipeline.on(deployId, (event) => broadcastSSE(deployId, event));

  pipeline.runMigrationOnly(deployId)
    .then(result => {
      broadcastSSE(deployId, { type: 'done', status: result.status, summary: result.summary });
      closeSSE(deployId);
    })
    .catch(err => {
      broadcastSSE(deployId, { type: 'done', status: 'failed', error: err.message });
      closeSSE(deployId);
    });
}

// Helper: lê body do request como JSON
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

module.exports = { start, stream, rollback, migrate };
