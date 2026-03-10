# Skill: Modificar Frontend

## Descrição
Use esta skill quando precisar modificar a interface do usuário.

## Contexto Necessário
- O que precisa ser alterado (card, botão, modal, etc.)
- Comportamento esperado

## Arquivos do Frontend

```
public/
├── index.html      # Estrutura HTML (modais, grids, etc.)
├── css/style.css   # Estilos (CSS custom properties, BEM)
└── js/
    ├── api.js      # Funções de fetch com autenticação
    ├── app.js      # Lógica principal (carrega serviços, renderiza)
    └── terminal.js # Componente SSE (logs em tempo real)
```

## Padrões CSS

### Variáveis (Custom Properties)

```css
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --accent: #58a6ff;
  --success: #3fb950;
  --warning: #d29922;
  --danger: #f85149;
}
```

### Classes BEM

```css
/* Block */
.card { }

/* Element */
.card__header { }
.card__name { }
.card__actions { }

/* Modifier */
.card--loading { }
.btn--primary { }
.btn--ghost { }
```

## Adicionar Novo Botão

### 1. HTML (index.html)

```html
<button id="btn-meu-botao" class="btn btn--primary btn--icon">
  🔧 Meu Botão
</button>
```

### 2. JavaScript (app.js)

```javascript
document.getElementById('btn-meu-botao')?.addEventListener('click', async () => {
  if (!confirm('Confirmar ação?')) return;
  
  try {
    const result = await API.minhaFuncao();
    alert('Sucesso!');
  } catch (err) {
    alert(`Erro: ${err.message}`);
  }
});
```

### 3. API (api.js)

```javascript
function minhaFuncao() {
  return request('POST', '/api/minha-rota');
}

// Exportar
window.API = { 
  // ... existentes ...
  minhaFuncao 
};
```

## Adicionar Card Customizado

### 1. Modificar buildCard() em app.js

```javascript
function buildCard(svc, data) {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = `card-${svc.key}`;

  card.innerHTML = `
    <div class="card__header">
      <!-- Conteúdo do header -->
    </div>
    <div class="card__meta">
      <!-- Metadados -->
    </div>
    <div class="card__actions">
      <!-- Botões -->
    </div>
    
    <!-- NOVO: Seção customizada -->
    <div class="card__custom">
      ${svc.minhaPropriedade ? `
        <span>Valor: ${svc.minhaPropriedade}</span>
      ` : ''}
    </div>
  `;

  return card;
}
```

### 2. CSS (style.css)

```css
.card__custom {
  padding: var(--space-md);
  border-top: 1px solid var(--border);
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
```

## Adicionar Modal

### 1. HTML (index.html)

```html
<div id="meu-modal" class="modal hidden" role="dialog" aria-modal="true">
  <div class="modal__overlay" id="meu-modal-overlay"></div>
  <div class="modal__container">
    <div class="modal__header">
      <span class="modal__title">Meu Modal</span>
      <button id="meu-modal-close" class="btn btn--ghost">✕</button>
    </div>
    <div class="modal__body">
      <!-- Conteúdo -->
    </div>
  </div>
</div>
```

### 2. JavaScript (app.js)

```javascript
// Abrir modal
function abrirMeuModal() {
  document.getElementById('meu-modal').classList.remove('hidden');
}

// Fechar modal
document.getElementById('meu-modal-close')?.addEventListener('click', () => {
  document.getElementById('meu-modal').classList.add('hidden');
});

document.getElementById('meu-modal-overlay')?.addEventListener('click', () => {
  document.getElementById('meu-modal').classList.add('hidden');
});
```

## Consumir Novo Endpoint da API

### 1. Adicionar em api.js

```javascript
function getNovosDados() {
  return request('GET', '/api/novos-dados');
}

// Exportar
window.API = { 
  // ... existentes ...
  getNovosDados 
};
```

### 2. Usar em app.js

```javascript
async function carregarNovosDados() {
  try {
    const dados = await API.getNovosDados();
    console.log(dados);
    // Atualizar UI
  } catch (err) {
    console.error('Erro:', err.message);
  }
}
```

## Testar

```bash
# Abrir no navegador
open http://localhost:4000

# Hard refresh para limpar cache
Ctrl+Shift+R (ou Cmd+Shift+R no Mac)

# Ver console para erros
F12 → Console
```
