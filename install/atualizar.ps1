<#
  Atualiza o Portal Financeiro Cinexpan para a versão mais nova do repositório:
    1. Para o serviço
    2. git pull (baixa as mudanças)
    3. npm install + build
    4. Reinicia o serviço

  Use após cada nova versão. Execute COMO ADMINISTRADOR
  (botão direito -> "Executar com o PowerShell").
#>
[CmdletBinding()]
param([string]$ServiceName = "CinexpanFinanceiro")

$ErrorActionPreference = "Stop"
function Info($m)  { Write-Host "[ OK ] $m" -ForegroundColor Green }
function Passo($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

$ehAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $ehAdmin) {
  Start-Process powershell -Verb RunAs -ArgumentList `
    "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

$RaizApp = Split-Path -Parent $PSScriptRoot
Set-Location $RaizApp
$nssm = Join-Path $PSScriptRoot "nssm.exe"

Passo "Parando o serviço"
if (Test-Path $nssm) { & $nssm stop $ServiceName 2>$null | Out-Null }

Passo "Baixando atualizações (git pull)"
& git pull
if ($LASTEXITCODE -ne 0) { Write-Host "Aviso: 'git pull' não concluiu. Continuando com o código atual." -ForegroundColor Yellow }

Passo "Instalando dependências e compilando"
& npm install
if ($LASTEXITCODE -ne 0) { throw "Falha no 'npm install'." }
& npm run build
if ($LASTEXITCODE -ne 0) { throw "Falha no 'npm run build'." }

Passo "Reiniciando o serviço"
if (Test-Path $nssm) {
  & $nssm start $ServiceName
} else {
  Start-Service $ServiceName
}
Info "Atualização concluída. Serviço reiniciado."
