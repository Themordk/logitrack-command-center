## Plano — Interatividade dos KPIs do Dashboard (Grupo A)

Aplicar as instruções do arquivo `prompt-lovable-dashboard-grupo-a.md` no arquivo `src/pages/Dashboard.tsx`, sem criar telas novas nem alterar consultas/lógica.

### Correção de bug
- Trocar as 2 ocorrências de `/atividades/movimento-saida` por `/atividades/mov-saida` (cards "Taxa de Conclusão" e "Fila de Espera").

### Adicionar `onClick` nos KPI cards restantes
Conforme mapeamento do prompt:
- **Produtividade** → `/relatorios/produtividade`
- **Em Andamento** → `/atividades/mov-saida`
- **Operadores Ativos** → `/relatorios/produtividade`
- **Unidades Movimentadas** → `/relatorios/movimentacoes`
- **Acurácia Operacional** → `/atividades/ocorrencias`

(Confirmarei as rotas exatas em `App.tsx` antes de editar; se alguma divergir do prompt, ajusto para a rota realmente registrada.)

### Escopo intacto
- Nenhuma mudança em `KPICardPro.tsx`, `TendenciaChart.tsx`, filtros, layout, RPCs ou dependências.
- Nenhuma rota nova nem página nova.

### Verificação
- Após edição, revisar o arquivo para confirmar que todos os cards navegam corretamente e que não há mais referência a `/atividades/movimento-saida`.
