# Containers Dev Tools

Ambiente local de ferramentas de desenvolvimento, orquestrado com Docker Compose.

## Serviços

| Serviço | Endereço | Descrição |
| --- | --- | --- |
| Proxy e painel | [http://hosts.localhost](http://hosts.localhost) | Caddy e painel para gerenciar os hosts locais. |
| Mailpit | [http://mail.localhost](http://mail.localhost) | Caixa de entrada para e-mails enviados em desenvolvimento. |
| Jenkins | [http://jenkins.localhost](http://jenkins.localhost) | Servidor de integração contínua. |
| SonarQube | [http://sonar.localhost](http://sonar.localhost) | Análise de qualidade de código. |
| Painel SonarQube | [http://sonar-panel.localhost](http://sonar-panel.localhost) | Painel complementar do SonarQube. |
| Redis | `localhost:6379` | Banco de dados em memória protegido por senha, com persistência AOF. |
| RedisInsight | [http://localhost:8001](http://localhost:8001) | Interface gráfica para visualizar e administrar o Redis. |

As portas expostas diretamente são `80` e `443` para o proxy, `1025` e `8025` para o Mailpit, `8765` para o Jenkins, `9002` para o SonarQube, `3100` para o painel do SonarQube, `6379` para o Redis e `8001` para o RedisInsight.

## Pré-requisitos

- Docker Desktop (ou Docker Engine) em execução;
- Docker Compose v2 com suporte a `include`.

## Início rápido

1. Opcionalmente, personalize a porta do Jenkins:

   ```powershell
   Copy-Item jenkins/.env.example jenkins/.env
   ```

2. Inicie todos os serviços:

   ```powershell
   docker compose up -d --build
   ```

3. Confira o estado dos containers:

   ```powershell
   docker compose ps
   ```

Para acompanhar os logs, execute `docker compose logs -f`. Para parar o ambiente, use `docker compose down`.

### Redis

Crie `redis/.env` a partir do exemplo e informe uma senha segura:

```powershell
Copy-Item redis/.env.example redis/.env
```

Enquanto o Redis não estiver incluído no compose raiz, inicie-o pelo arquivo próprio:

```powershell
docker compose --env-file redis/.env -f redis/docker-compose.yml up -d
```

No RedisInsight, crie uma conexão usando host `redis`, porta `6379` e a senha definida em `REDIS_PASSWORD`.

## Configuração

- `jenkins/.env`: permite alterar `JENKINS_PORT` (padrão: `8765`).
- `redis/.env`: define `REDIS_PASSWORD`. Esse arquivo não é versionado; parta de `redis/.env.example`.
- `SONAR_DB_PASSWORD`: pode ser definida no ambiente antes de subir os serviços; o valor padrão é `sonar`.
- `proxy/Caddyfile`: concentra os domínios `*.localhost` e seus destinos. Edite-o para registrar novos serviços locais.

Os dados dos serviços são mantidos em volumes Docker. O comando `docker compose down` não os remove; use `docker compose down -v` somente quando quiser apagar os dados persistidos.
