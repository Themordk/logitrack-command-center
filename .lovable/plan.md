# Refatoração — Novo Inventário (`/inventario/novo`)

Reescrever `src/pages/NovoInventarioPage.tsx` para um formulário **condicional e guiado** baseado no tipo, mantendo o visual dark atual (cards `card-surface`, labels em maiúsculas, switches azul `#3b82f6`).

## Mudanças de comportamento principais

1. **Escopo condicional por tipo** — só renderiza os campos do tipo selecionado, com transição `transition-all duration-200`. Tipos suportados: `GERAL | ROTATIVO | ZONA | ENDERECO | PRODUTO | GRUPO_PRODUTO` (adicionar GRUPO_PRODUTO que hoje não existe como tipo separado).
2. **Seleção única** — Zona/Endereço/Produto/Grupo passam a ser **single-select** (remover lógica de múltipla seleção, checkboxes "selecionar todos", listas `selectedEnderecos[]`, etc.).
3. **Form library** — migrar de `useState` solto para **React Hook Form + Zod**, com schema discriminado por `tipo_inventario` espelhando as regras do backend.
4. **Trocar RPC** — de `fn_criar_inventario` para **`fn_criar_inventario_v2`** com a assinatura nova (inclui `p_bloquear_movimentacao`, `p_data_planejada`, `p_criterio_selecao`, `p_curva`, `p_max_enderecos_dia`, `p_priorizar_picking`).
5. **Geração em loop** — após criar, chamar `fn_gerar_tarefas_inventario` em loop com `p_chunk_size: 200` até `finalizado === true`, exibindo progresso no botão (`Gerando tarefas... (X%)`).
6. **Remover campos fora de escopo**: "Permitir Execução Paralela", "Quantidade máxima de recontagens", filtros de rua/prédio/grupo/subgrupo do escopo Endereço/Produto, toggles `incluirPicking/incluirPulmao/incluirBloqueados` do GERAL.

## Seções do formulário

### Dados Gerais (sempre visível)
- `Tipo Inventário*` (Select: 6 opções)
- `Data Planejada` (DatePicker dd/mm/aaaa, opcional)
- `Descrição` (Input texto)
- `Tipo de Execução*` (Select: Auditoria | Atualização) — com tooltip explicativo no label
- `Bloquear Movimentações` (Switch, default ON)

### Escopo (condicional)
| Tipo | Campos |
|---|---|
| GERAL | apenas info card "conta todos os endereços com saldo" |
| ROTATIVO | `Critério*` (RadioGroup: Curva Vendas/Acesso/Cortes/Estornos), `Curva*` (Select A/B/C/D — só se critério for CURVA_*, animar entrada/saída), `Máx. Endereços/Dia` (number), `Priorizar Picking` (Switch off) + linha "Estimativa diária: N endereços/dia" |
| ZONA | `Zona de Atividade*` (Select buscando `zona_atividade` por tenant+armazem; vazio → mensagem) |
| ENDERECO | `Endereço*` (Combobox shadcn buscando `endereco.codigo_endereco` por armazem) |
| PRODUTO | `Produto*` (Combobox buscando `produto` por sku/descricao, display "SKU — Descrição") |
| GRUPO_PRODUTO | `Grupo de Produto*` (Select de `grupo_produto` por tenant) |

### Painel Resumo (lateral direito, sticky)
- Atualiza com `watch()`: Tipo, Execução (labels amigáveis), Total Endereços (0), Total SKUs (0). Em mobile colapsa em banner inferior fixo.

## Fluxo de submissão
1. `handleSubmit` valida via Zod → botão `Loader2 + "Criando..."`.
2. `await supabase.rpc('fn_criar_inventario_v2', payload)` — payload monta apenas o campo de escopo do tipo selecionado, demais como `null`.
3. Em sucesso, botão vira `Gerando tarefas... (X%)` e loop:
   ```ts
   while (!finalizado) {
     const { data } = await supabase.rpc('fn_gerar_tarefas_inventario', { p_tenant_id, p_inventario_id, p_chunk_size: 200 });
     acumulado += data.tarefas_geradas; finalizado = data.finalizado;
     setProgresso(...);
   }
   ```
4. Toast sucesso → `onNavigate('/inventario/' + inventario_id)`.

## Mapeamento de erros (toast destrutivo)
`TIPO_TAREFA_NAO_CONFIGURADO`, `ESCOPO_ZONA_OBRIGATORIO`, `ESCOPO_ENDERECO_OBRIGATORIO`, `ESCOPO_PRODUTO_OBRIGATORIO`, `ESCOPO_GRUPO_OBRIGATORIO`, `CRITERIO_ROTATIVO_OBRIGATORIO`, `CURVA_OBRIGATORIA`, `ARMAZEM_OBRIGATORIO` → mensagens PT amigáveis conforme tabela do prompt.

## Arquivo afetado
- **Editar (reescrever)**: `src/pages/NovoInventarioPage.tsx` (~740 linhas → ~350-400 linhas, com componente único usando shadcn `Form`, `Select`, `Popover+Calendar`, `Switch`, `RadioGroup`, `Command/Combobox`).

Nenhuma migration, nenhum service novo, nenhuma alteração em outras telas.

## Validação após implementar
- Cada tipo monta payload correto (campos de escopo de outros tipos = `null`).
- Toggle de critério ROTATIVO mostra/oculta Curva e limpa valor ao ocultar.
- Loop de geração avança e redireciona ao final.
- Resumo lateral reage a `watch()`.

## Pontos a confirmar antes de codar
- A RPC `fn_criar_inventario_v2` já existe no banco (o prompt afirma "backend já implementado"). Verificarei via `supabase--read_query` em pg_proc antes de gravar a chamada.
