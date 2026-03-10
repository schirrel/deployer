/**
 * Terminal Module — Emula terminal no browser via SSE.
 * Gerencia conexão EventSource, exibe linhas com coloração,
 * atualiza pipeline steps e faz auto-scroll.
 * 
 * @agent Frontend Agent
 */

(function (window) {
  'use strict';

  let currentSource = null;

  const el = {
    modal:       () => document.getElementById('terminal-modal'),
    title:       () => document.getElementById('modal-title'),
    badge:       () => document.getElementById('modal-status-badge'),
    pipeline:    () => document.getElementById('pipeline-steps'),
    terminal:    () => document.getElementById('terminal'),
    meta:        () => document.getElementById('terminal-meta'),
    autoscroll:  () => document.getElementById('autoscroll-toggle'),
    closeBtn:    () => document.getElementById('modal-close'),
    overlay:     () => document.getElementById('modal-overlay'),
  };

  // ── Abertura/Fechamento do modal ──────────────────────────────────

  function open(title) {
    el.title().textContent = title;
    el.terminal().innerHTML = '';
    el.pipeline().innerHTML = '';
    el.badge().className = 'badge badge--running';
    el.badge().textContent = 'running';
    el.meta().textContent = '';
    el.modal().classList.remove('hidden');
  }

  function close() {
    el.modal().classList.add('hidden');
    if (currentSource) {
      currentSource.close();
      currentSource = null;
    }
  }

  el.closeBtn  && document.addEventListener('DOMContentLoaded', () => {
    el.closeBtn()  .addEventListener('click', close);
    el.overlay()   .addEventListener('click', close);
  });

  // ── Terminal output ───────────────────────────────────────────────

  function appendLine(text, type = 'stdout') {
    const term = el.terminal();
    const span = document.createElement('span');
    span.className = `terminal__line terminal__line--${type}`;
    span.textContent = text;
    term.appendChild(span);
    term.appendChild(document.createElement('br'));

    if (el.autoscroll().checked) {
      term.scrollTop = term.scrollHeight;
    }
  }

  // ── Pipeline Steps ────────────────────────────────────────────────

  const STEP_LABELS = {
    'git-pull':       '① git pull',
    'prisma-migrate': '② migrations',
  };

  function getStepLabel(stepKey) {
    if (STEP_LABELS[stepKey]) return STEP_LABELS[stepKey];
    const [action, svc] = stepKey.split(':');
    const icons = { build: '③ build', down: '④ down', up: '⑤ up', health: '⑥ health', 'git-checkout': '① checkout' };
    return `${icons[action] || action} ${svc || ''}`.trim();
  }

  function upsertStep(stepKey, status) {
    const pipeline = el.pipeline();
    let stepEl = pipeline.querySelector(`[data-step="${stepKey}"]`);

    if (!stepEl) {
      stepEl = document.createElement('div');
      stepEl.className = 'pipeline-step';
      stepEl.dataset.step = stepKey;
      stepEl.innerHTML = `<span class="pipeline-step__icon"></span><span>${getStepLabel(stepKey)}</span>`;
      pipeline.appendChild(stepEl);
    }

    const icons = { running: '⟳', done: '✓', failed: '✗', warning: '⚠' };
    stepEl.querySelector('.pipeline-step__icon').textContent = icons[status] || '';
    stepEl.className = `pipeline-step pipeline-step--${status}`;
  }

  // ── SSE Consumer ──────────────────────────────────────────────────

  /**
   * Conecta ao stream SSE e processa eventos.
   * @param {string} deployId
   * @param {function} onDone — callback({ status, summary })
   */
  function connect(deployId, title, onDone) {
    open(title);

    const url = API.getStreamUrl(deployId);
    const source = new EventSource(url);
    currentSource = source;

    const startTime = Date.now();

    source.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }

      switch (event.type) {
        case 'log': {
          const cls = event.stream === 'stderr' ? 'stderr'
                    : event.line.startsWith('✓') ? 'success'
                    : event.line.startsWith('⚠') ? 'warning'
                    : event.line.startsWith('▶') ? 'info'
                    : 'stdout';
          appendLine(event.line, cls);
          break;
        }

        case 'step':
          upsertStep(event.step, event.status);
          break;

        case 'migration_detected':
          appendLine('⚠️  Migration detectada no schema.prisma', 'warning');
          // Mostra banner global
          document.getElementById('migration-banner')?.classList.remove('hidden');
          break;

        case 'error':
          appendLine(`✗ ${event.message}`, 'stderr');
          break;

        case 'done': {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          const badge = el.badge();
          badge.textContent = event.status;
          badge.className   = `badge badge--${event.status === 'success' ? 'success' : event.status === 'warning' ? 'warning' : 'failed'}`;

          el.meta().textContent = `Concluído em ${duration}s`;
          appendLine(`\n── Deploy ${event.status.toUpperCase()} (${duration}s) ──`, event.status === 'success' ? 'success' : 'stderr');

          source.close();
          currentSource = null;
          if (onDone) onDone(event);
          break;
        }
      }
    };

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) return;
      appendLine('⚡ Conexão SSE perdida', 'stderr');
    };
  }

  // Exporta
  window.Terminal = { open, close, connect, appendLine };

})(window);
