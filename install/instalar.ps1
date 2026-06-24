<#
  ============================================================================
  Portal Financeiro Cinexpan — Instalador (Windows 11 Pro)
  ============================================================================
  O que este script faz, do zero, no servidor da Cinexpan:
    1. Instala o Node.js LTS (se faltar)         -> via winget
    2. Instala o PostgreSQL local (se faltar)    -> via winget, modo silencioso
    3. Cria o banco e o usuário da aplicação
    4. Gera o arquivo .env.local (Omie + banco)
    5. Instala dependências e compila a aplicação (npm install + build)
    6. Registra o portal como SERVIÇO do Windows (inicia junto com a máquina)
    7. Libera a porta no Firewall para acesso pela rede (outros PCs)
    8. Inicia o serviço

  COMO USAR:
    - Clique com o botão direito neste arquivo  ->  "Executar com o PowerShell"
      (ou abra o PowerShell COMO ADMINISTRADOR e rode:  .\install\instalar.ps1)
    - Responda às perguntas (chaves do Omie e senha do banco).

  Pode rodar novamente quando quiser: ele pula o que já estiver pronto.
  ============================================================================
#>

[CmdletBinding()]
param(
  [string]$ServiceName = "CinexpanFinanceiro",
  [int]$Porta = 3000,
  [string]$DbNome = "cinexpan_financeiro",
  [string]$DbUsuario = "cinexpan",
  [switch]$SemBuild   # pula 'npm install' e 'build' (use quando copiar node_modules + .next prontos do outro PC)
)

$ErrorActionPreference = "Stop"

function Info($m)  { Write-Host "[ OK ] $m"   -ForegroundColor Green }
function Passo($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Aviso($m) { Write-Host "[ !! ] $m"   -ForegroundColor Yellow }

# --- Exige privilégios de administrador (necessário p/ serviço e firewall) ---
$ehAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $ehAdmin) {
  Aviso "Reabrindo como Administrador..."
  Start-Process powershell -Verb RunAs -ArgumentList `
    "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

# --- Caminhos ---
$RaizApp = Split-Path -Parent $PSScriptRoot      # pasta do projeto (pai de /install)
Set-Location $RaizApp
Passo "Pasta da aplicação: $RaizApp"

# ---------------------------------------------------------------------------
# 1) Node.js
# ---------------------------------------------------------------------------
Passo "1/8  Node.js"
function Comando-Existe($nome) { return [bool](Get-Command $nome -ErrorAction SilentlyContinue) }

if (Comando-Existe "node") {
  Info "Node.js já instalado ($(node --version))"
} else {
  Aviso "Instalando Node.js LTS via winget..."
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path","User")
  if (-not (Comando-Existe "node")) {
    throw "Node.js não ficou disponível. Feche e reabra o PowerShell (Admin) e rode o instalador de novo."
  }
  Info "Node.js instalado ($(node --version))"
}

# ---------------------------------------------------------------------------
# 2) PostgreSQL
# ---------------------------------------------------------------------------
Passo "2/8  PostgreSQL"
function Achar-Psql {
  $cands = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
           Sort-Object FullName -Descending
  if ($cands) { return $cands[0].FullName }
  if (Comando-Existe "psql") { return (Get-Command psql).Source }
  return $null
}

$psql = Achar-Psql
$senhaSuper = $null
if ($psql) {
  Info "PostgreSQL já instalado: $psql"
} else {
  Aviso "PostgreSQL não encontrado. Vou instalar (PostgreSQL 16) via winget."
  $senhaSuper = Read-Host "Defina uma SENHA para o administrador do PostgreSQL (usuário 'postgres')" -AsSecureString
  $senhaSuperTxt = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaSuper))

  winget install -e --id PostgreSQL.PostgreSQL.16 `
    --accept-source-agreements --accept-package-agreements `
    --override "--mode unattended --unattendedmodeui none --superpassword `"$senhaSuperTxt`" --serverport 5432 --enable-components server,commandlinetools"

  Start-Sleep -Seconds 5
  $psql = Achar-Psql
  if (-not $psql) {
    throw "PostgreSQL não foi localizado após a instalação. Verifique em 'C:\Program Files\PostgreSQL'."
  }
  Info "PostgreSQL instalado: $psql"
}

# ---------------------------------------------------------------------------
# 3 e 4) Banco, usuário e .env.local
# Se o .env.local já existe, o banco e a configuração já foram feitos numa
# execução anterior — pulamos tudo (re-execução segura, sem repetir senhas).
# ---------------------------------------------------------------------------
$envPath = Join-Path $RaizApp ".env.local"

if (Test-Path $envPath) {
  Passo "3-4/8  Banco e configuração (já existentes)"
  Info ".env.local já existe — banco e configuração já estavam prontos. Pulando."
} else {
  Passo "3/8  Banco de dados e usuário"
  if (-not $senhaSuper) {
    $senhaSuper = Read-Host "Senha do administrador do PostgreSQL (usuário 'postgres')" -AsSecureString
    $senhaSuperTxt = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaSuper))
  }

  $senhaApp = Read-Host "Defina a SENHA do usuário da aplicação ('$DbUsuario')" -AsSecureString
  $senhaAppTxt = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaApp))

  $env:PGPASSWORD = $senhaSuperTxt

  # Cria o usuário (role) se não existir
  $existeRole = & $psql -U postgres -h localhost -tAc `
    "SELECT 1 FROM pg_roles WHERE rolname='$DbUsuario'"
  if ($existeRole -ne "1") {
    & $psql -U postgres -h localhost -c `
      "CREATE ROLE $DbUsuario LOGIN PASSWORD '$senhaAppTxt';"
    Info "Usuário '$DbUsuario' criado."
  } else {
    & $psql -U postgres -h localhost -c `
      "ALTER ROLE $DbUsuario LOGIN PASSWORD '$senhaAppTxt';"
    Info "Usuário '$DbUsuario' já existia (senha atualizada)."
  }

  # Cria o banco se não existir
  $existeDb = & $psql -U postgres -h localhost -tAc `
    "SELECT 1 FROM pg_database WHERE datname='$DbNome'"
  if ($existeDb -ne "1") {
    & $psql -U postgres -h localhost -c `
      "CREATE DATABASE $DbNome OWNER $DbUsuario;"
    Info "Banco '$DbNome' criado."
  } else {
    Info "Banco '$DbNome' já existia."
  }
  $env:PGPASSWORD = $null

  Passo "4/8  Arquivo de configuração (.env.local)"
  $databaseUrl = "postgresql://${DbUsuario}:${senhaAppTxt}@localhost:5432/${DbNome}"
  $omieKey    = Read-Host "OMIE_APP_KEY (App Key do Omie)"
  $omieSecret = Read-Host "OMIE_APP_SECRET (App Secret do Omie)"
  @"
# Gerado pelo instalador em $(Get-Date -Format "dd/MM/yyyy HH:mm")
OMIE_APP_KEY=$omieKey
OMIE_APP_SECRET=$omieSecret
DATABASE_URL=$databaseUrl
"@ | Set-Content -Path $envPath -Encoding UTF8
  Info ".env.local criado."
}

# ---------------------------------------------------------------------------
# 5) Dependências + build
# ---------------------------------------------------------------------------
if ($SemBuild) {
  Passo "5/8  Dependências e build (modo -SemBuild: usando o que já está pronto)"
  if (-not (Test-Path (Join-Path $RaizApp "node_modules"))) {
    throw "-SemBuild informado, mas a pasta 'node_modules' não existe. Copie node_modules (e .next) do outro PC antes."
  }
  if (-not (Test-Path (Join-Path $RaizApp ".next"))) {
    Aviso ".next não encontrado — vou compilar agora (offline, não usa internet)."
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Falha no 'npm run build'." }
  }
  Info "Dependências/compilação reaproveitadas."
} else {
  Passo "5/8  Instalando dependências e compilando (pode levar alguns minutos)"

  # Remove node_modules parcial/travado de tentativas anteriores
  $nm = Join-Path $RaizApp "node_modules"
  if (Test-Path $nm) {
    Aviso "Limpando node_modules de tentativa anterior..."
    Remove-Item -Recurse -Force $nm -ErrorAction SilentlyContinue
  }

  # Deixa o npm resistente a quedas de conexão (firewall corporativo)
  & npm config set fetch-retries 5 | Out-Null
  & npm config set fetch-retry-mintimeout 20000 | Out-Null
  & npm config set fetch-retry-maxtimeout 120000 | Out-Null
  & npm config set fetch-timeout 600000 | Out-Null
  & npm config set maxsockets 3 | Out-Null

  # Tenta o npm install várias vezes (a rede pode cair no meio do download)
  $instalou = $false
  for ($t = 1; $t -le 4; $t++) {
    Aviso "npm install (tentativa $t de 4)..."
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -eq 0) { $instalou = $true; break }
    Aviso "Falhou (provavel queda de rede). Nova tentativa em 8s..."
    Start-Sleep -Seconds 8
  }
  if (-not $instalou) {
    throw "Falha no 'npm install' apos varias tentativas. Veja o plano B no README-INSTALACAO.md (copiar node_modules do outro PC e usar -SemBuild)."
  }

  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "Falha no 'npm run build'." }
  Info "Aplicação compilada."
}

# ---------------------------------------------------------------------------
# 6) Serviço do Windows (via NSSM)
# ---------------------------------------------------------------------------
Passo "6/8  Serviço do Windows"
$nssm = Join-Path $PSScriptRoot "nssm.exe"
if (-not (Test-Path $nssm)) {
  Aviso "Baixando NSSM (gerenciador de serviço)..."
  $zip = Join-Path $env:TEMP "nssm.zip"
  $ext = Join-Path $env:TEMP "nssm_ext"
  Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing
  if (Test-Path $ext) { Remove-Item $ext -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $ext -Force
  $bin = Get-ChildItem (Join-Path $ext "nssm-2.24\win64\nssm.exe")
  Copy-Item $bin.FullName $nssm -Force
  Info "NSSM pronto."
}

$nodeExe = (Get-Command node).Source
$nextCli = Join-Path $RaizApp "node_modules\next\dist\bin\next"
$logDir  = Join-Path $RaizApp "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Recria o serviço (idempotente)
& $nssm stop $ServiceName 2>$null | Out-Null
& $nssm remove $ServiceName confirm 2>$null | Out-Null

& $nssm install $ServiceName $nodeExe "`"$nextCli`" start -p $Porta"
& $nssm set $ServiceName AppDirectory $RaizApp
& $nssm set $ServiceName AppStdout (Join-Path $logDir "portal.log")
& $nssm set $ServiceName AppStderr (Join-Path $logDir "portal-erro.log")
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 5242880
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppEnvironmentExtra "NODE_ENV=production"
& $nssm set $ServiceName DisplayName "Portal Financeiro Cinexpan"
& $nssm set $ServiceName Description "Portal Financeiro Cinexpan (Next.js) - Rastreio de Faturamento"
Info "Serviço '$ServiceName' registrado (inicia junto com o Windows)."

# ---------------------------------------------------------------------------
# 7) Firewall (acesso pela rede local)
# ---------------------------------------------------------------------------
Passo "7/8  Firewall (porta $Porta para a rede local)"
$regra = "Cinexpan Financeiro ($Porta)"
Remove-NetFirewallRule -DisplayName $regra -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $regra -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort $Porta -Profile Domain,Private | Out-Null
Info "Porta $Porta liberada (perfis Domínio e Privado)."

# ---------------------------------------------------------------------------
# 8) Iniciar
# ---------------------------------------------------------------------------
Passo "8/8  Iniciando o serviço"
& $nssm start $ServiceName
Start-Sleep -Seconds 4

$ips = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" } |
        Select-Object -ExpandProperty IPAddress)

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " INSTALAÇÃO CONCLUÍDA" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Neste servidor:        http://localhost:$Porta"
foreach ($ip in $ips) {
  Write-Host " Na rede (outros PCs):  http://$ip`:$Porta"
}
Write-Host ""
Write-Host " Logs:        $logDir"
Write-Host " Atualizar:   .\install\atualizar.ps1"
Write-Host " Desinstalar: .\install\desinstalar.ps1"
Write-Host "============================================================`n" -ForegroundColor Green
