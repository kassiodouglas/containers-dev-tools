# Local Proxy — Caddy com painel local

URLs amigáveis para aplicações locais, com uma interface para gerenciar as rotas.

## Iniciar

Requisito: Docker Desktop com containers Linux e Docker Compose.

```bash
docker compose up -d --build
```

Abra **http://hosts.localhost**. O acesso direto por **http://localhost:2020** também continua disponível.

O painel permite:

- Adicionar, editar e excluir rotas HTTP.
- Ativar e desativar rotas sem perder seus dados.
- Buscar por domínio ou destino.
- Visualizar o Caddyfile antes de aplicar.
- Salvar e recarregar o Caddy pela interface.
- Consultar se a API do Caddy está acessível.

As alterações ficam como rascunho na tela até clicar em **Salvar e aplicar**.
**Recarregar** descarta o rascunho e lê novamente o arquivo, após confirmação.
O indicador “Conectado” verifica a comunicação com o Caddy; não verifica a saúde de cada aplicação de destino.

## Rotas iniciais

| Domínio | Destino |
| --- | --- |
| `http://app-starter.localhost` | `host.docker.internal:8080` |
| `http://tool-keycloak.localhost` | `host.docker.internal:9090` |
| `http://hosts.localhost` | `local-caddy-panel:2020` |

Para uma aplicação na máquina host, use `host.docker.internal:PORTA`.
Para um container na rede `local-network`, use `nome-container:PORTA_INTERNA`.
Os domínios `.localhost` funcionam localmente sem editar o arquivo `hosts` nos navegadores modernos.
Outros domínios exigem resolução DNS/hosts configurada por você.

## Persistência e aplicação

O `Caddyfile` da raiz é a fonte da configuração. Os dois containers montam esse mesmo arquivo;
o Caddy o lê e o painel tem acesso de escrita. As rotas desativadas ficam em comentários
`# local-proxy-disabled:` no próprio arquivo. Não há um banco separado de rotas.

Ao salvar, o painel:

1. Valida os campos, domínios duplicados e se o arquivo mudou desde a abertura da tela.
2. Solicita ao Caddy a adaptação da configuração.
3. Guarda a versão anterior em `/data/Caddyfile.backup`, no volume `panel_data`.
4. Grava o arquivo e solicita a aplicação pela API do Caddy, que também valida a configuração ao carregá-la.
5. Em caso de falha na gravação ou aplicação, tenta restaurar o arquivo e a configuração anterior e informa o resultado.

A gravação preserva o mesmo arquivo montado pelos containers. O backup permite recuperação
manual em caso de interrupção abrupta durante a gravação. Para copiar o backup ao host:

```bash
docker compose cp panel:/data/Caddyfile.backup ./Caddyfile.backup
```

Inspecione o backup antes de substituir o `Caddyfile`. Depois valide e recarregue com os comandos abaixo.
O backup é substituído a cada tentativa de aplicação que chega à etapa de gravação; não é um histórico de versões.

O painel gerencia **rotas HTTP com um `reverse_proxy` por domínio**. HTTPS, caminhos,
balanceamento e outras diretivas avançadas ainda não fazem parte do formulário.
Se o arquivo contiver diretivas não suportadas, o painel bloqueia a edição para preservar o conteúdo.
Comentários comuns podem ser substituídos ao salvar. Evite editar o arquivo manualmente enquanto aplica mudanças pelo painel.

## Acesso local

O painel é publicado apenas em `127.0.0.1:2020`, sem autenticação, para uso na sua máquina.
O domínio `hosts.localhost` chega ao painel pela porta 80 do Caddy e pela rede Docker compartilhada.
Essa rota acompanha a exposição de rede do Caddy; o nome `.localhost` não é um controle de acesso.
Ele verifica Host e Origin nas requisições. Não publique essa porta na rede sem adicionar autenticação.

A API administrativa do Caddy usa um socket Unix em um volume compartilhado apenas pelos
dois serviços. Não há porta administrativa exposta nem acesso ao socket do Docker.
As portas 80 e 443 do proxy continuam publicadas como na configuração original.

## Rede Docker compartilhada

O Compose cria a rede `local-network`. Para conectar outro projeto, acrescente ao Compose dele:

```yaml
services:
  app:
    # imagem, portas e demais configurações da aplicação
    networks:
      - local-network

networks:
  local-network:
    external: true
```

Inicie este projeto antes das aplicações que usam a rede externa. Cadastre no painel
o domínio e um destino como `app:8080`. Use nomes únicos para os serviços ou aliases na rede compartilhada.

## Comandos

```bash
# Iniciar ou reconstruir o painel depois de alterações no código
docker compose up -d --build

# Status e logs
docker compose ps
docker compose logs -f caddy panel

# Validar uma edição manual no arquivo
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile

# Aplicar uma edição manual usando o socket administrativo interno
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --address unix//run/caddy-admin/admin.sock

# Reiniciar sem apagar a configuração
docker compose restart

# Parar (mantém os volumes e o Caddyfile)
docker compose down
```

## Desenvolvimento

O painel usa Node.js e HTML/CSS/JavaScript, sem dependências npm de runtime.

```bash
cd panel
npm test
```

Os testes usam o runner nativo do Node (20+) e simulam a API do Caddy para verificar
validação, persistência, conflitos, rollback e proteção das requisições locais.
Para executá-los sem subprocessos: `node test/panel.test.mjs`.

```text
local-proxy/
├── Caddyfile
├── docker-compose.yml
├── README.md
└── panel/
    ├── Dockerfile
    ├── package.json
    ├── config.mjs
    ├── server.mjs
    ├── public/
    └── test/
```

Referências: [API do Caddy](https://caddyserver.com/docs/api) e
[socket administrativo](https://caddyserver.com/docs/caddyfile/options#admin).
