## Objetivo

Em `/atividades/inventario/:id/itens` (`src/pages/InventarioItensPage.tsx`):
1. Adicionar botão **"Zerar não contados"** com modal de seleção da contagem (1ª ou 2ª) e execução em massa via RPC `fn_inventario_registrar_contagem`.
2. Corrigir exibição das colunas de contagem para **não mostrar `0`** em itens ainda não contados (a coluna `quantidade_executada` da `tarefa` tem default `0 NOT NULL`, então o `?? "—"` atual nunca dispara).

## Mudanças

### 1. Exibição das colunas (sem mudança visual — só lógica de fallback)

Usar o `status` da tarefa como sinal de "ainda não contado":

| Coluna | Mostrar `—` quando |
|---|---|
| `primeira_contagem` | `status === "PENDENTE"` |
| `segunda_contagem`  | `status in ("PENDENTE", "CONTADO")` |
| `saldo_final`       | `status !== "CONFERIDO"` |
| `divergência`       | `status in ("PENDENTE", "CONTADO")` |

Implementado inline no `map` da tabela.

### 2. Botão "Zerar não contados"

- Posicionado na barra de filtros, alinhado à direita do botão "Filtrar", padrão visual igual (`h-8 px-3 rounded-md`, variante `outline`/`secondary` para diferenciar da ação primária; ícone `Eraser` do lucide).
- Ao clicar, abre `AlertDialog` (shadcn) com:
  - Título: "Zerar itens não contados"
  - Descrição explicando o efeito
  - Dois botões de seleção: **1ª Contagem** e **2ª Contagem**
  - Botão **Cancelar**

### 3. Execução

Ao confirmar a contagem escolhida (`C`):

1. Buscar do `tarefa` (não da view) todos os registros do inventário **escopados pelo mesmo conjunto de filtros já aplicados na tela** (SKU/rua/prédio/nível/apto), filtrando:
   - `C = 1` → `status = 'PENDENTE'`
   - `C = 2` → `status = 'CONTADO'`
   - Campos: `id`, `id_local_origem` (= `endereco_origem_id`)
2. Para cada tarefa, chamar `supabase.rpc("fn_inventario_registrar_contagem", { p_tenant_id, p_tarefa_id, p_usuario, p_contagem: C, p_quantidade: 0, p_endereco_origem_id })`.
3. Executar em lotes (ex.: `Promise.all` em chunks de 10) com `toast` de progresso e resumo final (sucesso / falhas).
4. Ao final, `refetch` da query da página e fechar o modal.

`p_usuario` vem do contexto atual (mesmo padrão usado nas demais páginas — `useTenant`/perfil). Demais parâmetros opcionais (`p_lote`, `p_validade`, `p_fabricacao`, `p_hu`) ficam `undefined`.

### Detalhes técnicos

- Sem mudança de UI/layout além do botão novo e do modal padrão `AlertDialog`.
- Sem novas RPCs no backend — usa `fn_inventario_registrar_contagem` existente.
- Sem mudanças na view `inventario_item_resumo`; o ajuste de "—" é puramente client-side usando `item.status`.
- Necessário expor `status` (já está na interface `ItemResumo`) e garantir que `tarefa.id_local_origem` corresponde ao `endereco_origem_id` esperado pela RPC (confirmado pela definição da view).

## Arquivos afetados

- `src/pages/InventarioItensPage.tsx` (único arquivo)
