# Metas & Resultados no coletor

## Objetivo
Substituir o conteúdo provisório de `/coletor/metas` por uma tela mobile completa, baseada nos dados da RPC existente `fn_coletor_metas_operador`.

## Implementação
- Reescrever a página principal com períodos Hoje, 7 dias e 30 dias, estados de carregamento/erro e abas Resumo, Ranking e Evolução.
- Criar componentes focados para o anel de score, indicadores, sequência de dias, resumo de tempos, ranking e evolução diária.
- Exibir score e faixa de performance, variação contra o período anterior, sequência, tarefas, ocupação, produtividade e posição na equipe.
- Manter o estilo escuro e compacto do coletor, incluindo valores numéricos estáveis e controles apropriados para toque.
- Consumir somente a RPC existente usando o tenant e o operador da sessão local, sem alterações no banco ou na rota.

## Validação
- Verificar tipos e compilação.
- Conferir a tela no tamanho mobile do coletor, incluindo carregamento, ausência de dados e conteúdo com listas/gráficos.

## Arquivos
- Reescrever `src/pages/coletor/MetasPage.tsx`.
- Criar os seis componentes em `src/pages/coletor/metas/`.
- Não alterar `src/App.tsx`, banco de dados ou dependências.
