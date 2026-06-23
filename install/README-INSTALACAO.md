# Instalação no servidor da Cinexpan (Windows 11 Pro)

Este guia coloca o **Portal Financeiro Cinexpan** rodando no servidor, com
banco **PostgreSQL local**, iniciando sozinho junto com o Windows e acessível
pelos outros computadores da rede.

---

## 1. Pré-requisitos (só uma vez)

- Windows 11 Pro com acesso de **Administrador**.
- Internet no servidor (para baixar Node.js, PostgreSQL e dependências).
- **Git** instalado (para baixar e atualizar o código). Se não tiver:
  abra o PowerShell como Administrador e rode `winget install -e --id Git.Git`.
- As credenciais do Omie em mãos: **App Key** e **App Secret**.

> O `winget` já vem no Windows 11. Se ele não existir, instale a
> "App Installer" pela Microsoft Store.

---

## 2. Baixar o projeto

Abra o **PowerShell** e escolha uma pasta (ex.: a pasta do usuário):

```powershell
cd C:\Cinexpan
git clone <URL-DO-REPOSITORIO> cinexpan-financeiro
cd cinexpan-financeiro
```

(Se o projeto já está na máquina, só entre na pasta dele.)

---

## 3. Rodar o instalador

Clique com o **botão direito** em `install\instalar.ps1` →
**"Executar com o PowerShell"**.
Ele pede elevação de Administrador automaticamente.

Ou, no PowerShell **como Administrador**, dentro da pasta do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File .\install\instalar.ps1
```

O instalador vai, em sequência:

1. Instalar o **Node.js LTS** (se faltar).
2. Instalar o **PostgreSQL 16** local (se faltar) — pedirá uma **senha para o
   administrador do banco** (`postgres`).
3. Criar o banco `cinexpan_financeiro` e o usuário `cinexpan` — pedirá uma
   **senha para o usuário da aplicação**.
4. Criar o `.env.local` — pedirá **App Key** e **App Secret** do Omie.
5. Instalar dependências e **compilar** o portal.
6. Registrar o **serviço do Windows** "Portal Financeiro Cinexpan"
   (inicia junto com a máquina).
7. Liberar a **porta 3000 no firewall** para a rede local.
8. Iniciar o serviço.

No final ele mostra os endereços de acesso, por exemplo:

```
Neste servidor:        http://localhost:3000
Na rede (outros PCs):  http://192.168.0.10:3000
```

> **Guarde as senhas** do banco em local seguro. Anote também o IP do servidor
> para informar à diretoria.

---

## 4. Acesso pela rede

Nos outros computadores da rede, abra no navegador:

```
http://IP-DO-SERVIDOR:3000
```

(o IP aparece no final da instalação; é fixo se o servidor tiver IP fixo).

---

## 5. Primeiro uso

1. **Integração Omie → "Testar conexão"** para confirmar as credenciais.
2. **Integração Omie → "Atualizar cadastro de clientes"** (uma vez; carrega os
   nomes dos clientes — agora persistidos no PostgreSQL).
3. **Rastreio de Faturamento → "Sincronizar Omie"** mês a mês. Cada mês fica
   gravado no banco; não é preciso re-sincronizar o passado.

Se você já usava a versão antiga (arquivo `data/rastreio.json`), na primeira
vez que o portal subir com PostgreSQL ele **importa esse histórico
automaticamente** para o banco.

---

## 6. Manutenção

| Tarefa | Como |
|---|---|
| **Atualizar** para nova versão | `install\atualizar.ps1` (botão direito → Executar com PowerShell) — faz `git pull`, recompila e reinicia o serviço |
| **Ver logs** | pasta `logs\` (arquivos `portal.log` e `portal-erro.log`) |
| **Parar / iniciar** | `Stop-Service CinexpanFinanceiro` / `Start-Service CinexpanFinanceiro` |
| **Status do serviço** | `Get-Service CinexpanFinanceiro` |
| **Desinstalar** o serviço | `install\desinstalar.ps1` (preserva o banco de dados) |

---

## 7. Backup do banco de dados

Recomendado agendar um backup diário. Exemplo manual (ajuste a versão do
PostgreSQL no caminho):

```powershell
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" `
  -U cinexpan -h localhost cinexpan_financeiro `
  -f "C:\Cinexpan\backups\cinexpan_$(Get-Date -Format yyyyMMdd).sql"
```

(Será solicitada a senha do usuário `cinexpan`.)

---

## Solução de problemas

- **"node não é reconhecido"** logo após instalar: feche e reabra o PowerShell
  (Admin) e rode o instalador de novo — ele continua de onde parou.
- **Porta 3000 ocupada**: rode o instalador informando outra porta:
  `\.install\instalar.ps1 -Porta 8080` (lembre de acessar com `:8080`).
- **Erro de conexão com o banco**: confira a linha `DATABASE_URL` no
  `.env.local` e se o serviço `postgresql-x64-16` está em execução
  (`Get-Service *postgres*`).
- **Outros PCs não acessam**: confirme que estão na mesma rede, que o firewall
  liberou a porta (o instalador faz isso) e use o **IP** do servidor, não
  `localhost`.
