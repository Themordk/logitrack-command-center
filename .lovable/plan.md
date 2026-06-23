## Bug: `RangeError: Invalid time value` ao alterar período

### Causa
`ProdutividadeDashboardPage.tsx` chama `format(parseISO(dataInicio), ...)` e `format(parseISO(dataFim), ...)` em três lugares (linhas 270, 296 e 523). Enquanto o usuário edita o `<input type="date">`, o valor pode ficar momentaneamente vazio ou parcial (ex.: `"2026-"`). `parseISO` retorna `Invalid Date` e `format` lança `RangeError`, derrubando a tela.

A linha 296 (`periodoLabel`) é avaliada em todo render — por isso o erro aparece imediatamente ao alterar o filtro.

### Correção
1. Criar helper local `safeFormatISO(value, pattern)` que retorna `"—"` quando `parseISO` produz data inválida (`isNaN(d.getTime())`).
2. Substituir as três chamadas atuais:
   - L270 (PDF "periodo")
   - L296 (`periodoLabel` no header)
   - L523 (célula `data_referencia` da tabela)
3. No `onChange` dos inputs de data, só atualizar o state quando o valor for vazio ou string ISO completa (`/^\d{4}-\d{2}-\d{2}$/`), evitando renders intermediários com data parcial.
4. Guardar também o `useEffect` que dispara `executar()` para não rodar quando `dataInicio`/`dataFim` estiverem inválidos.

### Fora de escopo
- Outras páginas de relatório.
- Refatorar para `src/utils/dateTime.ts` (os campos aqui são `date` puro, não timestamp).
- Lógica de negócio / service / queries.
