# Jenkins local em Docker

Ambiente local com Jenkins LTS e Java 21, volume persistente e verificação de saúde. A interface fica disponível apenas nesta máquina, por padrão em http://localhost:8765.

## Requisitos

- Docker Desktop iniciado, configurado para containers Linux (no Windows, pode usar WSL 2).
- Docker Compose v2 com suporte a `up --wait`.
- PowerShell 5.1 ou superior para usar o script auxiliar.

## Iniciar

Na pasta do projeto, execute:

```powershell
.\jenkins.ps1 start
```

O comando baixa a imagem no primeiro uso, cria o container e aguarda o Jenkins ficar disponível. O download inicial pode demorar alguns minutos.

Se a política do PowerShell bloquear o script, execute em um processo separado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\jenkins.ps1 start
```

Abra http://localhost:8765 e obtenha a senha de desbloqueio:

```powershell
.\jenkins.ps1 password
```

Cole a senha na tela inicial, instale os plugins sugeridos e crie seu usuário administrador. O comando `password` mostra a senha inicial de instalação; depois da configuração, use as credenciais do administrador criado.

## Gerenciar

```powershell
.\jenkins.ps1 status
.\jenkins.ps1 logs
.\jenkins.ps1 stop
.\jenkins.ps1 start
.\jenkins.ps1 restart
```

Use `Ctrl+C` para sair dos logs. O container continua rodando.

O script também pode ser chamado a partir de outra pasta: ele sempre usa a configuração localizada ao lado de `jenkins.ps1`.

## Usar diretamente com Docker Compose

No Windows, Linux ou macOS, execute na pasta do projeto:

```sh
docker compose up -d --wait --wait-timeout 240
docker compose exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
docker compose ps
docker compose logs -f --tail 100 jenkins
docker compose stop
```

## Alterar a porta

```powershell
Copy-Item .env.example .env
```

Edite `JENKINS_PORT` no arquivo `.env`, por exemplo para `8081`, e execute novamente `start`. Acesse então http://localhost:8081. Variáveis de ambiente do terminal têm precedência sobre o arquivo `.env`.

## Persistência

Jobs, plugins, usuários e configurações ficam no volume Docker `local-jenkins_jenkins_home`, montado em `/var/jenkins_home`. Parar, reiniciar ou recriar o container preserva esses dados.

Para remover o container e a rede preservando o volume:

```sh
docker compose down
```

`docker compose down -v` também apaga o volume e todos os dados do Jenkins.

## Solução de problemas

- **Docker indisponível:** inicie o Docker Desktop e aguarde o mecanismo ficar pronto.
- **Porta ocupada:** altere `JENKINS_PORT` conforme descrito acima.
- **Tempo de inicialização excedido:** consulte `logs` e `status`. O container pode continuar inicializando; execute `start` novamente para aguardar.
- **Senha inicial indisponível:** aguarde a inicialização. Se o Jenkins já foi configurado, entre com seu usuário administrador.

O ambiente mantém o assistente inicial e a autenticação do Jenkins. Agentes remotos podem usar WebSocket; a porta TCP 50000 não é publicada. Pipelines que precisem de ferramentas adicionais, como Docker ou SDKs, exigem agentes ou imagens preparados para essas ferramentas.

Referência: [documentação oficial do Jenkins em Docker](https://www.jenkins.io/doc/book/installing/docker/).
