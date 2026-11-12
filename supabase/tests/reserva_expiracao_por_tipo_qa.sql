-- =====================================================================
-- Teste (desfeito no final) · 20261112100000_tarefa_reserva_expiracao_por_tipo
-- Ambiente: branch-qa (convocação híbrida da expedição já aplicada).
-- Massa: onda #808 (EM_CONFERENCIA, tarefa SEP-CONF livre), admin e PAULO.
-- Resultado na mensagem de erro "TESTE OK/FALHOU (desfeito): ...".
-- =====================================================================
DO $$
DECLARE
  T  uuid := 'f89963dc-9afc-49be-8b70-3559c9fd80bd';
  E  uuid := '2f27f355-5bf3-4cbc-84b5-186101d348c8';
  M  uuid := 'af9ded57-4fc7-44c6-88b4-a61bd6d1eb1d';   -- onda 808
  TP uuid := 'f84603de-9347-4756-8ad8-4cf4ae9a311f';   -- tipo SEP-CONF
  A  uuid := '3f1feeb9-9cde-4a3b-bdef-0613fd7b1bdb';   -- admin
  B  uuid := '8804b352-8d7c-46b9-a72c-17c9f87deba4';   -- PAULO
  log text := ''; falhas int := 0;
  n int; s text; v jsonb; at_id uuid; tk uuid; rr record;
BEGIN
  -- 1. Padrões e trava de ação inválida
  SELECT string_agg(codigo||'='||reserva_acao, ' ' ORDER BY codigo) INTO s FROM tipo_tarefa WHERE tenant_id=T;
  log := log || E'\n01 padrões: ' || s;
  IF s NOT LIKE '%PED-CAN=ALERTAR%' OR s NOT LIKE '%SEP=LIBERAR_SEM_EXECUCAO%' OR s NOT LIKE '%SEP-CONF=LIBERAR%' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  BEGIN
    UPDATE tipo_tarefa SET reserva_acao='LIBERAR' WHERE tenant_id=T AND codigo='PED-CAN';
    falhas:=falhas+1; log := log || E'\n02 PED-CAN=LIBERAR aceito <<FALHA';
  EXCEPTION WHEN OTHERS THEN log := log || E'\n02 PED-CAN=LIBERAR recusado: ' || left(SQLERRM,50); END;

  -- 2. Operador assume a conferência (rotina da expedição)
  n := _fn_onda_assumir(M, TP, A, 'AUTO_CONVOCADO');
  SELECT ta.id, ta.tarefa_id INTO at_id, tk FROM tarefa_atribuicao ta JOIN tarefa t ON t.id=ta.tarefa_id
    JOIN movimento_saida_item msi ON msi.id=t.id_documento_origem
   WHERE msi.movimento_saida_id=M AND t.tipo_tarefa_id=TP AND ta.usuario_id=A AND ta.liberado_em IS NULL LIMIT 1;
  log := log || E'\n03 admin assumiu => >=1 : ' || n || ' (atribuição ' || coalesce(at_id::text,'-') || ')';
  IF at_id IS NULL THEN falhas:=falhas+1; log:=log||' <<FALHA'; RAISE EXCEPTION 'TESTE FALHOU (desfeito): sem massa%', log; END IF;

  SELECT expirada::text||'/'||liberavel::text INTO s FROM fn_tarefa_reservas_status(T, M, ARRAY['SEP-CONF']) WHERE atribuicao_id=at_id;
  log := log || E'\n04 reserva recente => false/false : ' || coalesce(s,'-'); IF s IS DISTINCT FROM 'false/false' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  -- 3. 5h sem atividade -> libera igual "Sair da etapa"
  UPDATE tarefa_atribuicao SET atribuido_em = now() - interval '5 hours' WHERE id=at_id;
  UPDATE tarefa_execucao te SET concluido_em = now() - interval '5 hours'
   FROM tarefa t, movimento_saida_item msi
   WHERE te.tarefa_id=t.id AND msi.id=t.id_documento_origem AND msi.movimento_saida_id=M AND t.tipo_tarefa_id=TP AND te.usuario_id=A;
  SELECT expirada::text||'/'||liberavel::text INTO s FROM fn_tarefa_reservas_status(T, M, ARRAY['SEP-CONF']) WHERE atribuicao_id=at_id;
  log := log || E'\n05 após 5h => true/true : ' || coalesce(s,'-'); IF s IS DISTINCT FROM 'true/true' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  v := fn_tarefa_liberar_reservas_expiradas(T, M, NULL, 'TESTE', ARRAY['SEP-CONF'], true);
  log := log || E'\n06 liberar => liberadas 1 : ' || v::text; IF (v->>'liberadas')::int <> 1 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  SELECT status||'/'||coalesce(motivo_liberacao,'-')||'/'||(liberado_em IS NOT NULL)::text INTO s FROM tarefa_atribuicao WHERE id=at_id;
  log := log || E'\n07 atribuição => LIBERADA/DEVOLUCAO_FILA/true : ' || s; IF s <> 'LIBERADA/DEVOLUCAO_FILA/true' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  SELECT count(*) INTO n FROM tarefa_evento_execucao WHERE tarefa_id=tk AND tipo_evento='REATRIBUICAO' AND carga_util->>'acao'='EXPIRACAO_RESERVA';
  log := log || E'\n08 evento REATRIBUICAO/EXPIRACAO_RESERVA => 1 : ' || n; IF n<>1 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  SELECT status::text INTO s FROM tarefa WHERE id=tk;
  log := log || E'\n09 tarefa volta para a fila => CRIADA : ' || s; IF s<>'CRIADA' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  BEGIN
    v := fn_conferencia_validar_onda(T, E, B, M);
    log := log || E'\n10 outro operador (validador da expedição): ' || (v->>'codigo');
    IF v->>'codigo' = 'CONF_ONDA_RESERVADA' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  EXCEPTION WHEN OTHERS THEN log := log || E'\n10 validador: ' || left(SQLERRM,80); END;

  -- 4. Mesmo operador consegue assumir de novo (nova atribuição, sem duplicidade)
  n := _fn_onda_assumir(M, TP, A, 'AUTO_CONVOCADO');
  SELECT ta.id INTO at_id FROM tarefa_atribuicao ta WHERE ta.tarefa_id=tk AND ta.usuario_id=A AND ta.liberado_em IS NULL;
  log := log || E'\n11 admin reassume => 1 : ' || n; IF n<1 OR at_id IS NULL THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  -- 5. Designação do gestor: nunca libera, só avisa
  UPDATE tarefa_atribuicao SET tipo_convocacao='CONVOCACAO_GESTOR', atribuido_em = now() - interval '5 hours' WHERE id=at_id;
  SELECT designado_gestor::text||'/'||liberavel::text||'/'||alertavel::text INTO s FROM fn_tarefa_reservas_status(T, M, ARRAY['SEP-CONF']) WHERE atribuicao_id=at_id;
  log := log || E'\n12 gestor => true/false/true : ' || coalesce(s,'-'); IF s IS DISTINCT FROM 'true/false/true' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  v := fn_tarefa_liberar_reservas_expiradas(T, M, NULL, 'TESTE', ARRAY['SEP-CONF'], false);
  log := log || E'\n13 liberar com gestor => 0 : ' || (v->>'liberadas'); IF (v->>'liberadas')::int <> 0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  -- 6. Coleta pendente: nunca libera, só avisa
  UPDATE tarefa_atribuicao SET tipo_convocacao='AUTO_CONVOCADO', status='COLETA_PENDENTE' WHERE id=at_id;
  SELECT liberavel::text||'/'||alertavel::text INTO s FROM fn_tarefa_reservas_status(T, M, ARRAY['SEP-CONF']) WHERE atribuicao_id=at_id;
  log := log || E'\n14 coleta pendente => false/true : ' || coalesce(s,'-'); IF s IS DISTINCT FROM 'false/true' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  -- 7. Exceção do próprio operador
  UPDATE tarefa_atribuicao SET status='ATRIBUIDA' WHERE id=at_id;
  v := fn_tarefa_liberar_reservas_expiradas(T, M, A, 'TESTE', ARRAY['SEP-CONF'], false);
  log := log || E'\n15 exceção do próprio operador => 0 : ' || (v->>'liberadas'); IF (v->>'liberadas')::int <> 0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  -- 8. Tipo em NUNCA não entra
  UPDATE tipo_tarefa SET reserva_acao='NUNCA' WHERE id=TP;
  SELECT count(*) INTO n FROM fn_tarefa_reservas_status(T, M, ARRAY['SEP-CONF']);
  log := log || E'\n16 SEP-CONF em NUNCA => 0 : ' || n; IF n<>0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  UPDATE tipo_tarefa SET reserva_acao='LIBERAR' WHERE id=TP;

  -- 9. Rodada completa do cron e integridade
  v := cron_liberar_reservas_tarefas();
  log := log || E'\n17 cron: ' || left(v::text, 300);
  SELECT count(*) INTO n FROM (SELECT tarefa_id FROM tarefa_atribuicao WHERE liberado_em IS NULL GROUP BY 1 HAVING count(*)>1) x;
  log := log || E'\n18 tarefas com 2 donos abertos => 0 : ' || n; IF n<>0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  RAISE EXCEPTION 'TESTE % (desfeito): % falha(s)%', CASE WHEN falhas=0 THEN 'OK' ELSE 'FALHOU' END, falhas, log;
END $$;
