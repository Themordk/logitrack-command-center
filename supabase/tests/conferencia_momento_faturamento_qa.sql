-- =====================================================================
-- Teste de QA · 20261110202246_conferencia_momento_faturamento_validador
--               20261110230000_tarefa_reserva_expiracao_por_tipo
-- Rodar no SQL Editor do branch-qa (pwynobnbftqcqygjtrdk).
-- Tudo roda dentro de um DO que termina com RAISE -> NADA é gravado.
-- O resultado aparece na mensagem de erro "RESULTADO (rollback): ...".
--
-- Massa: onda #808 (EM_CONFERENCIA, 1 tarefa SEP-CONF; o script atribui ao admin),
-- tipo de saída ENTREGAS, pedido sem NF.
-- Resultado esperado está ao lado de cada linha (=> ...).
-- =====================================================================
DO $$
DECLARE
  T   uuid := 'f89963dc-9afc-49be-8b70-3559c9fd80bd';
  E   uuid := '2f27f355-5bf3-4cbc-84b5-186101d348c8';
  M   uuid := 'af9ded57-4fc7-44c6-88b4-a61bd6d1eb1d';  -- onda 808
  A   uuid := '3f1feeb9-9cde-4a3b-bdef-0613fd7b1bdb';  -- admin (dono da tarefa)
  B   uuid := '8804b352-8d7c-46b9-a72c-17c9f87deba4';  -- outro operador
  TS  uuid := 'e6dcab7c-0e93-4104-869d-d71a9e1e3888';  -- tipo ENTREGAS
  DOC uuid := '215ed3fb-dbed-4c86-8bc4-f75c95887618';
  TK  uuid := 'f6776865-65ef-4c4f-a977-7b6e794eeba2';
  log text := '';
  n int; s text; prov text; auth uuid;
BEGIN
  SELECT auth_user_id INTO auth FROM usuario WHERE id = A;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', auth, 'role','authenticated')::text, true);
  SELECT id INTO prov FROM integracao.erp_provedor LIMIT 1;
  -- Reserva nunca expira na 1ª parte (a reserva do admin na massa é antiga)
  UPDATE tipo_tarefa SET reserva_acao = 'NUNCA' WHERE tenant_id=T AND codigo='SEP-CONF';
  -- Garante a massa: admin com a onda reservada (a correção 20261110214500 liberou a reserva antiga no QA)
  UPDATE movimento_saida SET status='EM_CONFERENCIA' WHERE id=M AND status='SEPARADO';
  PERFORM * FROM conferencia_buscar_tarefas(T,E,A,M);

  -- PRÉ-FATURAMENTO (comportamento atual)
  log := log || E'\n01 PRE validar(A)            => OK : ' || (fn_conferencia_validar_onda(T,E,A,M)->>'codigo');
  log := log || E'\n02 PRE validar(B)            => CONF_ONDA_RESERVADA : ' || (fn_conferencia_validar_onda(T,E,B,M)->>'codigo');
  SELECT count(*) INTO n FROM conferencia_buscar_ondas(T,E,A) WHERE movimento_saida_id=M;
  log := log || E'\n03 PRE lista(A) tem 808      => 1 : ' || n;
  SELECT count(*) INTO n FROM conferencia_buscar_ondas(T,E,B) WHERE movimento_saida_id=M;
  log := log || E'\n04 PRE lista(B) tem 808      => 0 : ' || n;

  -- PÓS-FATURAMENTO sem NF
  UPDATE tipo_saida SET momento_conferencia='POS_FATURAMENTO' WHERE id=TS;
  log := log || E'\n05 POS validar(A)            => CONF_AGUARDANDO_NF : ' || (fn_conferencia_validar_onda(T,E,A,M)->>'codigo');
  log := log || E'\n06 contar_aguardando(A)      => 1 : ' || conferencia_contar_aguardando_nf(T,E,A);
  SELECT count(*) INTO n FROM conferencia_buscar_ondas(T,E,A) WHERE movimento_saida_id=M;
  log := log || E'\n07 POS lista(A) tem 808      => 0 : ' || n;
  BEGIN
    PERFORM * FROM conferencia_buscar_tarefas(T,E,A,M);
    log := log || E'\n08 POS iniciar(A)            => erro CONF_AGUARDANDO_NF : NAO BLOQUEOU';
  EXCEPTION WHEN OTHERS THEN log := log || E'\n08 POS iniciar(A)            => erro CONF_AGUARDANDO_NF : ' || SQLERRM; END;
  log := log || E'\n09 confirmar item sem NF     => CONF_NF_NAO_AUTORIZADA : ' || (conferencia_saida_confirmacao(T,TK,1,A,'manual')->>'codigo');

  -- NF cancelada não libera; NF autorizada libera
  INSERT INTO documento_saida_nf (tenant_id, empresa_id, documento_saida_id, erp_provedor_id, id_externo, numero_nf, situacao)
  VALUES (T,E,DOC,prov,'qa-canc','999001','CANCELADA');
  log := log || E'\n10 só NF CANCELADA           => CONF_AGUARDANDO_NF : ' || (fn_conferencia_validar_onda(T,E,A,M)->>'codigo');
  INSERT INTO documento_saida_nf (tenant_id, empresa_id, documento_saida_id, erp_provedor_id, id_externo, numero_nf, situacao)
  VALUES (T,E,DOC,prov,'qa-aut','999002','AUTORIZADA');
  log := log || E'\n11 NF AUTORIZADA             => OK : ' || (fn_conferencia_validar_onda(T,E,A,M)->>'codigo');
  SELECT count(*) INTO n FROM conferencia_buscar_ondas(T,E,A) WHERE movimento_saida_id=M;
  log := log || E'\n12 lista(A) tem 808          => 1 : ' || n;
  SELECT count(*) INTO n FROM conferencia_buscar_tarefas(T,E,A,M);
  log := log || E'\n13 iniciar(A) linhas         => 1 : ' || n;

  -- Status inválido não é mais revertido
  UPDATE movimento_saida SET status='CONFERIDO' WHERE id=M;
  BEGIN
    PERFORM * FROM conferencia_buscar_tarefas(T,E,A,M);
    log := log || E'\n14 iniciar onda CONFERIDO    => erro CONF_STATUS_ONDA : NAO BLOQUEOU';
  EXCEPTION WHEN OTHERS THEN log := log || E'\n14 iniciar onda CONFERIDO    => erro CONF_STATUS_ONDA : ' || SQLERRM; END;
  SELECT status::text INTO s FROM movimento_saida WHERE id=M;
  log := log || E'\n15 status continua           => CONFERIDO : ' || s;

  -- Sem tarefa para o operador: não muda status
  UPDATE movimento_saida SET status='SEPARADO' WHERE id=M;
  BEGIN
    PERFORM * FROM conferencia_buscar_tarefas(T,E,B,M);
    log := log || E'\n16 iniciar(B) reservada      => erro CONF_ONDA_RESERVADA : NAO BLOQUEOU';
  EXCEPTION WHEN OTHERS THEN log := log || E'\n16 iniciar(B) reservada      => erro CONF_ONDA_RESERVADA : ' || SQLERRM; END;
  SELECT status::text INTO s FROM movimento_saida WHERE id=M;
  log := log || E'\n17 status continua           => SEPARADO : ' || s;
  SELECT count(*) INTO n FROM conferencia_buscar_tarefas(T,E,A,M);
  SELECT status::text INTO s FROM movimento_saida WHERE id=M;
  log := log || E'\n18 iniciar(A)                => 1 / EM_CONFERENCIA : ' || n || ' / ' || s;

  -- Expiração da reserva (4h sem atividade)
  UPDATE tipo_tarefa SET reserva_acao = 'LIBERAR', reserva_expira_min = 240 WHERE tenant_id=T AND codigo='SEP-CONF';
  UPDATE tarefa_atribuicao SET atribuido_em = now() - interval '5 hours' WHERE tarefa_id=TK AND usuario_id=A;
  UPDATE tarefa_execucao   SET concluido_em = now() - interval '5 hours' WHERE tarefa_id=TK AND usuario_id=A;
  log := log || E'\n20 B c/ reserva A expirada   => OK / 1 : ' || (fn_conferencia_validar_onda(T,E,B,M)->>'codigo')
                || ' / ' || (fn_conferencia_validar_onda(T,E,B,M)->>'reservas_expiradas');
  SELECT count(*) INTO n FROM conferencia_buscar_tarefas(T,E,B,M);
  log := log || E'\n21 iniciar(B) linhas         => 1 : ' || n;
  SELECT (SELECT count(*) FROM tarefa_atribuicao WHERE tarefa_id=TK AND usuario_id=A)::text || ' / ' ||
         (SELECT count(*) FROM tarefa_reserva_liberacao WHERE tarefa_id=TK AND usuario_id=A AND origem='COLETOR_INICIO')::text INTO s;
  log := log || E'\n22 atribuição A removida / auditada => 0 / 1 : ' || s;
  log := log || E'\n23 validar(A) com B ativo    => CONF_ONDA_RESERVADA : ' || (fn_conferencia_validar_onda(T,E,A,M)->>'codigo');
  UPDATE tarefa_atribuicao SET atribuido_em = now() - interval '5 hours' WHERE tarefa_id=TK AND usuario_id=B;
  SELECT count(*) INTO n FROM conferencia_buscar_tarefas(T,E,A,M);
  SELECT status INTO s FROM tarefa_atribuicao WHERE tarefa_id=TK AND usuario_id=A;
  log := log || E'\n24 A retoma após B expirar  => 1 / ATRIBUIDA : ' || n || ' / ' || s;

  -- Confirmação com NF autorizada
  log := log || E'\n19 confirmar item com NF     => CONFERENCIA_REGISTRADA : ' || (conferencia_saida_confirmacao(T,TK,1,A,'manual')->>'codigo');

  RAISE EXCEPTION 'RESULTADO (rollback): %', log;
END $$;
