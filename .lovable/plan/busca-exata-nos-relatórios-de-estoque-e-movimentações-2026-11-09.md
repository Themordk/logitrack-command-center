# Busca exata nos relatórios de Estoque e Movimentações

## O que muda para o usuário
- **Posição de Estoque**: SKU, EAN e Código do endereço só trazem registros com valor exatamente igual ao digitado (ex.: SKU "123" não traz mais "1234" nem "A123").
- **Histórico de Movimentos**: SKU passa a buscar só o valor exato e vira obrigatório ("SKU *"). Sem SKU, o botão de gerar mostra "Informe o SKU." e não consulta.

## O que encontrei
- Posição de Estoque: o SKU usa busca "contém" (parcial). EAN e Código do endereço já comparam igual, mas um código não numérico (ex.: "12A") é ignorado silenciosamente e o relatório traz tudo — vou bloquear com aviso "Código do endereço deve ser numérico."
- Histórico de Movimentos: a tela só tem o campo SKU (não há EAN nem Código do endereço). Após a consulta, um filtro na tela aplica "contém" sobre o resultado. Vou trocar para igualdade exata.

## Detalhes técnicos
- `src/modules/reports/estoque/estoque.service.ts`: `q.ilike("sku", %x%)` -> `q.eq("sku", sku)` (sem curingas; espaços nas pontas removidos). Marca segue parcial.
- `src/modules/reports/estoque/EstoqueReportPage.tsx`: validar `codigoNum` inválido com `toast.error` e interromper.
- `src/modules/reports/movimentacoes/movimentacoes.service.ts`: filtro client `includes` -> comparação exata (trim, case-insensitive para não perder SKU com letras maiúsculas/minúsculas diferentes). Se preferir diferenciar maiúsculas, ajusto.
- `src/modules/reports/movimentacoes/MovimentacoesReportPage.tsx`: label "SKU *", validação obrigatória em `handleGenerate`.
- Sem alterações no banco/RPC.
- Teste pequeno: serviço de movimentações não retorna SKU parcial; estoque usa `eq` para SKU.
