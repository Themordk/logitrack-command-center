## Problema
Após criar um inventário em `/atividades/inventario/novo`, o sistema navega para `/inventario/<id>`, uma rota inexistente que exibe apenas "Em desenvolvimento".

## Solução
Alterar a chamada de navegação no `handleSave` de `NovoInventarioPage.tsx` (linha 356) para redirecionar à lista de inventários:

- **De:** `onNavigate(\`/inventario/${inventarioId}\`);`
- **Para:** `onNavigate("/atividades/inventario");`

## Escopo
- Apenas `src/pages/NovoInventarioPage.tsx`, 1 linha.
- Nenhuma migração, RPC ou outra tela envolvida.