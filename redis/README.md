# Redis

Compose para rodar uma instância local do Redis 7.

## Uso

```bash
docker compose up -d
```

A senha de acesso fica definida na variável `REDIS_PASSWORD` do arquivo `.env` (não versionado). Use `.env.example` como referência e ajuste a senha antes de subir em qualquer ambiente compartilhado.

Para conectar via `redis-cli`:

```bash
docker exec -it redis redis-cli -a <senha>
```

Dados persistidos no volume `redis-data` (AOF habilitado).

## RedisInsight (UI web)

Acesse em [http://localhost:8001](http://localhost:8001) para navegar visualmente pelas chaves do Redis.

Na primeira vez, adicione a conexão com:
- Host: `redis` (nome do serviço no compose, acessível pela rede interna)
- Port: `6379`
- Password: valor de `REDIS_PASSWORD` no `.env`
