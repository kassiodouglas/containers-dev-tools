const $ = id => document.getElementById(id);
let routes = [];
let savedRoutes = '';
let revision = '';
let ready = false;
let busy = false;
let editing = -1;
let routeStatuses = new Map();
let routeStatusState = 'loading';
const dirty = () => JSON.stringify(routes) !== savedRoutes;
const routeKey = route => `${route.domain}\n${route.upstream}`;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}

function message(text, success = false) {
  $('message').textContent = text;
  $('message').className = `message${success ? ' success' : ''}`;
  $('message').hidden = !text;
}

function updateControls() {
  $('save').disabled = !ready || busy || !dirty();
  $('save').textContent = busy ? 'Aplicando…' : 'Salvar e aplicar ↗';
  $('add-route').disabled = !ready || busy;
  $('reload').disabled = busy;
  $('preview').disabled = !ready || busy;
  $('draft-status').textContent = !ready ? 'Configuração indisponível' : busy ? 'Validando e aplicando no Caddy…' : dirty() ? '● Alterações ainda não aplicadas' : '✓ Configuração salva';
  $('draft-status').classList.toggle('dirty', ready && dirty());
  document.querySelectorAll('#route-list button').forEach(button => { button.disabled = busy; });
}

function iconButton(label, type, action) {
  const button = document.createElement('button');
  button.className = `icon-button ${type}`;
  button.title = label;
  button.setAttribute('aria-label', label);
  // These paths are static; all route data is inserted with textContent.
  button.innerHTML = type === 'delete'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15z"/></svg>';
  button.addEventListener('click', action);
  return button;
}

function routeStatusInfo(route) {
  if (!route.enabled) return { className: 'disabled', label: 'Rota desativada' };
  const online = routeStatuses.get(routeKey(route));
  if (online === true) return { className: 'online', label: 'Online · HTTP · Proxy reverso' };
  if (online === false) return { className: 'offline', label: 'Offline · destino indisponível' };
  if (routeStatusState === 'error') return { className: 'unknown', label: 'Status indisponível' };
  if (routeStatusState === 'ready') return { className: 'pending', label: 'Aguardando salvar e aplicar' };
  return { className: 'checking', label: 'Verificando disponibilidade…' };
}

function applyRouteStatuses() {
  document.querySelectorAll('.route-icon[data-route-index]').forEach(icon => {
    const route = routes[Number(icon.dataset.routeIndex)];
    if (!route) return;
    const info = routeStatusInfo(route);
    icon.className = `route-icon ${info.className}`;
    icon.title = info.label;
    icon.closest('.domain-cell')?.querySelector('.domain-subtitle')?.replaceChildren(info.label);
  });
}

async function updateRouteStatuses() {
  if (!ready || busy) return;
  try {
    const data = await api('/api/routes/status');
    routeStatuses = new Map(data.routes.map(route => [routeKey(route), route.online]));
    routeStatusState = 'ready';
  } catch {
    routeStatusState = 'error';
  }
  applyRouteStatuses();
}

function render() {
  $('route-list').replaceChildren();
  const query = $('search').value.trim().toLowerCase();
  let shown = 0;
  routes.forEach((route, index) => {
    if (!`${route.domain} ${route.upstream}`.toLowerCase().includes(query)) return;
    shown++;
    const row = document.createElement('tr');
    row.classList.toggle('disabled-row', !route.enabled);
    const domainCell = document.createElement('td');
    const domainWrap = document.createElement('div');
    domainWrap.className = 'domain-cell';
    const routeIcon = document.createElement('span');
    const routeStatus = routeStatusInfo(route);
    routeIcon.className = `route-icon ${routeStatus.className}`;
    routeIcon.dataset.routeIndex = index;
    routeIcon.title = routeStatus.label;
    routeIcon.textContent = '↗';
    routeIcon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('div');
    const link = document.createElement('a');
    link.className = 'domain-link';
    link.href = `http://${route.domain}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = route.domain;
    const arrow = document.createElement('span');
    arrow.className = 'external';
    arrow.textContent = '↗';
    link.append(arrow);
    const subtitle = document.createElement('span');
    subtitle.className = 'domain-subtitle';
    subtitle.textContent = routeStatus.label;
    name.append(link, subtitle);
    domainWrap.append(routeIcon, name);
    domainCell.append(domainWrap);
    const upstreamCell = document.createElement('td');
    const code = document.createElement('code');
    code.className = 'upstream';
    code.textContent = route.upstream;
    upstreamCell.append(code);
    const activeCell = document.createElement('td');
    const toggle = document.createElement('button');
    toggle.className = 'switch';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(route.enabled));
    toggle.setAttribute('aria-label', `Habilitar ${route.domain}`);
    toggle.addEventListener('click', () => {
      route.enabled = !route.enabled;
      message('');
      render();
      $('route-list').querySelectorAll('.switch')[shownIndex(index)]?.focus();
    });
    activeCell.append(toggle);
    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(iconButton(`Editar ${route.domain}`, 'edit', () => openRoute(index)), iconButton(`Excluir ${route.domain}`, 'delete', async () => {
      if (await confirmAction('Excluir rota?', `A rota ${route.domain} será removida da lista. A exclusão será aplicada ao salvar.`, 'Excluir rota', true)) {
        routes.splice(index, 1);
        message('');
        render();
        $('add-route').focus();
      }
    }));
    actionsCell.append(actions);
    row.append(domainCell, upstreamCell, activeCell, actionsCell);
    $('route-list').append(row);
  });
  $('empty').hidden = !ready || shown > 0;
  $('empty-title').textContent = query ? 'Nenhuma rota encontrada.' : 'Nenhuma rota por aqui.';
  $('empty-description').textContent = query ? 'Tente buscar por outro domínio ou destino.' : 'Adicione seu primeiro projeto para começar.';
  $('total-count').textContent = ready ? routes.length : '—';
  $('active-count').textContent = ready ? routes.filter(route => route.enabled).length : '—';
  $('nav-count').textContent = ready ? routes.length : '—';
  updateControls();
}

function shownIndex(index) {
  const query = $('search').value.trim().toLowerCase();
  return routes.slice(0, index).filter(route => `${route.domain} ${route.upstream}`.toLowerCase().includes(query)).length;
}

async function load() {
  busy = true;
  updateControls();
  try {
    const data = await api('/api/config');
    routes = data.routes;
    revision = data.revision;
    savedRoutes = JSON.stringify(routes);
    routeStatuses.clear();
    routeStatusState = 'loading';
    ready = true;
    message('');
  } catch (error) { message(error.message); }
  finally {
    busy = false;
    $('loading').hidden = true;
    render();
    updateRouteStatuses();
  }
}

async function status() {
  let online = false;
  try { online = (await api('/api/status')).online; } catch { /* The offline state is shown below. */ }
  $('caddy-status').textContent = online ? 'Conectado' : 'Indisponível';
  $('caddy-status').classList.toggle('offline', !online);
  $('caddy-note').textContent = online ? 'Pronto para receber alterações' : 'Verifique o container do Caddy';
}

function openRoute(index = -1) {
  editing = index;
  const route = routes[index] || { domain: '', upstream: '', enabled: true };
  $('dialog-title').textContent = index < 0 ? 'Nova rota' : 'Editar rota';
  $('domain').value = route.domain;
  $('upstream').value = route.upstream;
  $('enabled').checked = route.enabled;
  $('form-error').hidden = true;
  $('route-dialog').showModal();
  $('domain').focus();
}

function confirmAction(title, description, label, danger = false) {
  return new Promise(resolve => {
    $('confirm-title').textContent = title;
    $('confirm-description').textContent = description;
    $('confirm-ok').textContent = label;
    $('confirm-ok').classList.toggle('danger', danger);
    const dialog = $('confirm-dialog');
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
    $('confirm-cancel').focus();
  });
}

$('confirm-cancel').addEventListener('click', () => $('confirm-dialog').close('cancel'));
$('confirm-ok').addEventListener('click', () => $('confirm-dialog').close('ok'));
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('add-route').addEventListener('click', () => openRoute());
$('search').addEventListener('input', render);
$('reload').addEventListener('click', async () => {
  if (!ready || !dirty() || await confirmAction('Descartar alterações?', 'As alterações ainda não aplicadas serão descartadas ao recarregar o Caddyfile.', 'Recarregar')) await load();
});
$('route-form').addEventListener('submit', async event => {
  event.preventDefault();
  const route = { domain: $('domain').value.trim().toLowerCase(), upstream: $('upstream').value.trim(), enabled: $('enabled').checked };
  const candidate = routes.map(route => ({ ...route }));
  if (editing < 0) candidate.push(route); else candidate[editing] = route;
  const button = event.submitter;
  button.disabled = true;
  try {
    await api('/api/preview', { method: 'POST', body: JSON.stringify({ routes: candidate }) });
    routes = candidate;
    $('route-dialog').close();
    message('');
    render();
  } catch (error) {
    $('form-error').textContent = error.message;
    $('form-error').hidden = false;
  } finally { button.disabled = false; }
});
$('preview').addEventListener('click', async () => {
  try {
    const data = await api('/api/preview', { method: 'POST', body: JSON.stringify({ routes }) });
    $('config-preview').textContent = data.caddyfile;
    $('preview-dialog').showModal();
  } catch (error) { message(error.message); }
});
$('save').addEventListener('click', async () => {
  busy = true;
  updateControls();
  message('');
  try {
    const data = await api('/api/config', { method: 'PUT', body: JSON.stringify({ routes, revision }) });
    routes = data.routes;
    revision = data.revision;
    savedRoutes = JSON.stringify(routes);
    message('Configuração salva e aplicada. Seus endereços já estão atualizados.', true);
  } catch (error) { message(error.message); }
  finally { busy = false; render(); status(); updateRouteStatuses(); }
});
window.addEventListener('beforeunload', event => { if (ready && dirty()) { event.preventDefault(); event.returnValue = ''; } });
load();
status();
setInterval(() => {
  if (!document.hidden && !busy) {
    status();
    updateRouteStatuses();
  }
}, 15000);
