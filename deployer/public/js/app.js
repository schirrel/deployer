/**
 * App — Lógica principal do painel.
 * Gerencia cards de serviço, polling de status, histórico e ações.
 * Carrega serviços dinamicamente via API.
 * 
 * @agent Frontend Agent
 */

(function (window) {
  'use strict';

  // ── Estado global ─────────────────────────────────────────────────
  let SERVICES = [];        // Carregado via API
  let migrationEnabled = false;

  // ── Init: carrega configuração e verifica token ───────────────────
  async function init() {
    if (!API.getToken()) {
      API.showLogin(() => loadConfigAndStatus());
    } else {
      await loadConfigAndStatus();
    }
  }

  async function loadConfigAndStatus() {
    try {
      const config = await API.getServices();
      SERVICES = config.services || [];
      migrationEnabled = config.migration?.enabled === true;

      // Mostra/oculta botão de migration baseado na config
      const migrateBtn = document.getElementById('btn-migrate');
      if (migrateBtn) {
        migrateBtn.style.display = migrationEnabled ? '' : 'none';
      }

      await loadStatus();
      await loadGitInfo();
    } catch (err) {
      console.warn('[Init] Erro ao carregar config:', err.message);
      // Fallback: tenta carregar status mesmo sem config
      await loadStatus();
      await loadGitInfo();
    }
  }

  // ── Clock ─────────────────────────────────────────────────────────
  const clockEl = document.getElementById('clock');
  function updateClock() {
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('pt-BR');
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ── Tabs ──────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.add('hidden');
        c.classList.remove('tab-content--active');
      });
      tab.classList.add('tab--active');
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      if (target) {
        target.classList.remove('hidden');
        target.classList.add('tab-content--active');
        if (tab.dataset.tab === 'history') loadHistory();
      }
    });
  });

  // ── Migration banner ──────────────────────────────────────────────
  document.getElementById('migration-banner-close')?.addEventListener('click', () => {
    document.getElementById('migration-banner').classList.add('hidden');
  });

  // ── Render: card de serviço ───────────────────────────────────────

  function statusClass(status) {
    if (status === 'running') return 'running';
    if (status === 'stopped' || status === 'exited') return 'stopped';
    return 'unknown';
  }

  function healthLabel(health) {
    if (!health || health === 'none') return '—';
    return health;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function buildCard(svc, data) {
    const status = data?.status || 'unknown';
    const cls    = statusClass(status);
    const isDeployable = svc.deployable !== false;

    const card = document.createElement('div');
    card.className = 'card';
    card.id = `card-${svc.key}`;

    card.innerHTML = `
      <div class="card__header">
        <div>
          <div class="card__name">${svc.label}</div>
          <div class="card__label">${svc.subtitle}</div>
        </div>
        <span class="status-dot status-dot--${cls}" title="${status}"></span>
      </div>
      <div class="card__meta">
        <div class="card__meta-item">
          <span class="card__meta-label">Status</span>
          <span class="card__meta-value">${status}</span>
        </div>
        <div class="card__meta-item">
          <span class="card__meta-label">Health</span>
          <span class="card__meta-value">${healthLabel(data?.health)}</span>
        </div>
        <div class="card__meta-item">
          <span class="card__meta-label">Iniciado em</span>
          <span class="card__meta-value">${formatDate(data?.startedAt)}</span>
        </div>
        <div class="card__meta-item">
          <span class="card__meta-label">Commit</span>
          <span class="card__meta-value" id="commit-${svc.key}">—</span>
        </div>
      </div>
      ${isDeployable ? `
        <div class="card__options">
          <label class="card__option">
            <input type="checkbox" class="card__option-check" data-option="noCache" />
            <span>no-cache</span>
          </label>
          <label class="card__option">
            <input type="checkbox" class="card__option-check" data-option="noDeps" />
            <span>no-deps</span>
          </label>
        </div>
      ` : ''}
      <div class="card__actions">
        ${isDeployable ? `
          <button class="btn btn--primary btn--deploy" data-service="${svc.key}">
            🚀 Deploy
          </button>
          <button class="btn btn--ghost btn--rollback" data-service="${svc.key}">
            ↩ Rollback
          </button>
        ` : ''}
      </div>
    `;

    return card;
  }

  function updateCard(svc, data) {
    const existing = document.getElementById(`card-${svc.key}`);
    const grid     = document.getElementById('services-grid');
    const newCard  = buildCard(svc, data);

    if (existing) {
      grid.replaceChild(newCard, existing);
    } else {
      // Remove skeletons na primeira carga
      grid.querySelectorAll('.card--skeleton').forEach(s => s.remove());
      grid.appendChild(newCard);
    }

    // Adiciona event listeners
    newCard.querySelector('.btn--deploy')?.addEventListener('click', () => {
      const opts = {};
      newCard.querySelectorAll('.card__option-check').forEach(cb => {
        opts[cb.dataset.option] = cb.checked;
      });
      triggerDeploy(svc.key, opts);
    });
    newCard.querySelector('.btn--rollback')?.addEventListener('click', () => triggerRollback(svc.key));
  }

  // ── Status polling ────────────────────────────────────────────────

  let lastCommits = {};

  async function loadStatus() {
    // Se SERVICES ainda não foi carregado, não faz nada
    if (!SERVICES.length) return;

    try {
      const { services } = await API.getStatus();
      
      // Cria um map de status por key para lookup rápido
      const statusMap = {};
      services.forEach(svc => { statusMap[svc.key] = svc; });

      // Atualiza todos os serviços configurados (mesmo sem status)
      SERVICES.forEach(def => {
        const data = statusMap[def.key] || null;
        updateCard(def, data);
      });
    } catch (err) {
      console.warn('[Status]', err.message);
    }
  }

  
  // ── Git Info ────────────────────────────────────────────────────────

  async function loadGitInfo() {
    try {
      const data = await API.getGitInfo();

      const branchEl     = document.getElementById('git-branch');
      const hashEl       = document.getElementById('git-hash');
      const lastCommitEl = document.getElementById('git-last-commit');
      const dirtyEl      = document.getElementById('git-dirty');

      if (branchEl) branchEl.textContent = data.branch || '—';
      if (hashEl)   hashEl.textContent   = data.hash ? data.hash.slice(0, 10) : '—';
      if (lastCommitEl && data.lastCommit) {
        lastCommitEl.textContent = `${data.lastCommit.subject} (${data.lastCommit.relTime})`;
        lastCommitEl.title       = `${data.lastCommit.author} — ${data.lastCommit.hash}`;
      }
      if (dirtyEl) {
        if (data.dirty.length === 0) {
          dirtyEl.textContent = '✓ Limpo';
          dirtyEl.style.color = 'var(--green)';
        } else {
          dirtyEl.textContent = `${data.dirty.length} arquivo(s)`;
          dirtyEl.style.color = 'var(--yellow)';
          dirtyEl.title = data.dirty.join('\n');
        }
      }
    } catch (err) {
      console.warn('[GitInfo]', err.message);
    }
  }

  // ── Git Sync ──────────────────────────────────────────────────────

  async function triggerGitSync() {
    try {
      const { syncId } = await API.startGitSync();
      const url = API.getGitStreamUrl(syncId);

      // Reusa Terminal module com URL customizada do git stream
      Terminal.open('Git Sync');

      const source = new EventSource(url);
      const startTime = Date.now();

      source.onmessage = (e) => {
        let event;
        try { event = JSON.parse(e.data); } catch { return; }

        const badge = document.getElementById('modal-status-badge');
        const meta  = document.getElementById('terminal-meta');
        const pipelineEl = document.getElementById('pipeline-steps');

        switch (event.type) {
          case 'log': {
            const cls = event.stream === 'stderr' ? 'stderr'
                      : event.line.startsWith('✓') ? 'success'
                      : event.line.startsWith('⚠') ? 'warning'
                      : event.line.startsWith('▶') ? 'info'
                      : 'stdout';
            Terminal.appendLine(event.line, cls);
            break;
          }
          case 'step': {
            // Upsert pipeline step
            let stepEl = pipelineEl.querySelector(`[data-step="${event.step}"]`);
            if (!stepEl) {
              stepEl = document.createElement('div');
              stepEl.className = 'pipeline-step';
              stepEl.dataset.step = event.step;
              const labels = {
                'git-fetch': '① fetch', 'git-diff': '② diff',
                'git-pull': '③ pull', 'git-status': '④ status',
              };
              stepEl.innerHTML = `<span class="pipeline-step__icon"></span><span>${labels[event.step] || event.step}</span>`;
              pipelineEl.appendChild(stepEl);
            }
            const icons = { running: '⟳', done: '✓', failed: '✗', warning: '⚠' };
            stepEl.querySelector('.pipeline-step__icon').textContent = icons[event.status] || '';
            stepEl.className = `pipeline-step pipeline-step--${event.status}`;
            break;
          }
          case 'error':
            Terminal.appendLine(`✗ ${event.message}`, 'stderr');
            break;
          case 'done': {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            badge.textContent = event.status;
            badge.className   = `badge badge--${event.status === 'success' ? 'success' : event.status === 'warning' ? 'warning' : 'failed'}`;
            meta.textContent  = `Concluído em ${duration}s`;
            Terminal.appendLine(`\n── Git Sync ${event.status.toUpperCase()} (${duration}s) ──`,
              event.status === 'success' ? 'success' : 'stderr');
            source.close();
            setTimeout(loadGitInfo, 1000);
            break;
          }
        }
      };

      source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) return;
        Terminal.appendLine('⚡ Conexão SSE perdida', 'stderr');
      };
    } catch (err) {
      alert(`Erro ao iniciar git sync: ${err.message}`);
    }
  }

  document.getElementById('btn-git-sync')?.addEventListener('click', triggerGitSync);


  // Polling a cada 15s — só inicia após ter token
  setInterval(() => {
    if (API.getToken()) loadStatus();
  }, 15000);



  // ── Deploy ────────────────────────────────────────────────────────

  async function triggerDeploy(serviceKey, deployOptions = {}) {
    try {
      const { deployId, service } = await API.startDeploy(serviceKey, deployOptions);
      const svc = SERVICES.find(s => s.key === serviceKey);
      Terminal.connect(deployId, `Deploy — ${svc?.label || service}`, () => {
        // Atualiza status após conclusão
        setTimeout(loadStatus, 2000);
      });
    } catch (err) {
      alert(`Erro ao iniciar deploy: ${err.message}`);
    }
  }

  async function triggerRollback(serviceKey) {
    if (!confirm(`Confirmar rollback de '${serviceKey}' para o commit anterior?`)) return;
    try {
      const { deployId, service } = await API.startRollback(serviceKey);
      const svc = SERVICES.find(s => s.key === serviceKey);
      Terminal.connect(deployId, `Rollback — ${svc?.label || service}`, () => {
        setTimeout(loadStatus, 2000);
      });
    } catch (err) {
      alert(`Erro ao iniciar rollback: ${err.message}`);
    }
  }

  // ── Deploy All ────────────────────────────────────────────────────

  document.getElementById('btn-deploy-all')?.addEventListener('click', async () => {
    if (!confirm('Fazer deploy de TODOS os serviços?')) return;
    try {
      const { deployId } = await API.startDeploy('all');
      Terminal.connect(deployId, 'Deploy All — todos os serviços', () => {
        setTimeout(loadStatus, 2000);
      });
    } catch (err) {
      alert(`Erro ao iniciar deploy all: ${err.message}`);
    }
  });

  // ── Run Migration ─────────────────────────────────────────────────

  document.getElementById('btn-migrate')?.addEventListener('click', async () => {
    if (!confirm('Executar Prisma migrate deploy agora?')) return;
    try {
      const { deployId } = await API.runMigration();
      Terminal.connect(deployId, 'Migration — prisma migrate deploy', () => {
        // Recarrega histórico se estiver na aba
        const histTab = document.getElementById('tab-history');
        if (histTab && !histTab.classList.contains('hidden')) loadHistory();
      });
    } catch (err) {
      alert(`Erro ao iniciar migration: ${err.message}`);
    }
  });

  // ── Refresh manual ────────────────────────────────────────────────
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    loadStatus();
    loadGitInfo();
  });
  
  // ── Logout ────────────────────────────────────────────────────────
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    API.clearToken();
    API.showLogin(() => loadStatus());
  });

  // ── Inicia ────────────────────────────────────────────────────────
  init();

  // ── History ───────────────────────────────────────────────────────

  async function loadHistory() {
    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Carregando...</td></tr>';

    try {
      const { deploys } = await API.getHistory();

      if (!deploys.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Nenhum deploy registrado.</td></tr>';
        return;
      }

      tbody.innerHTML = deploys.map(d => `
        <tr>
          <td>${d.service}</td>
          <td><span style="color:var(--text-secondary);font-size:11px">${d.type || 'deploy'}</span></td>
          <td><span class="badge badge--${d.status}">${d.status}</span></td>
          <td>${formatDate(d.startedAt)}</td>
          <td>${d.duration != null ? d.duration + 's' : '—'}</td>
          <td>${d.commitAfter ? d.commitAfter.slice(0, 7) : '—'}</td>
          <td>${d.migrationRan ? '✓' : '—'}</td>
          <td><button class="btn--logs" data-deploy-id="${d.id}">Ver logs</button></td>
        </tr>
      `).join('');

      // Event delegation para botões "Ver logs"
      tbody.querySelectorAll('.btn--logs').forEach(btn => {
        btn.addEventListener('click', () => openDeployDetail(btn.dataset.deployId));
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="loading">Erro: ${err.message}</td></tr>`;
    }
  }

  // ── Deploy Detail Modal ───────────────────────────────────────────

  async function openDeployDetail(deployId) {
    const modal     = document.getElementById('detail-modal');
    const metaEl    = document.getElementById('detail-meta');
    const termEl    = document.getElementById('detail-terminal');
    const titleEl   = document.getElementById('detail-title');
    const badgeEl   = document.getElementById('detail-status-badge');

    // Show modal with loading state
    modal.classList.remove('hidden');
    termEl.textContent = 'Carregando logs...';
    metaEl.innerHTML   = '';
    titleEl.textContent = deployId;
    badgeEl.className  = 'badge badge--running';
    badgeEl.textContent = '…';

    try {
      const { deploy, logs } = await API.getDeployDetail(deployId);

      titleEl.textContent = `${deploy.service} — ${deploy.type || 'deploy'}`;
      badgeEl.className   = `badge badge--${deploy.status}`;
      badgeEl.textContent = deploy.status;

      const fields = [
        { label: 'ID',             value: deploy.id },
        { label: 'Serviço',        value: deploy.service },
        { label: 'Status',         value: deploy.status },
        { label: 'Iniciado em',    value: formatDate(deploy.startedAt) },
        { label: 'Duração',        value: deploy.duration != null ? deploy.duration + 's' : '—' },
        { label: 'Commit antes',   value: deploy.commitBefore ? deploy.commitBefore.slice(0, 12) : '—' },
        { label: 'Commit depois',  value: deploy.commitAfter  ? deploy.commitAfter.slice(0, 12)  : '—' },
        { label: 'Migration',      value: deploy.migrationRan ? '✓ Sim' : '—' },
      ];

      metaEl.innerHTML = fields.map(f => `
        <div class="detail-meta__item">
          <span class="detail-meta__label">${f.label}</span>
          <span class="detail-meta__value">${f.value}</span>
        </div>
      `).join('');

      if (logs) {
        // Colorize log lines
        termEl.innerHTML = logs.split('\n').map(line => {
          if (!line) return '';
          let cls = 'term-line';
          if (line.startsWith('✗') || line.includes('ERRO') || line.includes('FAILED') || line.includes('error')) cls += ' term-line--err';
          else if (line.startsWith('✓') || line.includes('SUCCESS') || line.includes('done')) cls += ' term-line--ok';
          else if (line.startsWith('⚠') || line.includes('warning') || line.includes('WARNING')) cls += ' term-line--warn';
          else if (line.startsWith('▶') || line.startsWith('──')) cls += ' term-line--info';
          return `<div class="${cls}">${escapeHtml(line)}</div>`;
        }).join('');
        // Scroll to bottom
        termEl.scrollTop = termEl.scrollHeight;
      } else {
        termEl.textContent = 'Nenhum log disponível para este deploy.';
      }
    } catch (err) {
      termEl.textContent = `Erro ao carregar: ${err.message}`;
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Fechar detail modal
  document.getElementById('detail-close')?.addEventListener('click', () => {
    document.getElementById('detail-modal').classList.add('hidden');
  });
  document.getElementById('detail-overlay')?.addEventListener('click', () => {
    document.getElementById('detail-modal').classList.add('hidden');
  });

})(window);
