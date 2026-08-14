# Redesign da Grid de Ocorrências + Notificações no TopNav

## 1. Constantes compartilhadas
Novo `src/lib/ocorrenciaConstants.ts` com `STATUS_BADGE`, `STATUS_LABEL`, `STATUS_DOT`, `PRIORIDADE_BADGE`, `PRIORIDADE_CLASS`, `CATEGORIA_BADGE`, `CATEGORIA_LABEL`, `ETAPA_LABEL` (incluindo EXCLUSAO e OUTROS), `TIPO_LABEL` (incluindo EXCLUSAO_DOCUMENTO), `TIPO_DOC_LABEL` e a função `tempoRelativo()`.
As constantes locais duplicadas em `OcorrenciasOperacionaisPage.tsx` e `OcorrenciaDetalhePage.tsx` passam a ser importadas desse arquivo.

## 2. Grid de ocorrências (11 → 8 colunas)
- Barra lateral de urgência na linha (prioridade + status).
- "Ocorrência": nº + badge de prioridade / etapa · tipo.
- "Origem": documento (com número real), produto (SKU + descrição) ou endereço. O número do documento vem de um segundo fetch agrupado por página em `documento_entrada.numero_nota` e `documento_saida.numero_pedido`.
- "Motivo": descrição do motivo, com observação como fallback.
- "Categoria", "Status" (badge com ícone), "Tempo" (relativo colorido, tooltip com data completa) e "Ações".
- Ações: botão Eye + dropdown com transições rápidas conforme o status (Iniciar investigação / Iniciar tratamento / Resolver / Ver detalhes), com o mesmo diálogo de confirmação já usado hoje.
- KPI cards viram filtros clicáveis (toggle) com destaque quando ativos.
- Novo filtro por tipo de ocorrência; etapas passam a incluir Exclusão e Outros.
- Headers ordenáveis (nº, prioridade, status, tempo) com ordenação server-side e ícone de direção.

## 3. Página de detalhe
- Documento de origem vira link navegável para Entradas/Saídas em vez de UUID cru.
- Seção de quantidades só aparece quando há algum valor preenchido.
- Passa a importar as constantes compartilhadas.

## 4. Deep-link `?detalhe=`
`EntradasPage.tsx` e `SaidasPage.tsx` leem o parâmetro na montagem e abrem direto o detalhe do documento.

Detalhe técnico: o projeto usa hash routing, então o parâmetro é lido da parte de query dentro do hash (`window.location.hash`), com fallback para `window.location.search`. A navegação a partir do detalhe da ocorrência usa a mesma forma.

## 5. Notificações no TopNav
Novo `src/components/NotificacoesDropdown.tsx`:
- Busca em `notificacao_painel` (não lidas, do tenant, do usuário ou broadcast), limite 20, polling de 30s.
- Badge com contagem no ícone de sino; painel com lista, tempo relativo, marcar como lida individual, "Limpar todas" via `fn_marcar_notificacoes_lidas`, clique navega para `referencia_rota`, rodapé com atalho para a lista de ocorrências.
- Substitui o sino placeholder no `TopNav` (desktop). O `TopNav` hoje não recebe `onNavigate`? Recebe — será repassado ao dropdown.

## 6. Tipos
`notificacao_painel` e `fn_marcar_notificacoes_lidas` já estão presentes em `src/integrations/supabase/types.ts`; nenhuma alteração de tipos é necessária.

## Fora de escopo
Nenhuma alteração de banco, coletor, TV ou suporte.
