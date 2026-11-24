-- Verificação da PRODUÇÃO depois das migrations (somente leitura).
SELECT json_build_object(
  'migrations_novas', (SELECT json_agg(name ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version > '20261123030000'),
  'tabelas_entrega', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
                       AND table_name IN ('entrega','entrega_parada','entrega_tentativa','entrega_volume','entrega_evento','carga_evento')),
  'gatilhos_situacao', (SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_zz_situacao_%'),
  'situacao_pedidos', (SELECT json_object_agg(etapa || ' / ' || entrega_status, n)
                        FROM (SELECT etapa, entrega_status, count(*) n FROM documento_saida GROUP BY 1, 2) x),
  'eventos_catalogo_novos', (SELECT count(*) FROM integracao.retorno_evento_catalogo
                              WHERE codigo IN ('saida.carga_montada','saida.pedido_embarcado','saida.carga_fechada','saida.saiu_para_entrega',
                                               'saida.entregue','saida.nao_entregue','saida.entrega_estornada','saida.retirado_da_carga')),
  'fix_conferencia', (SELECT position('CONFERENCIA_JA_CONCLUIDA' in pg_get_functiondef('public.fn_gerar_conferencia_saida(uuid,uuid)'::regprocedure)) > 0),
  'ondas_presas_separado', (SELECT array_agg(ms.numero_onda) FROM movimento_saida ms
     WHERE ms.status = 'SEPARADO'
       AND NOT EXISTS (SELECT 1 FROM tarefa t JOIN movimento_saida_item mi ON mi.id = t.id_documento_origem
                        WHERE mi.movimento_saida_id = ms.id AND t.status NOT IN ('CONCLUIDA','CANCELADA'))
       AND EXISTS (SELECT 1 FROM tarefa t JOIN movimento_saida_item mi ON mi.id = t.id_documento_origem
                   JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
                    WHERE mi.movimento_saida_id = ms.id AND t.status = 'CONCLUIDA'))
);
