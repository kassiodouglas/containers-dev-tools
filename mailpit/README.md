# Mailpit local

Servidor SMTP local para capturar e inspecionar e-mails durante o desenvolvimento. As mensagens não são entregues a destinatários reais.

## Pré-requisitos

- Docker Desktop iniciado;
- portas `1025` e `8025` livres.

## Primeiro uso

No PowerShell ou Git Bash:

```bash
docker compose config
docker compose up -d
docker compose ps
```

Abra a interface web em <http://localhost:8025>.

- SMTP: `localhost:1025`
- Interface web: `http://localhost:8025`
- Usuário e senha: não utilizados
- TLS: não utilizado

## Configurar a API Litwo

Quando a API roda diretamente no host, use no arquivo `api/.env`:

```env
MAIL_MAILER=smtp
MAIL_SCHEME=null
MAIL_HOST=127.0.0.1
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_EHLO_DOMAIN=localhost
```

Quando a API roda no `docker-compose.yml` do projeto, o serviço `api` já sobrescreve o host SMTP para `host.docker.internal`, permitindo que o container acesse o Mailpit publicado no host.

Após alterar variáveis de ambiente em uma aplicação Laravel com cache de configuração:

```bash
php artisan config:clear
```

Para acompanhar uma fila assíncrona da API:

```bash
php artisan queue:work
```

## Parar e apagar

Para parar sem apagar as mensagens:

```bash
docker compose stop
```

Para remover os containers mantendo o volume:

```bash
docker compose down
```

Para remover também as mensagens armazenadas — operação destrutiva:

```bash
docker compose down -v
```
