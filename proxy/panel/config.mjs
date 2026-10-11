import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export const ADMIN = 'unix//run/caddy-admin/admin.sock';
export const revision = text => createHash('sha256').update(text).digest('hex');

export class PanelError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateRoutes(routes) {
  if (!Array.isArray(routes) || routes.length > 200) {
    throw new PanelError('Informe uma lista de até 200 rotas.');
  }
  const domains = new Set();
  return routes.map((route, index) => {
    if (!route || typeof route.domain !== 'string' || typeof route.upstream !== 'string' || typeof route.enabled !== 'boolean') {
      throw new PanelError(`Rota ${index + 1}: dados inválidos.`);
    }
    const domain = route.domain.trim().toLowerCase();
    const upstream = route.upstream.trim();
    const labels = domain.split('.');
    if (domain.length > 253 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      throw new PanelError(`Domínio inválido: use um nome como app.localhost, sem http:// ou caminho.`);
    }
    if (domains.has(domain)) throw new PanelError(`O domínio ${domain} está duplicado.`);
    domains.add(domain);
    const target = /^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9][a-zA-Z0-9._-]*):(\d{1,5})$/.exec(upstream);
    if (!target || upstream.length > 260 || Number(target[2]) < 1 || Number(target[2]) > 65535 || (target[1].startsWith('[') && isIP(target[1].slice(1, -1)) !== 6)) {
      throw new PanelError(`Destino de ${domain} inválido: use host:porta, como host.docker.internal:8080.`);
    }
    return { domain, upstream, enabled: route.enabled };
  });
}

export function renderConfig(input) {
  const routes = validateRoutes(input);
  const blocks = routes.map(route => route.enabled
    ? `http://${route.domain} {\n    reverse_proxy ${route.upstream}\n}`
    : `# local-proxy-disabled: ${JSON.stringify(route)}`);
  return `# Gerenciado pelo painel Local Proxy.\n{\n    admin ${ADMIN}\n}\n\n${blocks.join('\n\n')}\n`;
}

// Only import the subset the form can preserve. Unknown directives must never
// disappear silently when a user saves through the panel.
export function parseConfig(text) {
  const routes = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const body = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# local-proxy-disabled:')) {
      try {
        const route = JSON.parse(trimmed.slice('# local-proxy-disabled:'.length));
        if (route.enabled !== false) throw new Error();
        routes.push(route);
      } catch {
        throw new PanelError('Há uma rota desativada inválida no Caddyfile.', 422);
      }
    } else if (!trimmed.startsWith('#')) {
      body.push(line.replace(/\s+#.*$/, ''));
    }
  }
  let remaining = body.join('\n').trim();
  remaining = remaining.replace(/^\{\s*admin\s+unix\/\/run\/caddy-admin\/admin\.sock\s*\}\s*/, '');
  const block = /^http:\/\/([^\s{}]+)\s*\{\s*reverse_proxy\s+([^\s{}]+)\s*\}\s*/;
  while (remaining) {
    const match = block.exec(remaining);
    if (!match) {
      throw new PanelError('Este Caddyfile contém diretivas que o painel não consegue editar. São suportadas rotas HTTP com um reverse_proxy por domínio. O arquivo foi preservado.', 422);
    }
    routes.push({ domain: match[1], upstream: match[2], enabled: true });
    remaining = remaining.slice(match[0].length);
  }
  return validateRoutes(routes).sort((a, b) => a.domain.localeCompare(b.domain));
}
