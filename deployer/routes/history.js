/**
 * History Route
 * Lê e retorna o histórico de deploys de data/history.json.
 * 
 * @agent Backend Agent
 */

'use strict';

const fs      = require('fs');
const path    = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'history.json');
const LOGS_DIR     = path.join(__dirname, '..', 'data', 'logs');

function readHistory() {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function list(req, res, jsonResponse) {
  const history = readHistory();
  // Mais recentes primeiro
  history.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  jsonResponse(res, 200, { deploys: history });
}

function get(req, res, jsonResponse) {
  const { deployId } = req.params;
  const history = readHistory();
  const record  = history.find(r => r.id === deployId);

  if (!record) {
    return jsonResponse(res, 404, { error: 'Deploy não encontrado' });
  }

  // Lê arquivo de log se existir
  const logFile = path.join(LOGS_DIR, `${deployId}.log`);
  let logs = '';
  try {
    logs = fs.readFileSync(logFile, 'utf8');
  } catch {}

  jsonResponse(res, 200, { deploy: record, logs });
}

module.exports = { list, get };
