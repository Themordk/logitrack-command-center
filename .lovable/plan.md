# Plano — Ocorrências operacionais unitárias + Erro Transporte unificado

## Parte 1 — Registro unitário de ocorrências (item divergente por item)

Hoje, no passo "Registrar ocorrências operacionais" do modal `LiberarArmazenagemModal`, o botão único `Registrar ocorrências e liberar` só habilita quando TODOS os divergentes têm motivo preenchido. Vamos tornar a operação **unitária**.

### `src/components/movimento-entrada/LiberarArmazenagemModal.tsx`

- Adicionar estado `liberadosIds: Set<string>` para marcar itens já registrados nesta sessão do modal.
- Em cada card de item divergente (loop em `grupos.divergentes`), adicionar dentro do próprio card um botão **"Registrar ocorrência e liberar item"**:
  - Habilita só quando o motivo daquele item está preenchido.
  - Ao clicar, chama `liberar_armazenagem` RPC passando apenas aquele item:
    - `p_modo: "CONFERIDOS"`
    - `p_item_ids: [it.id]`
    - `p_itens_divergentes: [{ item_id, motivo_ocorrencia_id, observacao }]`
  - Em sucesso, adiciona o id em `liberadosIds`, exibe toast e o card passa a aparecer com badge verde "Liberado" + campos desabilitados (motivo/observação readonly, botão somem).
- Loading individual por item (`Record<string,boolean>` em `loadingItemIds`) — só o botão daquele card mostra spinner.
- O botão global do footer muda para **"Registrar todos pendentes e liberar"** e continua chamando `handleRegistrarOcorrencias`, mas agora:
  - Considera só os divergentes **ainda não** liberados E com motivo preenchido (filtra `liberadosIds` e ignora os sem motivo).
  - Se não houver nenhum elegível, fica desabilitado.
- Botão "Cancelar" do footer vira **"Fechar"** quando todos os divergentes já foram tratados; ao fechar, chama `onSuccess?.()` para refrescar a tela.
- Se após uma liberação individual `divergentes.length === liberadosIds.size`, automaticamente chama `onSuccess?.()` e `onClose()` (com pequeno toast final).
- Não muda nada no RPC `liberar_armazenagem` — ele já aceita lista de 1 item e já cria uma ocorrência por item no loop interno.

## Parte 2 — Unificar "Liberar recebimento com erro no transporte" e gravar em `ocorrencia_operacional`

Hoje `handleConfirmarErroTransporte` em `src/pages/MovimentoEntradaPage.tsx` só atualiza `movimento_entrada` (status `LIBERADO`, `motivo_ocorrencia`, `usuario_autorizou`, `autorizado_em`) — **não** grava em `ocorrencia_operacional`. Vamos unificar a UI com o estilo do modal de registrar ocorrências e gravar uma **única ocorrência de cabeçalho**.

### Backend — nova RPC `liberar_recebimento_erro_transporte` (migration)

Função SQL `SECURITY DEFINER` com assinatura:

```
liberar_recebimento_erro_transporte(
  p_movimento_entrada_id uuid,
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_motivo_ocorrencia_id uuid,
  p_observacao text default null
) returns jsonb
```

Comportamento:
1. Lock + validações: movimento existe; status atual permite (apenas `GERADO`, `LIBERADO`, `EM_CONFERENCIA`); `total_volume <> total_volume_conferido`. Caso contrário, retorna `{sucesso:false, mensagem:...}`.
2. `INSERT INTO ocorrencia_operacional`:
   - `etapa_ocorrencia = 'RECEBIMENTO'`
   - `tipo_ocorrencia = 'OUTROS'`
   - `motivo_ocorrencia_id = p_motivo_ocorrencia_id`
   - `documento_origem_id = p_movimento_entrada_id`, `tipo_documento_origem = 'MOVIMENTO_ENTRADA'`
   - `produto_id = null`
   - `quantidade_esperada = total_volume`, `quantidade_real = total_volume_conferido`, `quantidade_divergente = abs(total_volume - total_volume_conferido)`
   - `status = 'RESOLVIDA'`, `resolvido_por = p_usuario_id`, `resolvido_em = now()`, `resolucao = 'Aprovada pelo supervisor — liberação com erro no transporte'`
   - `prioridade = 'ALTA'`
   - `observacao = coalesce(p_observacao, 'Liberação de recebimento com erro no transporte')`
   - `criado_por = p_usuario_id`, `tenant_id`, `empresa_id`, `armazem_id` do movimento.
3. `UPDATE movimento_entrada SET status='LIBERADO', motivo_ocorrencia=p_motivo_ocorrencia_id, usuario_autorizou=p_usuario_id, autorizado_em=current_date`.
4. Retorna `jsonb_build_object('sucesso', true, 'ocorrencia_id', v_oco_id, 'mensagem', 'Recebimento liberado com erro no transporte e ocorrência registrada.')`.
5. `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;`

### Frontend — novo componente e remoção do modal inline

- Criar `src/components/movimento-entrada/LiberarErroTransporteModal.tsx` no mesmo padrão visual do `LiberarArmazenagemModal` (ícone `Truck`, KPIs de Volume Esperado / Volume Conferido / Diferença em destaque vermelho, alerta laranja explicativo, select de motivo + textarea de observação).
  - Props: `open, onClose, movimentoEntradaId, onSuccess`.
  - Ao abrir, busca `movimento_entrada(total_volume, total_volume_conferido)` e a lista de `motivo_ocorrencia` ativos do tenant/armazem. Se volumes iguais, mostra estado "vazio" com toast e fecha (mantém a guarda atual).
  - Botão **"Registrar ocorrência e liberar"** chama `supabase.rpc('liberar_recebimento_erro_transporte' as any, {...})`.
  - Tratamento de erros idêntico ao outro modal.
- Em `src/pages/MovimentoEntradaPage.tsx`:
  - Remover estado e Dialog inline (`showErroModal`, `erroMovId`, `selectedMotivo`, `motivos`, `erroSubmitting`, `handleConfirmarErroTransporte`, JSX do Dialog).
  - `openErroTransporteModal` passa a só validar volumes e abrir `<LiberarErroTransporteModal>`.
  - Importar e renderizar o novo modal junto com o `LiberarArmazenagemModal` no final do JSX.
  - `onSuccess` chama `fetchMovements()` e `loadDetails(...)` se o movimento selecionado for o mesmo.

## Detalhes técnicos

- A coluna `tipo_documento_origem` em `ocorrencia_operacional` precisa aceitar o valor `'MOVIMENTO_ENTRADA'`. Se for enum, a migration fará `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'MOVIMENTO_ENTRADA'` antes do `CREATE FUNCTION` (em transação separada, conforme limitações do Postgres).
- Não exigir `produto_id` (a coluna já é nullable hoje — confirmar pelo `information_schema` antes de gravar a migration; se NOT NULL, a migration fará `ALTER COLUMN produto_id DROP NOT NULL`).
- Não alterar `types.ts` manualmente — usar `(supabase as any)` / `rpc("liberar_recebimento_erro_transporte" as any, ...)`.
- Sem novas dependências, sem mudança de roteamento, sem hardcode de tenant/empresa/UUID.
- Toda a lógica fica na RPC; frontend só prepara payload.
