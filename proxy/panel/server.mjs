import http from 'node:http';
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect } from 'node:net';
import { PanelError, parseConfig, renderConfig, revision, validateRoutes } from './config.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const MAX_BODY = 128 * 1024;

export function requestAdmin(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath: process.env.CADDY_ADMIN_SOCKET || '/run/caddy-admin/admin.sock',
      path, method,
      headers: { Host: 'localhost', ...(body === undefined ? {} : { 'Content-Type': 'text/caddyfile', 'Content-Length': Buffer.byteLength(body) }) },
    }, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        data += chunk;
        if (data.length > 2 * 1024 * 1024) response.destroy(new Error('Resposta do Caddy muito grande.'));
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode >= 400) reject(new PanelError(`Caddy recusou a configuração: ${data.slice(0, 3000)}`, 422));
        else resolve(data);
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error('O Caddy não respondeu em 10 segundos.')));
    request.on('error', reject);
    request.end(body);
  });
}

export function probeUpstream(route, timeout = 2000) {
  const match = /^(\[[0-9a-fA-F:]+\]|[^:]+):(\d+)$/.exec(route.upstream);
  if (!match) return Promise.resolve(false);
  const host = match[1].startsWith('[') ? match[1].slice(1, -1) : match[1];
  const port = Number(match[2]);
  return new Promise(resolve => {
    let settled = false;
    const socket = connect({ host, port });
    const finish = online => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(online);
    };
    socket.setTimeout(timeout, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new PanelError('Envie application/json.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new PanelError('A configuração excedeu o tamanho permitido.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PanelError('JSON inválido.'); }
}

// Preserve the inode: Caddy and the panel bind-mount the same host file.
async function persist(path, content) {
  const file = await open(path, 'r+');
  try {
    await file.writeFile(content, 'utf8');
    await file.truncate(Buffer.byteLength(content));
    await file.sync();
  } finally { await file.close(); }
}

export function createPanel({
  configPath = process.env.CADDYFILE_PATH || '/etc/caddy/Caddyfile',
  backupPath = process.env.BACKUP_PATH || '/data/Caddyfile.backup',
  adminRequest = requestAdmin,
  persistFile = persist,
  probeRoute = probeUpstream,
} = {}) {
  let saving = false;
  const send = (response, status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  };
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      // Accept only the explicit panel hostname and loopback hosts. Keep the
      // Origin check even when requests arrive through the reverse proxy.
      const host = request.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\]|hosts\.localhost)(?::\d+)?$/.test(host)) throw new PanelError('Acesse o painel por localhost ou hosts.localhost.', 403);
      if (request.headers.origin && request.headers.origin !== `http://${host}`) throw new PanelError('Origem não permitida.', 403);
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new PanelError('Origem não permitida.', 403);
      const path = new URL(request.url, `http://${host}`).pathname;
      if (request.method === 'GET' && path === '/health') return send(response, 200, { ok: true });
      if (request.method === 'GET' && path === '/api/status') {
        try {
          await adminRequest('/config/');
          return send(response, 200, { online: true });
        } catch { return send(response, 200, { online: false }); }
      }
      if (request.method === 'GET' && path === '/api/routes/status') {
        if (saving) throw new PanelError('Uma configuração está sendo aplicada. Tente novamente.', 409);
        const routes = parseConfig(await readFile(configPath, 'utf8')).filter(route => route.enabled);
        const statuses = await Promise.all(routes.map(async route => ({
          domain: route.domain,
          upstream: route.upstream,
          online: await probeRoute(route),
        })));
        return send(response, 200, { routes: statuses });
      }
      if (request.method === 'GET' && path === '/api/config') {
        if (saving) throw new PanelError('Uma configuração está sendo aplicada. Tente novamente.', 409);
        const text = await readFile(configPath, 'utf8');
        return send(response, 200, { routes: parseConfig(text), revision: revision(text), caddyfile: text });
      }
      if (request.method === 'POST' && path === '/api/preview') {
        const body = await readJson(request);
        return send(response, 200, { caddyfile: renderConfig(body?.routes) });
      }
      if (request.method === 'PUT' && path === '/api/config') {
        const body = await readJson(request);
        const routes = validateRoutes(body?.routes);
        if (saving) throw new PanelError('Outra alteração está sendo aplicada. Tente novamente.', 409);
        saving = true;
        try {
          const previous = await readFile(configPath, 'utf8');
          if (body.revision !== revision(previous)) throw new PanelError('O Caddyfile mudou desde a abertura da tela. Recarregue as rotas antes de salvar.', 409);
          parseConfig(previous);
          const next = renderConfig(routes);
          // Adapt before touching disk. /load then performs full provisioning
          // validation and keeps the old running config if Caddy rejects it.
          await adminRequest('/adapt', 'POST', next);
          await mkdir(dirname(backupPath), { recursive: true });
          await writeFile(backupPath, previous, 'utf8');
          if (revision(await readFile(configPath, 'utf8')) !== body.revision) throw new PanelError('O arquivo foi alterado durante a validação. Recarregue as rotas.', 409);
          let loadAttempted = false;
          try {
            await persistFile(configPath, next);
            loadAttempted = true;
            await adminRequest('/load', 'POST', next);
          } catch (error) {
            try {
              await persistFile(configPath, previous);
              // Also restore runtime on timeouts: /load may have succeeded even
              // if its response never reached us.
              if (loadAttempted) await adminRequest('/load', 'POST', previous);
            } catch (rollbackError) {
              console.error('Falha ao restaurar configuração:', rollbackError);
              throw new PanelError('Falha ao aplicar e confirmar a restauração. O backup está em /data/Caddyfile.backup no container do painel. Verifique os logs antes de continuar.', 503);
            }
            throw new PanelError(`Alteração não aplicada; configuração anterior restaurada. ${error.message}`, 502);
          }
          return send(response, 200, { routes: parseConfig(next), revision: revision(next), caddyfile: next });
        } finally { saving = false; }
      }
      const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/status.css': ['status.css', 'text/css; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      if (request.method === 'GET' && assets[path]) {
        const [file, type] = assets[path];
        const content = await readFile(join(publicDir, file));
        response.writeHead(200, { 'Content-Type': type });
        return response.end(content);
      }
      send(response, 404, { error: 'Recurso não encontrado.' });
    } catch (error) {
      if (!error.status) console.error(error);
      send(response, error.status || 503, { error: error.status ? error.message : 'Não foi possível acessar o Caddy ou o arquivo de configuração. Verifique se os containers estão em execução.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPanel();
  server.requestTimeout = 15000;
  server.listen(Number(process.env.PORT || 2020), '0.0.0.0', () => console.log('Local Proxy disponível na porta ' + (process.env.PORT || 2020)));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
