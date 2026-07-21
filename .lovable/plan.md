
## Situação atual (verificada)

Os itens já entregues em turnos anteriores estão presentes e alinhados ao prompt:

- `src/pages/RegraArmazenagemPage.tsx` — formulário de registro único, 3 cards (Mistura / Motor de sugestão / Status), header com badge dinâmico (Ativo / Inativo / Não configurado), tolerância condicional, botão "Salvar regras" desabilitado sem mudanças. ✔
- `src/pages/coletor/ColetorSugestaoPickingPage.tsx` — 555 linhas, usa `rpc_sugerir_endereco_picking` / `rpc_validar_endereco_picking`, `ColetorLayout`, `ScanField`, `ActionButton`, `useFeedback`, grava `log_sugestao_armazenagem`. ✔
- Rotas `#/armazem/regras-armazenagem` e `#/coletor/sugestao-picking` registradas em `src/App.tsx` (incluindo breadcrumb). ✔
- Item "Regras de Armazenagem" já presente no menu Armazém em `TopNav.tsx`. ✔

Faltam apenas as Tarefas 3 e 4.

## Tarefa 3 — `tipo_alocacao` em picking_produto (dentro de ProdutosPage)

O CRUD de picking do produto não é um `CrudTable/CrudModal` genérico — é uma sub-tela nested com `<table>` própria e formulário manual (`pickForm`) na aba "Picking" de `src/pages/ProdutosPage.tsx`.

Alterações:

1. Estado default `pickForm` (linha 231): incluir `tipo_alocacao: "FIXO"`.
2. Grid de pickings (por volta da linha 511): adicionar `<th>Alocação</th>` e célula com badge exibindo `p.tipo_alocacao ?? "FIXO"`.
3. Formulário de picking (por volta da linha 595, após o select de `tipo_picking`): adicionar `<select>` para `tipo_alocacao` com opções `FIXO` / `ROTATIVO`, ligado a `pickForm.tipo_alocacao`.
4. Save (linhas 243 / 260): incluir `tipo_alocacao` no payload de INSERT/UPDATE — usando `as any` já existente.

## Tarefa 4 — `capacidade_unidades` em Endereços

Em `src/pages/EnderecosPage.tsx`:

1. `columns` (linha 93): adicionar `{ key: "capacidade_unidades", label: "Cap. Unid." }` após a coluna de capacidade existente.
2. `fields` (linha 106): adicionar `{ name: "capacidade_unidades", label: "Capacidade (unidades)", type: "number", required: false }` próximo aos demais campos de capacidade (M³, peso etc.).

Nenhuma migration, RPC, dependência ou componente novo.

## Fora de escopo (Tarefa 7)

Nada é criado no banco, nomes/parâmetros de RPC intactos, sem react-router, sem novos componentes em `components/ui/`, sem instalar dependências.
