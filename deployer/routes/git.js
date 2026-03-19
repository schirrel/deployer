/**
 * Git Route
 * Endpoints para sincronização e informações do repositório git.
 * 
 * @agent Backend Agent / DevOps Agent
 */

'use strict';

const git      = require('../services/git');
const pipeline = require('../services/pipeline');

// Reusa o broadcast/stream infra do deploy route
const activeStreams = new Map();
const eventBuffers = new Map();
const BUFFER_TTL_MS = 5 * 60 * 1000;

function getBuffer(id) {
  if (!eventBuffers.has(id)) eventBuffers.set(id, []);
  return eventBuffers.get(id);
}

function scheduleBufferCleanup(id) {
  setTimeout(() => eventBuffers.delete(id), BUFFER_TTL_MS);
}

function registerStream(id, res) {
  if (!activeStreams.has(id)) activeStreams.set(id, new Set());
  activeStreams.get(id).add(res);
  const buf = eventBuffers.get(id) || [];
  for (const line of buf) {
    try { res.write(line); } catch {}
  }
}

function broadcastSSE(id, event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  getBuffer(id).push(data);
  const clients = activeStreams.get(id);
  if (!clients) return;
  for (const res of clients) {
    try { res.write(data); } catch {}
  }
}

function closeSSE(id) {
  const clients = activeStreams.get(id);
  if (!clients) return;
  for (const res of clients) {
    try { res.end(); } catch {}
  }
  activeStreams.delete(id);
  scheduleBufferCleanup(id);
}

// POST /api/git/sync — Inicia sincronização git (fetch + diff + pull)
async function sync(req, res, jsonResponse) {
  const syncId = `gitsync_${Date.now()}`;

  getBuffer(syncId);

  jsonResponse(res, 202, { syncId, message: 'Git sync iniciado' });

  pipeline.on(syncId, (event) => broadcastSSE(syncId, event));

  pipeline.runGitSync(syncId)
    .then(result => {
      broadcastSSE(syncId, { type: 'done', status: result.status, summary: result.summary });
      closeSSE(syncId);
    })
    .catch(err => {
      broadcastSSE(syncId, { type: 'done', status: 'failed', error: err.message });
      closeSSE(syncId);
    });
}

// GET /api/git/stream/:syncId — SSE stream para acompanhar sync
function stream(req, res) {
  const { syncId } = req.params;

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(': heartbeat\n\n');
  registerStream(syncId, res);

  req.on('close', () => {
    const clients = activeStreams.get(syncId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) activeStreams.delete(syncId);
    }
  });
}

// GET /api/git/info — Retorna informações atuais do repositório
async function info(req, res, jsonResponse) {
  try {
    const [hash, branch, lastCommit, dirtyFiles] = await Promise.all([
      git.getCurrentHash().catch(() => null),
      git.getBranch().catch(() => null),
      git.getLastCommitInfo().catch(() => null),
      git.status().catch(() => ''),
    ]);

    jsonResponse(res, 200, {
      hash,
      branch,
      lastCommit,
      dirty: dirtyFiles ? dirtyFiles.split('\n').filter(Boolean) : [],
    });
  } catch (err) {
    jsonResponse(res, 500, { error: err.message });
  }
}

module.exports = { sync, stream, info };
