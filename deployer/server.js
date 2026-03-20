/**
 * DEPLOYER PLATFORM — Entry Point
 * Node.js puro, sem frameworks. HTTP nativo com roteamento manual.
 * 
 * @agent Backend Agent
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// Carrega .env se existir (sem dependência externa)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    });
}

const PORT = parseInt(process.env.PORT || '4000', 10);

// Routes
const authMiddleware = require('./routes/auth');
const deployRoute    = require('./routes/deploy');
const statusRoute    = require('./routes/status');
const historyRoute   = require('./routes/history');
const config         = require('./services/config');
const gitRoute       = require('./routes/git');

// MIME types para arquivos estáticos
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// Helper: resposta JSON
function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// Helper: servir arquivo estático
function serveStatic(res, filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// Roteador principal
const server = http.createServer((req, res) => {
  // CORS para dev local
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed   = new URL(req.url, `http://localhost`);
  const pathname = parsed.pathname;

  // ── Arquivos estáticos ──────────────────────────────────────────────────
  if (!pathname.startsWith('/api/')) {
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
      filePath = path.join(__dirname, 'public', 'index.html');
    } else {
      // Previne path traversal
      const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      filePath = path.join(__dirname, 'public', safe);
    }
    return serveStatic(res, filePath);
  }

  // ── API: autenticação ───────────────────────────────────────────────────
  // SSE streams têm autenticação via query param token (EventSource não suporta headers)
  const isSse = pathname.startsWith('/api/deploy/stream/') || pathname.startsWith('/api/git/stream/');
  if (!authMiddleware(req, res, isSse ? parsed.searchParams.get('token') : null)) return;

  // ── Roteamento da API ───────────────────────────────────────────────────

  // GET  /api/services — retorna configuração de serviços para o frontend
  if (req.method === 'GET' && pathname === '/api/services') {
    return jsonResponse(res, 200, config.getFullConfig());
  }

  // GET  /api/status
  if (req.method === 'GET' && pathname === '/api/status') {
    return statusRoute.getAll(req, res, jsonResponse);
  }

  // GET  /api/status/:service
  const statusMatch = pathname.match(/^\/api\/status\/([^/]+)$/);
  if (req.method === 'GET' && statusMatch) {
    req.params = { service: statusMatch[1] };
    return statusRoute.getOne(req, res, jsonResponse);
  }

  // GET  /api/history
  if (req.method === 'GET' && pathname === '/api/history') {
    return historyRoute.list(req, res, jsonResponse);
  }

  // GET  /api/history/:deployId
  const historyDetailMatch = pathname.match(/^\/api\/history\/([^/]+)$/);
  if (req.method === 'GET' && historyDetailMatch) {
    req.params = { deployId: historyDetailMatch[1] };
    return historyRoute.get(req, res, jsonResponse);
  }

  // POST /api/migrate
  if (req.method === 'POST' && pathname === '/api/migrate') {
    return deployRoute.migrate(req, res, jsonResponse);
  }

  // POST /api/deploy/:service
  const deployMatch = pathname.match(/^\/api\/deploy\/([^/]+)$/);
  if (req.method === 'POST' && deployMatch && deployMatch[1] !== 'stream') {
    req.params = { service: deployMatch[1] };
    return deployRoute.start(req, res, jsonResponse);
  }

  // GET  /api/deploy/stream/:deployId
  const streamMatch = pathname.match(/^\/api\/deploy\/stream\/([^/]+)$/);
  if (req.method === 'GET' && streamMatch) {
    req.params = { deployId: streamMatch[1] };
    return deployRoute.stream(req, res);
  }

  // POST /api/rollback/:service
  const rollbackMatch = pathname.match(/^\/api\/rollback\/([^/]+)$/);
  if (req.method === 'POST' && rollbackMatch) {
    req.params = { service: rollbackMatch[1] };
    return deployRoute.rollback(req, res, jsonResponse);
  }
  
  // POST /api/git/sync
  if (req.method === 'POST' && pathname === '/api/git/sync') {
    return gitRoute.sync(req, res, jsonResponse);
  }

  // GET  /api/git/stream/:syncId
  const gitStreamMatch = pathname.match(/^\/api\/git\/stream\/([^/]+)$/);
  if (req.method === 'GET' && gitStreamMatch) {
    req.params = { syncId: gitStreamMatch[1] };
    return gitRoute.stream(req, res);
  }

  // GET  /api/git/info
  if (req.method === 'GET' && pathname === '/api/git/info') {
    return gitRoute.info(req, res, jsonResponse);
  }

  // 404 padrão
  jsonResponse(res, 404, { error: 'Route not found', path: pathname });
});

server.listen(PORT, () => {
  console.log(`[Deployer Platform] Servidor rodando em http://localhost:${PORT}`);
  console.log(`[Deployer Platform] Token: ${process.env.DEPLOY_TOKEN ? '✓ configurado' : '✗ NÃO configurado (DEPLOY_TOKEN)'}`);
  console.log(`[Deployer Platform] Repo:  ${process.env.REPO_PATH  || '✗ NÃO configurado (REPO_PATH)'}`);
});

server.on('error', (err) => {
  console.error('[Deployer Platform] Erro no servidor:', err.message);
  process.exit(1);
});

module.exports = server;
