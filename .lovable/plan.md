## Objetivo

Fazer com que as movimentações do coletor (Transferência, Mudança de Picking e Abastecimento) respeitem rigorosamente as regras de armazenagem configuradas em `#/armazem/regras-armazenagem`, bloqueando destinos inválidos antes de gravar qualquer registro.

Hoje só a **Armazenagem Dirigida** (`ArmazenagemExecucaoPage`) consome `rpc_validar_endereco_picking`. As demais rotinas gravam direto em `tarefa`/`tarefa_execucao` sem checar mistura de SKU, lote, validade, tolerância, capacidade ou tipo de alocação (FIXO/ROTATIVO).

## Regras aplicadas

Reutilizar a RPC já existente `rpc_validar_endereco_picking(p_tenant_id, p_armazem_id, p_produto_id, p_endereco_id, p_lote, p_validade, p_quantidade)`, que devolve `{ valido, erros[] }`. A validação só é obrigatória quando o endereço destino tiver `tipo_endereco = 'PICKING'` (mesmo critério já usado na armazenagem). Endereços de PULMÃO/OUTROS seguem o fluxo atual, mantendo apenas a checagem de `situacao ∈ (LIVRE, OCUPADO)`.

Se a RPC retornar `valido=false`, exibir `StatusOverlay` de erro com `erros.join(" • ")` e abortar antes de qualquer INSERT. Em caso de sucesso, gravar o log opcional em `log_sugestao_armazenagem` com `tipo_sugestao='MANUAL'` (não crítico, mesmo padrão da `ArmazenagemExecucaoPage`).

## Alterações por tela

### 1. `src/pages/coletor/TransferenciaDestinoPage.tsx`
- Ao ler o endereço destino, além de `id, descricao, situacao`, buscar também `tipo_endereco`.
- Antes do INSERT em `tarefa`, se `tipo_endereco === 'PICKING'`, chamar `rpc_validar_endereco_picking` com `produtoId`, `lote`, `validade` e `quantidade` já disponíveis em `sessionStorage`.
- Bloquear com overlay de erro quando inválido.

### 2. `src/pages/coletor/MudancaPickingDestinoPage.tsx`
- Buscar `tipo_endereco` do destino.
- Se PICKING, executar a validação **item a item** dentro do loop `for (const it of itens)`, usando `it.produto_id`, `it.lote`, `it.data_validade`, `it.quantidade_disponivel`. Ao primeiro item inválido, interromper e mostrar mensagem indicando o SKU e os motivos retornados; nenhum registro deve ter sido gravado (validar todos antes de iniciar os INSERTs — pré-loop de validação, depois loop de gravação).

### 3. `src/pages/coletor/AbastecimentoDestinoPage.tsx`
- Buscar `tipo_endereco` do endereço destino informado.
- Antes de `handleConfirmarEntrega` gravar, se PICKING, validar via RPC usando o produto/lote/quantidade do abastecimento. Bloquear em caso de inválido.

## Notas técnicas

- Manter tipagem via `(supabase as any).rpc(...)` como já é convenção no coletor.
- Reaproveitar `StatusOverlay` existente em cada página — nenhum componente novo.
- Não alterar RPCs nem schema.
- O log em `log_sugestao_armazenagem` é opcional (best-effort try/catch) e só grava quando a validação passa e o INSERT/RPC principal foi bem-sucedido, para manter consistência com o padrão de auditoria já em uso na armazenagem.

## Fora de escopo

- Separação (usa saldo de picking já cadastrado, não cria vínculo novo).
- Recebimento / Armazenagem (já cobertos).
- Alterações visuais nas telas de origem/lista.
