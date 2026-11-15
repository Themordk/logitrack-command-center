-- Status S1 · 5 — Catálogo do nó "Atualizar documento": descrição e exemplo com o resultado da integração.
-- config.resultado_integracao: integrado | ignorado | erro | nao_alterar | ausente (automático: integrado se algum envio deu certo)
-- config.mensagem_erro: texto (aceita {{variáveis}}) usado quando resultado_integracao = erro
UPDATE integracao.retorno_no_catalogo
   SET descricao = 'Declara o resultado da integração deste caminho (integrado, não precisou enviar, erro de negócio) e grava o marcador da regra no documento.',
       config_exemplo = '{"status_integracao": "retornado", "resultado_integracao": "integrado", "marcar_exportado": false}'::jsonb
 WHERE tipo = 'acao.atualizar_documento';
