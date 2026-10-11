[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'password')]
    [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'

function Invoke-Compose {
    param([string[]]$ComposeArguments)

    & docker compose --project-directory $PSScriptRoot -f (Join-Path $PSScriptRoot 'compose.yaml') @ComposeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose falhou (codigo $LASTEXITCODE)."
    }
}

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker nao encontrado. Instale e inicie o Docker Desktop com containers Linux.'
    }

    & docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose indisponivel. Instale o plugin Docker Compose v2.'
    }

    $dockerOs = & docker info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel acessar o Docker. Inicie o Docker Desktop e tente novamente.'
    }
    if ($dockerOs -ne 'linux') {
        throw 'Configure o Docker Desktop para usar containers Linux.'
    }

    switch ($Action) {
        'start' {
            Invoke-Compose -ComposeArguments @('up', '-d', '--wait', '--wait-timeout', '240')
            Write-Host 'Jenkins pronto. Endereco publicado:'
            Invoke-Compose -ComposeArguments @('port', 'jenkins', '8080')
            Write-Host 'Abra esse endereco com http:// no navegador.'
            Write-Host 'No primeiro acesso, obtenha a senha com: .\jenkins.ps1 password'
        }
        'stop' {
            Invoke-Compose -ComposeArguments @('stop')
            Write-Host 'Jenkins parado. Os dados foram preservados.'
        }
        'restart' {
            Invoke-Compose -ComposeArguments @('restart', 'jenkins')
            Invoke-Compose -ComposeArguments @('up', '-d', '--wait', '--wait-timeout', '240')
            Write-Host 'Jenkins reiniciado e pronto.'
        }
        'status' {
            Invoke-Compose -ComposeArguments @('ps', '--all')
        }
        'logs' {
            Invoke-Compose -ComposeArguments @('logs', '--follow', '--tail', '100', 'jenkins')
        }
        'password' {
            Invoke-Compose -ComposeArguments @('exec', '-T', 'jenkins', 'cat', '/var/jenkins_home/secrets/initialAdminPassword')
        }
    }
}
catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
