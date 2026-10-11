'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {URL} = require('node:url');
const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '127.0.0.1';
const SONAR_URL = process.env.SONAR_URL || 'http://localhost:9002';
function allowsHttp(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (['localhost','host.docker.internal','::1'].includes(host) || !host.includes('.')) return true;
  const parts = host.split('.').map(Number);
  if (parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  }
  return /^(fc|fd|fe8|fe9|fea|feb)/.test(host);
}
function parseSonarUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw Error('Formato inválido');
  if (parsed.protocol === 'http:' && !allowsHttp(parsed.hostname)) throw Error('Use HTTPS para SonarQube público');
  return parsed;
}
let sonar;
try {
  sonar = parseSonarUrl(SONAR_URL);
} catch (e) { console.error('SONAR_URL inválida. Use HTTP localhost ou HTTPS remoto.', e.message); process.exit(1); }
const allowed = new Set(['/api/qualitygates/project_status', '/api/issues/search']);
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); return res.end(html);}
  if (req.method === 'GET' && url.pathname === '/config') {res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({sonarUrl:sonar.href.replace(/\/$/,'')}));}
  if (req.method !== 'GET' || !url.pathname.startsWith('/proxy/')) {res.writeHead(404); return res.end('Não encontrado');}
  const apiPath = url.pathname.slice('/proxy'.length);
  if (!allowed.has(apiPath)) {res.writeHead(403); return res.end('Endpoint não permitido');}
  const auth = req.headers.authorization;
  if (!auth || !/^(Bearer|Basic) [A-Za-z0-9+/_=:.\-]+$/i.test(auth)) {res.writeHead(401); return res.end('Token ausente ou inválido');}
  let requestSonar = sonar;
  if (req.headers['x-sonar-url']) {
    try { requestSonar = parseSonarUrl(String(req.headers['x-sonar-url'])); }
    catch (e) {res.writeHead(400); return res.end(`URL do ambiente inválida: ${e.message}`);}
  }
  const target = new URL(requestSonar.href);
  target.pathname = `${sonar.pathname.replace(/\/$/,'')}${apiPath}`;
  target.search = url.search;
  if (apiPath === '/api/issues/search') {
    target.searchParams.set('issueStatuses', 'OPEN,CONFIRMED');
    target.searchParams.set('impactSoftwareQualities', 'RELIABILITY');
    target.searchParams.set('sinceLeakPeriod', 'true');
    target.searchParams.set('s', 'IMPACT_RANK');
    target.searchParams.set('asc', 'false');
    target.searchParams.delete('resolved');
  }
  try {
    const response = await fetch(target, {headers:{Authorization:auth,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)});
    const body = await response.text();
    if (body.length > 12_000_000) {res.writeHead(502);return res.end('Resposta grande demais');}
    res.writeHead(response.status, {'Content-Type':'application/json; charset=utf-8'});
    res.end(body);
  } catch(e) {res.writeHead(502, {'Content-Type':'application/json'});res.end(JSON.stringify({error:'Não foi possível acessar o SonarQube',detail:e.message}));}
});
server.listen(PORT,HOST,()=>console.log(`Dashboard: http://${HOST}:${PORT} | SonarQube: ${sonar.href}`));
