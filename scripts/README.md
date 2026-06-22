# Scripts de validação

Ferramentas de conferência do módulo Rastreio de Faturamento. Rodam com `tsx`
e recebem os caminhos por variável de ambiente (nenhum dado é versionado).

## Cruzar derivação com a planilha-mãe (linha a linha + agregados)
```bash
MAE="/caminho/Rastreio_do_Faturamento.xlsm" npx tsx scripts/validar-mae.ts
```

## Gerar relatório de validação a partir do BD
```bash
BD="/caminho/BD_Rastreio_Faturamento.xlsx" OUT="relatorio.md" npx tsx scripts/gerar-relatorio.ts
```
