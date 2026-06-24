<#
  Remove o serviço do Windows e a regra de firewall do Portal Financeiro.
  NÃO apaga o banco de dados nem o Node/PostgreSQL — só o serviço da aplicação.
  Execute COMO ADMINISTRADOR.
#>
[CmdletBinding()]
param(
  [string]$ServiceName = "CinexpanFinanceiro",
  [int]$Porta = 3000
)

$ErrorActionPreference = "SilentlyContinue"
function Info($m) { Write-Host "[ OK ] $m" -ForegroundColor Green }

$ehAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $ehAdmin) {
  Start-Process powershell -Verb RunAs -ArgumentList `
    "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

$nssm = Join-Path $PSScriptRoot "nssm.exe"
if (Test-Path $nssm) {
  & $nssm stop $ServiceName
  & $nssm remove $ServiceName confirm
  Info "Serviço '$ServiceName' removido."
} else {
  Stop-Service $ServiceName -Force
  sc.exe delete $ServiceName | Out-Null
  Info "Serviço '$ServiceName' removido (sc.exe)."
}

Remove-NetFirewallRule -DisplayName "Cinexpan Financeiro ($Porta)"
Info "Regra de firewall removida."

Write-Host "`nPronto. O banco de dados foi preservado." -ForegroundColor Green
