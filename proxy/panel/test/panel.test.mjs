import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import { createPanel } from '../server.mjs';
import { parseConfig, renderConfig, validateRoutes, revision } from '../config.mjs';

const original = 'http://app-starter.localhost {\n reverse_proxy host.docker.internal:8080\n}\n';
const sample = [{ domain: 'api.localhost', upstream: 'backend:3000', enabled: true }];

async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'local-proxy-test-'));
  const configPath = join(dir, 'Caddyfile');
  const backupPath = join(dir, 'Caddyfile.backup');
  await writeFile(configPath, original);
  const calls = [];
  const server = createPanel({ configPath, backupPath, adminRequest: async (...args) => { calls.push(args); return '{}'; }, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    await rm(dir, { recursive: true, force: true });
  });
  const request = (path, method = 'GET', data, headers = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { request, base, configPath, backupPath, calls };
}

test('imports current routes and preserves disabled routes after a round trip', () => {
  assert.equal(parseConfig(original)[0].upstream, 'host.docker.internal:8080');
  const routes = [...sample, { domain: 'off.localhost', upstream: '[::1]:8080', enabled: false }];
  assert.deepEqual(parseConfig(renderConfig(routes)), routes);
  assert.deepEqual(parseConfig(renderConfig([])), []);
});

test('refuses unsupported directives instead of deleting manual configuration', () => {
  assert.throws(() => parseConfig('http://app.localhost {\n reverse_proxy app:80\n encode gzip\n}'), /diretivas/);
  assert.throws(() => parseConfig('{ admin :2019 }\n' + original), /diretivas/);
});

test('rejects duplicate domains, invalid ports and Caddyfile injection', () => {
  assert.throws(() => validateRoutes([...sample, { ...sample[0], domain: 'API.LOCALHOST' }]), /duplicado/);
  for (const domain of ['http://app.localhost', 'app.localhost/path', 'app.localhost\n}', '-app.localhost', 'app..localhost']) {
    assert.throws(() => validateRoutes([{ ...sample[0], domain }]));
  }
  for (const upstream of ['app:0', 'app:65536', 'app:80\nrespond hacked', 'app:80 {', '{env.SECRET}:80', '[:::]:80']) {
    assert.throws(() => validateRoutes([{ ...sample[0], upstream }]));
  }
});

test('loads the actual Caddyfile and renders a preview without modifying it', async t => {
  const f = await fixture(t);
  const config = await (await f.request('/api/config')).json();
  assert.equal(config.revision, revision(original));
  const preview = await (await f.request('/api/preview', 'POST', { routes: sample })).json();
  assert.match(preview.caddyfile, /reverse_proxy backend:3000/);
  assert.equal(await readFile(f.configPath, 'utf8'), original);
  assert.equal(f.calls.length, 0);
});

test('reports availability for enabled route destinations', async t => {
  const checked = [];
  const f = await fixture(t, { probeRoute: async route => {
    checked.push(route.upstream);
    return route.upstream.endsWith(':8080');
  } });
  const response = await f.request('/api/routes/status');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { routes: [{
    domain: 'app-starter.localhost',
    upstream: 'host.docker.internal:8080',
    online: true,
  }] });
  assert.deepEqual(checked, ['host.docker.internal:8080']);
});

test('saves, backs up, reloads Caddy and persists routes across panel restarts', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/config', 'PUT', { routes: sample, revision: revision(original) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.routes, sample);
  assert.equal(await readFile(f.configPath, 'utf8'), renderConfig(sample));
  assert.equal(await readFile(f.backupPath, 'utf8'), original);
  assert.deepEqual(f.calls.map(call => call[0]), ['/adapt', '/load']);
  assert.equal(result.revision, revision(renderConfig(sample)));
  // No in-memory state or separate routes database is required to read it back.
  assert.deepEqual(parseConfig(await readFile(f.configPath, 'utf8')), sample);
});

test('detects a stale revision without touching disk or Caddy', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/config', 'PUT', { routes: sample, revision: 'stale' });
  assert.equal(response.status, 409);
  assert.equal(await readFile(f.configPath, 'utf8'), original);
  assert.equal(f.calls.length, 0);
});

test('does not modify the file when Caddy is unreachable during validation', async t => {
  const f = await fixture(t, { adminRequest: async () => { throw Object.assign(new Error('offline'), { status: 503 }); } });
  const response = await f.request('/api/config', 'PUT', { routes: sample, revision: revision(original) });
  assert.equal(response.status, 503);
  assert.equal(await readFile(f.configPath, 'utf8'), original);
  assert.deepEqual(await (await f.request('/api/status')).json(), { online: false });
});

test('restores file and running config if reload times out or is rejected', async t => {
  const loaded = [];
  const f = await fixture(t, { adminRequest: async (path, method, body) => {
    if (path === '/load') {
      loaded.push(body);
      if (loaded.length === 1) throw new Error('timeout');
    }
    return '{}';
  } });
  const response = await f.request('/api/config', 'PUT', { routes: sample, revision: revision(original) });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /restaurada/);
  assert.equal(await readFile(f.configPath, 'utf8'), original);
  assert.deepEqual(loaded, [renderConfig(sample), original]);
});

test('restores a partially written file if persistence fails', async t => {
  let writes = 0;
  const f = await fixture(t, { persistFile: async (path, text) => {
    if (++writes === 1) { await writeFile(path, 'partial'); throw new Error('write failed'); }
    await writeFile(path, text);
  } });
  const response = await f.request('/api/config', 'PUT', { routes: sample, revision: revision(original) });
  assert.equal(response.status, 502);
  assert.equal(await readFile(f.configPath, 'utf8'), original);
  assert.deepEqual(f.calls.map(call => call[0]), ['/adapt']);
});

test('rejects simultaneous saves while the first is validating', async t => {
  let started;
  let release;
  const entered = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { adminRequest: async path => { if (path === '/adapt') { started(); await blocked; } return '{}'; } });
  const body = { routes: sample, revision: revision(original) };
  const first = f.request('/api/config', 'PUT', body);
  await entered;
  try { assert.equal((await f.request('/api/config', 'PUT', body)).status, 409); }
  finally { release(); }
  assert.equal((await first).status, 200);
});

test('rejects foreign origins, hostile hosts and non-JSON mutations', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/config', 'PUT', {}, { Origin: 'https://evil.example' })).status, 403);
  const hostileHostStatus = await new Promise((resolve, reject) => {
    http.get(f.base + '/api/config', { headers: { Host: 'evil.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(hostileHostStatus, 403);
  assert.equal((await f.request('/api/config', 'PUT', {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.request('/api/config', 'PUT', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(f.calls.length, 0);
});

test('serves the UI with restrictive headers and no filesystem traversal', async t => {
  const f = await fixture(t);
  const response = await f.request('/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Seus projetos, por nome/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await f.request('/server.mjs')).status, 404);
});

test('accepts the panel hostname with its own origin and rejects other hosts and origins', async t => {
  const f = await fixture(t);
  async function preview(host, origin) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ routes: sample });
      const request = http.request(f.base + '/api/preview', {
        method: 'POST',
        headers: { Host: host, Origin: origin, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject);
      request.end(body);
    });
  }
  assert.equal(await preview('hosts.localhost', 'http://hosts.localhost'), 200);
  assert.equal(await preview('hosts.localhost', 'http://evil.localhost'), 403);
  assert.equal(await preview('evil.localhost', 'http://evil.localhost'), 403);
  assert.equal(await preview('hosts.localhost.evil.example', 'http://hosts.localhost.evil.example'), 403);
});
