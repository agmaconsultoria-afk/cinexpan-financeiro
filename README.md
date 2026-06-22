# Portal Financeiro Cinexpan

Portal de gestão financeira para **gestão e diretoria** da Cinexpan. Consolida
indicadores, fluxo de caixa, DRE e relatórios a partir da planilha financeira da
empresa — com estrutura preparada para integração futura com o **ERP Omie**.

## Tecnologias

- **Next.js 14** (App Router) + **React 18**
- **TypeScript**
- **Tailwind CSS**
- **Recharts** (gráficos)
- **SheetJS / xlsx** (importação e exportação de planilhas)
- **lucide-react** (ícones)

## Funcionalidades

| Módulo | Descrição |
| --- | --- |
| **Rastreio de Faturamento** | Cruza o faturamento (competência) com o financeiro (contas a receber em parcelas) para acompanhar, mês a mês, quanto de cada faturamento já foi recebido, ainda falta, foi descontado, multas/juros e atrasos — com o % rastreado do mês. Importa o relatório de Contas a Receber do Omie. |
| **Dashboard Executivo** | KPIs (receita, despesa, resultado, margem), gráficos de receitas x despesas, composição de despesas e saldo de caixa acumulado. |
| **Fluxo de Caixa** | Série mensal de entradas/saídas, resultado e saldo acumulado, com detalhamento em tabela. |
| **DRE** | Demonstração do Resultado estruturada (Receita Bruta → Resultado Líquido) com % sobre receita e totais por categoria. |
| **Relatórios** | Relatório consolidado para a diretoria, com exportação em **Excel** e **CSV** e impressão/PDF. |
| **Importar Planilha** | Upload de `.xlsx`/`.xls`/`.csv` com detecção automática de colunas, prévia e planilha modelo. |
| **Integração Omie** | Roadmap e estrutura técnica para conexão com o ERP Omie (próxima fase). |

## Como rodar

```bash
npm install
npm run dev      # ambiente de desenvolvimento em http://localhost:3000
npm run build    # build de produção
npm start        # servir o build
```

## Fluxo de dados

1. **Versão atual:** o portal inicia com **dados de exemplo**. Em *Importar Planilha*,
   o usuário carrega a planilha real — os dados ficam salvos no navegador
   (localStorage) e passam a alimentar todas as telas.
2. **Próxima fase:** a integração com o **Omie** substituirá a importação manual,
   sincronizando contas a pagar/receber e movimentos diretamente do ERP. As
   credenciais (`app_key`/`app_secret`) ficarão protegidas no servidor — ver
   `lib/omie.ts`.

## Formato da planilha

A primeira linha deve conter os cabeçalhos. Colunas reconhecidas (com aliases):

- **Data** (`data`, `vencimento`, `competência`)
- **Descrição** (`histórico`, `lançamento`)
- **Categoria** (`conta`, `plano de contas`)
- **Grupo** (grupo do DRE: Receita Bruta, Deduções, Custos, Despesas Operacionais, Resultado Financeiro)
- **Tipo** (`Receita`/`Despesa`, ou crédito/débito)
- **Valor** (formato pt-BR `1.234,56` ou número)
- **Centro de Custo** (opcional)

Baixe a planilha modelo direto na tela *Importar Planilha*.

## Estrutura do projeto

```
app/                    # rotas (App Router)
  page.tsx              # Dashboard
  rastreio-faturamento/ # Rastreio de Faturamento
  fluxo-caixa/          # Fluxo de caixa
  dre/                  # DRE
  relatorios/           # Relatórios e exportação
  importar/             # Importação de planilha (genérica)
  integracao-omie/      # Integração Omie (roadmap)
components/             # Sidebar, Topbar, KPI cards, gráficos, UI
lib/                    # tipos, agregações, formatação, import/export, contexto, omie
  rastreio/             # módulo Rastreio de Faturamento (regras da planilha-mãe)
    logic.ts            #   colunas calculadas + Demonstrativo Mensal
    import.ts           #   leitura do BD (Contas a Receber)
    faturamento.ts      #   faturamento mensal lançado
    context.tsx         #   estado/persistência do módulo
```

## Rastreio de Faturamento — regras

O módulo replica fielmente a planilha "Rastreio do Faturamento":

- **Competência** = mês da Data de Emissão da nota.
- **Mês de Recebimento** = mês do Último Recebimento (ou da Previsão, se não houver).
- **Valor Faturado** desconsidera lançamentos cancelados, bloqueados a vencer,
  devoluções e adiantamentos de cliente.
- **Atrasado** = valor de parcelas com situação "Atrasado".
- **Visão Recebimento** usa Valor a Receber / Mês de Recebimento; **Visão
  Vencimento** usa Valor Faturado / Mês de Vencimento.
- **% Rastreado** = (A receber + Recebido + Descontos + Vendas PF) ÷ Faturamento do mês.

As regras foram validadas contra a planilha original (fev/2026): mesmo resultado
exato (Já Recebido R$ 4.336.381,68; Total Rastreado R$ 4.596.624,47; **96,43%**).
