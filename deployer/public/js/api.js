/**
 * API Module — Funções de fetch para a API de deploy.
 * Lê o token salvo no localStorage. Redireciona para login overlay se não autenticado.
 * 
 * @agent Frontend Agent
 */

(function (window) {
  'use strict';

  const API_BASE = '';

  // ── Token ──────────────────────────────────────────────────────────
  function getToken() {
    return localStorage.getItem('deploy_token') || '';
  }

  function saveToken(token) {
    localStorage.setItem('deploy_token', token);
  }

  function clearToken() {
    localStorage.removeItem('deploy_token');
  }

  function authHeaders() {
    return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
  }

  // ── Login overlay ─────────────────────────────────────────────────

  function showLogin(onSuccess) {
    const overlay = document.getElementById('login-overlay');
    const form    = document.getElementById('login-form');
    const input   = document.getElementById('login-token');
    const errEl   = document.getElementById('login-error');

    overlay.classList.remove('hidden');
    input.value = '';
    errEl.classList.add('hidden');
    setTimeout(() => input.focus(), 50);

    function handleSubmit(e) {
      e.preventDefault();
      const token = input.value.trim();
      if (!token) return;
      saveToken(token);
      overlay.classList.add('hidden');
      errEl.classList.add('hidden');
      form.removeEventListener('submit', handleSubmit);
      if (onSuccess) onSuccess();
    }

    form.addEventListener('submit', handleSubmit);
  }

  // ── Request helper ─────────────────────────────────────────────────
  function request(method, path, body) {
    const opts = { method, headers: authHeaders() };
    if (body) opts.body = JSON.stringify(body);

    return fetch(API_BASE + path, opts).then(res => {
      if (res.status === 401) {
        clearToken();
        return new Promise((resolve, reject) => {
          showLogin(() => {
            // Re-tenta após login
            request(method, path, body).then(resolve).catch(reject);
          });
        });
      }
      return res.json().catch(() => ({})).then(data => {
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      });
    });
  }

  // ── Endpoints ──────────────────────────────────────────────────────

  function getStatus()              { return request('GET',  '/api/status'); }
  function getServices()            { return request('GET',  '/api/services'); }
  function startDeploy(service)     { return request('POST', `/api/deploy/${service}`); }
  function startRollback(svc)       { return request('POST', `/api/rollback/${svc}`); }
  function getHistory()             { return request('GET',  '/api/history'); }
  function getDeployDetail(id)      { return request('GET',  `/api/history/${id}`); }
  function runMigration()           { return request('POST', '/api/migrate'); }

  function getStreamUrl(deployId) {
    const token = encodeURIComponent(getToken());
    return `${API_BASE}/api/deploy/stream/${deployId}?token=${token}`;
  }

  // Exporta para o escopo global
  window.API = { getToken, saveToken, clearToken, showLogin, getStatus, getServices, startDeploy, startRollback, getHistory, getDeployDetail, runMigration, getStreamUrl };

})(window);
