# SonarQube Quality Inspector — Proxy local

Requer **Node.js 18+**. Sem npm install ou dependências externas.

## Windows (PowerShell)

```powershell
cd sonarqube-local
$env:SONAR_URL="http://localhost:9002"
node server.js
```

Acesse **http://127.0.0.1:3100**. Na primeira aba, cadastre ambientes como Local, Homologação e Produção, cada um com sua URL e token. Na segunda, cadastre os projetos. Na terceira, escolha o projeto e clique em **BUSCAR**. O último ambiente selecionado permanece ativo.

Para mudar a porta: `$env:PORT="3200"` antes de iniciar.

## Como funciona

O navegador acessa `/proxy/api/qualitygates/project_status` e `/proxy/api/issues/search` na mesma origem da página. Ambientes, tokens, projetos e a seleção ativa ficam no `localStorage`. A cada consulta, o Node encaminha a requisição para a URL do ambiente ativo e não grava nem registra o token. O proxy escuta apenas `127.0.0.1` e aceita somente os dois endpoints necessários.

**Segurança:** não publique este servidor na internet. HTTP é aceito para localhost, nomes internos e redes privadas; para endereços públicos use HTTPS. Não coloque o token no código ou em URLs. Se SonarQube estiver em Docker, confirme que a URL cadastrada pode ser acessada pelo container do painel. A opção de New Code segue o período configurado no SonarQube, não necessariamente apenas a última execução.

## Iniciar com duplo clique no Windows

Execute `iniciar.bat` (Node.js 18+ instalado). O script usa `http://localhost:9002` como URL inicial sugerida e porta `3100`. Para alterar os padrões, edite o BAT ou configure as variáveis `SONAR_URL` e `PORT`.

## Iniciar com Docker Compose

Na pasta do projeto execute:

```bash
docker compose up -d --build
```

Acesse `http://localhost:3100`. O Compose sugere `http://host.docker.internal:9002` para alcançar o SonarQube publicado no host. As URLs salvas precisam ser acessíveis a partir do container do painel.

Para encerrar: `docker compose down`. Logs: `docker compose logs -f`. O dashboard só publica a porta no loopback do host. Não exponha o proxy na internet.
