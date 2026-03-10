/**
 * Auth Middleware
 * Valida Bearer token via header Authorization ou query param.
 * Retorna true se autenticado, false se rejeitado (já escreveu a resposta).
 * 
 * @agent Backend Agent
 */

'use strict';

const DEPLOY_TOKEN = process.env.DEPLOY_TOKEN || '';

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 * @param {string|null}          queryToken  — usado para SSE (EventSource não suporta headers)
 * @returns {boolean}
 */
function authMiddleware(req, res, queryToken = null) {
  if (!DEPLOY_TOKEN) {
    // Token não configurado: bloqueia tudo por segurança
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'DEPLOY_TOKEN não configurado no servidor' }));
    return false;
  }

  let provided = null;

  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice(7).trim();
  } else if (queryToken) {
    provided = String(queryToken).trim();
  }

  if (!provided || provided !== DEPLOY_TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }

  return true;
}

module.exports = authMiddleware;
