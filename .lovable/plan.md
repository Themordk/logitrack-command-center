# Anexos e Evidências no Módulo de Ocorrências

## Verificações feitas antes do plano
- `ocorrencia_anexo` **já está** em `src/integrations/supabase/types.ts` (linha ~3986), com as FKs `created_by`, `ocorrencia_id`, `ocorrencia_historico_id`, `tenant_id`. O Prompt 1 (regenerar tipos) é desnecessário e será pulado.
- Bucket `evidencias` existe, privado, limite 10 MB, com os MIME types citados.
- Políticas de storage já permitem `authenticated` ler/gravar/apagar quando o **primeiro** segmento do path é o `tenant_id` do usuário — ou seja, o path deve ser `{tenant_id}/{ocorrencia_id}/{timestamp}_{arquivo}` (sem prefixo `evidencias/`).

## 1. Constantes de etapas e tipos
`RegistrarOcorrenciaModal.tsx`: ETAPAS passa a ter Conferência e Outros (sem Exclusão), na ordem operacional; TIPOS ganha "Exclusão de documento".
`MotivosOcorrenciaPage.tsx`: mesmos valores nos `enumValues` de `etapa_ocorrencia` e `tipo_ocorrencia_padrao`, e `EXCLUSAO_DOCUMENTO: "Exclusão doc."` no mapa de labels.

## 2. Upload no registro de ocorrência (modal)
- Área tracejada "Anexar evidência (opcional)", 1 arquivo, até 10 MB, `image/*,application/pdf,.xlsx,.docx`, preview (thumb 48px para imagem / ícone + nome + tamanho para documento) e botão X.
- Upload acontece **depois** do RPC `registrar_ocorrencia_operacional` retornar sucesso, usando o `ocorrencia_id` retornado; depois insere em `ocorrencia_anexo` com `origem: 'ADMIN'`. Falha no anexo não desfaz a ocorrência — apenas avisa.
- Campos de quantidade/lote/validade passam a existir sempre, dentro de um bloco colapsável "Detalhes de quantidade (opcional)" fechado por padrão.
- Interface `OcorrenciaContexto` e os parâmetros do RPC ficam inalterados (compartilhados com o coletor).

## 3. Seção "Anexos e Evidências" no detalhe da ocorrência
- `load()` ganha um fetch paralelo de `ocorrencia_anexo` (com nome do usuário via FK `created_by`).
- Nova seção abaixo do card de complementar informações: grid 2 colunas (1 no mobile) com preview de imagem via URL assinada (1 h), ícone para PDF/XLSX/DOCX, nome, tamanho formatado, data, autor, badge de origem (COLETOR azul / ADMIN roxo) e botão de download em nova aba. Vazio → "Nenhum anexo registrado."
- `evidencia_url` legado continua exibido, agora também como card com badge "Legado".
- Upload múltiplo (só quando a ocorrência não está RESOLVIDA/CANCELADA), com validação de tipo/tamanho, barra de progresso, registro em `ocorrencia_historico` ("Anexo adicionado: …") e recarga da lista.

## 4. Anexo nos diálogos de status e histórico
- Diálogo de ação rápida e modal de histórico ganham campo de upload (1 arquivo) abaixo da observação, com preview e remoção; states limpos ao fechar.
- No histórico, o insert passa a usar `.select("id").single()` para vincular `ocorrencia_historico_id` ao anexo.
- Falha de upload nunca reverte a mudança de status nem o histórico — apenas toast de erro.
- Cada entrada da timeline mostra mini-cards dos anexos vinculados (`ocorrencia_historico_id === h.id`), abrindo a URL assinada em nova aba.

## 5. Indicador de anexos na listagem
Em `OcorrenciasOperacionaisPage.tsx`, o `Promise.all` já existente (números de documento) ganha a contagem de anexos dos IDs da página. Na coluna "Ocorrência", abaixo de etapa · tipo, aparece "N anexo(s)" com ícone de clipe; se só houver `evidencia_url` legado, ícone de imagem. Sem coluna nova, sem mudança em filtros/KPIs/paginação.

## 6. Filtro por etapa em Motivos de Ocorrência
Select "Todas as etapas" ao lado da busca, filtrando `crud.data` localmente antes de passar ao `CrudTable`. `useCrud`, `CrudTable` e `CrudModal` não são alterados.

## Observação técnica
O filtro de etapa em Motivos é client-side sobre a página atual do grid (o `useCrud` pagina no servidor), então ele filtra os registros da página carregada.

## Fora de escopo
Nenhuma alteração de banco, storage, coletor, TV ou suporte.
