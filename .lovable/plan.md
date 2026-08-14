# Exclusão de Documentos de Entrada e Saída com Rastreabilidade

Permitir excluir documentos pendentes (entrada e saída) em lote, com motivo obrigatório, gerando ocorrência operacional pelo backend, e consultar depois os documentos excluídos.

## Estado verificado no backend
- `fn_excluir_documento_entrada(p_tenant_id, p_empresa_id, p_documento_entrada_id, p_usuario_id, p_motivo_ocorrencia_id, p_observacao)` e `fn_excluir_documento_saida(...p_documento_saida_id...)` existem.
- `documento_entrada` e `documento_saida` já possuem `excluido_em`, `excluido_por`, `motivo_exclusao_id`, `observacao_exclusao`.
- `motivo_ocorrencia` possui `etapa_ocorrencia` e `ativo`; o enum de etapa inclui `EXCLUSAO` e `OUTROS`.
- `ocorrencia_operacional` guarda `documento_origem_id` + `tipo_documento_origem`, então a ocorrência gerada pode ser localizada a partir do documento (o documento não guarda o id da ocorrência).

## O que será feito

### 1. Novo modal `src/components/documentos/ExcluirDocumentosModal.tsx`
- Props: `isOpen`, `onClose`, `onSuccess`, `documentoIds`, `tipoDocumento` ('entrada' | 'saida').
- Cabeçalho "Excluir N Documento(s) de Entrada/Saída" com ícone AlertTriangle âmbar e card de aviso amber explicando que a exclusão gera ocorrência e os documentos podem ser reimportados do ERP.
- Select obrigatório de Motivo: motivos ativos do tenant com etapa `EXCLUSAO`; se vazio, cai para etapa `OUTROS`.
- Textarea opcional de Observação.
- Resumo dos documentos (número da nota/pedido + parceiro), carregado pelo próprio modal a partir dos ids.
- Botões Cancelar / Confirmar Exclusão (destructive, ícone Trash2) com estado de carregamento.
- Executa a RPC correspondente documento a documento; interrompe e reporta erro quando `success: false`, usando `parseError` para erros genéricos. Toast de sucesso com a quantidade excluída e o número da última ocorrência; chama `onSuccess()` e fecha.

### 2. `EntradasPage.tsx` e `SaidasPage.tsx`
- Botão "Excluir Selecionados" ao lado de "Gerar Movimento"/"Gerar Onda", destrutivo, habilitado só com seleção; abre o modal.
- Toggle "Pendentes" | "Excluídos" acima da tabela:
  - "Excluídos" consulta `status = 99`, esconde checkboxes e botões de ação, exibe colunas "Excluído em" e "Excluído por" (join com `usuario`) e badge vermelho "EXCLUÍDO" na linha.
  - O botão de detalhe (Eye) continua disponível nos dois modos.
- Ao trocar de aba: reset de página e de seleção; invalidação/refetch da lista após exclusão.

### 3. `DocEntradaDetalhePage.tsx` (e mesmo tratamento no detalhe de saída)
- Mapa de status ganha `99: Excluído` em vermelho.
- Quando `status = 99`, bloco de informações de exclusão: quem excluiu, quando, motivo e observação.
- Busca a ocorrência gerada por `documento_origem_id = documentoId` e exibe o número da ocorrência quando existir.

### 4. Mapeamento de status
- Adicionar a entrada `99 = Excluído` (vermelho) nos mapas de status usados por essas telas.

## Detalhes técnicos
- `tenantId`, `empresaId`, `usuarioId` via `useTenant()`; React Query para listas e invalidação; `sonner` para toasts; `formatDate`/`formatDateTime` de `@/utils/dateTime`.
- `src/integrations/supabase/types.ts` é gerado automaticamente pelo Supabase e não será editado à mão — as telas já acessam essas tabelas via `(supabase as any)`, então os novos campos funcionam sem alteração de tipos.
- Exclusão sequencial (loop) para preservar a mensagem de erro por documento, conforme especificado.
