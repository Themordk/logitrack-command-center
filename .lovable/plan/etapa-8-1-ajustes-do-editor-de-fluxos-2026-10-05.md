# Etapa 8.1 — Ajustes do editor de fluxos

## Alterações
- Em `FluxoEditorPage`, manter os nós do resultado do teste ou da versão visualizada em um estado React Flow separado, reinicializado quando a visualização mudar.
- Nesse estado somente leitura, aceitar apenas mudanças de medição e seleção dos nós; ignorar posição, inclusão, remoção e substituição.
- Em `TestarFluxoDialog`, quando houver `barrado_por`, localizar a regra correspondente do gatilho e exibi-la com `descreverRegra` e os nomes de operadores do catálogo.
- Quando não houver `barrado_por`, preservar a mensagem retornada pelo servidor.

## Validação
- Executar TypeScript sem emissão, ESLint apenas em `src/pages/integracao/retornos` e a suíte existente de 64 testes.
- Confirmar que nenhuma outra tela, fluxo ou arquivo de backend foi alterado.
