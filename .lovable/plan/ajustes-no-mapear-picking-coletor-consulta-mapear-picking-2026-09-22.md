# Ajustes no Mapear Picking (/coletor/consulta/mapear-picking)

Arquivo alterado: apenas `src/pages/coletor/MapearPickingPage.tsx`. Sem mudanças no banco (a política de `picking_produto` já permite delete — verificado), sem novas RPCs, sem tocar no fluxo de steps, no `handleScanProduto` ou no `handleSubmit`.

## 1. Mover o scan do produto para cima da lista

No step `scan_produto`, reordenar os blocos para:

```text
Card Endereço
ScanField "Escanear EAN do Produto"
Grid "Produtos Mapeados"
```

Hoje o grid fica entre o card e o ScanField; apenas trocar a ordem dos elementos, mantendo os estilos atuais.

## 2. Exclusão de mapeamento por produto (com confirmação)

- Botão de lixeira (ícone `Trash2` do lucide-react) em cada linha do grid "Produtos Mapeados", à direita das colunas Mín/Máx.
- Ao clicar, abrir o diálogo de confirmação existente `src/components/crud/DeleteConfirmDialog.tsx` com título/descrição citando o SKU do produto (ex.: "Excluir mapeamento do produto 5051002 neste endereço?").
- Ao confirmar: exclusão física (padrão do projeto para `picking_produto`) via Supabase:
  - `sb.from("picking_produto").delete().eq("id", item.id).eq("tenant_id", tenantId)`
  - Em caso de erro, mostrar no bloco de erro já existente da tela.
- Após excluir com sucesso, recarregar a lista (`produtosMapeados`) consultando novamente a tabela `picking_produto` pelo `endereco_id` (mesma query já usada no `handleScanEndereco`), para o contador do badge e a lista refletirem a remoção na hora.
- O grid aparece nas etapas de scan do produto e de confirmação; o botão de excluir existe apenas no grid — exatamente onde a lista é renderizada.
- Não alterar: steps existentes, `handleScanEndereco` (exceto reuso da query de recarga em helper), `handleScanProduto`, `handleSubmit` e estilos já presentes.

## Validação

- Typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`) e build sem erros.
