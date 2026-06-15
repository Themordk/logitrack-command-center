## Objetivo

Evitar que as listas administrativas consultem todos os registros quando os campos de data ficam vazios. Os filtros DATA DE e DATA ATÉ devem:

1. Inicializar sempre com a **data atual** (hoje, fuso America/Fortaleza).
2. Filtrar a consulta sempre pelo intervalo informado (nada de "se vazio, sem filtro").
3. **Não permitir ficar em branco** — se o usuário tentar limpar, o campo volta para o último valor válido (ou para hoje, se nunca houve valor).

## Arquivos a alterar

### 1. `src/pages/MovimentoEntradaPage.tsx` (rota `/atividades/movimentos`)
- `useState("")` dos filtros `filterDateFrom`/`filterDateTo` → inicializar com `todayBrasilia()` (string `YYYY-MM-DD`).
- Remover os `if (filterDateFrom)` / `if (filterDateTo)` condicionais — aplicar sempre `gte`/`lte` em `created_at`.
- No `onChange` do `<input type="date">`: se `e.target.value` vazio, ignorar (manter estado anterior). Adicionar `required` e `min`/sem `clear` — mas como `type=date` não tem botão clear universal, o guard no onChange é suficiente.

### 2. `src/pages/MovimentoSaidaPage.tsx` (rota `/atividades/mov-saida`)
- Mesmo tratamento de `filterDateFrom`/`filterDateTo` (campo de data sobre `data_emissao`).

### 3. `src/pages/InventarioPage.tsx` (rota `/atividades/inventario`)
- Mesmo tratamento de `filterDateFrom`/`filterDateTo` (campo `criado_em`).

### 4. `src/pages/AbastecimentoPage.tsx` (rota `/atividades/abastecimento`)
Hoje a página **não tem filtros** — faz `select("*").order("criado_em").limit(100)`. Vou:
- Adicionar estado `filterDateFrom`/`filterDateTo` inicializados com hoje.
- Adicionar dois inputs `type=date` no header (mesmo padrão visual das outras páginas: label `text-[10px] uppercase`).
- Incluir `.gte("criado_em", from+"T00:00:00").lte("criado_em", to+"T23:59:59")` no `fetchData`, e adicionar as datas como dependência do `useCallback`.
- Remover o `.limit(100)` para que o filtro de data passe a ser a barreira de tamanho.
- Aplicar o mesmo guard no `onChange` (não permitir limpar).

## Detalhes técnicos

- Helper inline (sem novo arquivo): `const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });` retorna `YYYY-MM-DD` aceito pelo `<input type="date">`.
- Guard de limpeza:
  ```tsx
  onChange={(e) => { if (e.target.value) setFilterDateFrom(e.target.value); }}
  ```
  Adicionar também `required` no input (acessibilidade / form semantics).
- Nenhuma alteração de schema, RPC, ou backend. Sem mudanças em mobile/coletor.
- Sem alterar outras rotas além das 4 listadas.

## Fora de escopo
- Outras telas administrativas, dashboard, relatórios.
- Mudar o campo de data usado (continua `created_at`/`data_emissao`/`criado_em` conforme já está).
- Validar `from <= to` (pode ser feito depois se necessário).