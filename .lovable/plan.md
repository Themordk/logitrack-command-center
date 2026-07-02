## Objetivo
Unificar "Cortar Saldo Não Separado" e "Registrar Ocorrência" em um único botão no coletor de separação. A criação da `ocorrencia_operacional` passa a acontecer dentro da própria RPC `cortar_item_separacao`, mantendo tudo em uma única transação.

## 1. Backend — alterar `public.cortar_item_separacao`

Manter assinatura e comportamento atuais. Adicionar novo parâmetro opcional `p_observacao text DEFAULT NULL` e, antes do bloco final `RETURN json_build_object`, inserir a criação da ocorrência:

- Ler `empresa_id`, `armazem_id`, `produto_id` da própria `tarefa` (já carregada / re-selecionada no início).
- `INSERT INTO public.ocorrencia_operacional` com:
  - `tenant_id`, `empresa_id`, `armazem_id` da tarefa.
  - `etapa_ocorrencia = 'SEPARACAO'`.
  - `tipo_ocorrencia = 'OUTROS'` (fixo — usuário só escolhe motivo).
  - `motivo_ocorrencia_id = p_motivo_ocorrencia`.
  - `produto_id` da tarefa.
  - `documento_origem_id = v_movimento_saida_id`, `tipo_documento_origem = 'MOVIMENTO_SAIDA'`.
  - `quantidade_esperada = v_quantidade_requerida`.
  - `quantidade_real = v_quantidade_separada`.
  - `quantidade_divergente = v_quantidade_a_cortar`.
  - `status = 'ABERTA'`, `prioridade = 'ALTA'`.
  - `observacao = p_observacao`.
  - `criado_por = p_usuario`.
- Retornar também `ocorrencia_id` no JSON de resposta.

Como está tudo dentro da mesma função plpgsql, falha na criação da ocorrência aborta o corte (transação única) — comportamento desejado.

## 2. Frontend — `src/pages/coletor/SeparacaoOcorrenciasPage.tsx`

### Botões
- Substituir os dois botões atuais por **um único**: "Registrar ocorrência e cortar saldo" (variant `danger`, ícone `AlertTriangle`).
- Manter "Solicitar Abastecimento" com regra atual (habilitado só com saldo em pulmão).
- Remover "Solicitar Inventário".

### Modal
Bottom-sheet com:
1. **Motivo** — lista de `motivo_ocorrencia` filtrada por `etapa_ocorrencia = 'SEPARACAO'` (já existe).
2. **Observação** — textarea opcional.
3. **Alerta amarelo informativo** quando `temSaldoPulmao = true`: "Este produto ainda possui saldo em endereço de pulmão. Confirme antes de cortar." (não bloqueia).

Rodapé: Cancelar · Confirmar.

### Chamada
`supabase.rpc('cortar_item_separacao', { p_tenant_id, p_tarefa_id, p_usuario, p_motivo_ocorrencia, p_observacao })`.

Ao sucesso: `resultDialog` "Ocorrência #N registrada e saldo cortado." e avanço para a próxima tarefa (fluxo atual mantido).

## Fora do escopo
- Nenhum outro ajuste de UI administrativa. O registro aparecerá automaticamente em `/atividades/ocorrencias`.
- Sem mudança no `enum_tipo_ocorrencia` — usamos `OUTROS` para todos os cortes.
