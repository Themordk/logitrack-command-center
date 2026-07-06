# Contagem Livre — Coleta de Lote / Validade / Fabricação

Na rota `/coletor/inventario/livre/produto`, quando o produto tiver `tipo_controle` diferente de `UNIDADE`, abrir um modal para capturar os campos de rastreabilidade antes de registrar a contagem, seguindo o mesmo padrão da conferência de entrada (`RecebimentoExecucaoPage.tsx`).

## Comportamento por `tipo_controle`

| tipo_controle | Lote | Fabricação | Validade |
|---|---|---|---|
| UNIDADE       | —   | —          | —        |
| LOTE          | obrigatório | obrigatório | obrigatório |
| LOTE_SERIE    | obrigatório | obrigatório | obrigatório |
| VALIDADE      | —   | obrigatório | obrigatório |

Quando `UNIDADE`, mantém o fluxo atual (confirma direto).

## Alterações

### 1. `src/pages/coletor/InventarioLivreProdutoPage.tsx`

- Ao validar o EAN, buscar também `tipo_controle` de `produto` (junto com `sku, descricao`) e guardar no `produtoInfo`.
- Trocar o botão "Confirmar Contagem" por um handler `handleConfirmarClick`:
  - Se `tipo_controle === "UNIDADE"` (ou vazio), chamar `handleConfirmar` (fluxo atual).
  - Caso contrário, abrir novo modal `showLoteModal`.
- Novo modal (copiado do padrão de `RecebimentoExecucaoPage` linhas 421–478), com estados `lote`, `fabricacao`, `validade`:
  - Título "Informações de Validade" ou "Informações do Lote" conforme o tipo.
  - Mostra a quantidade digitada.
  - Campo Lote (LOTE/LOTE_SERIE).
  - Campos data Fabricação e Validade (LOTE, LOTE_SERIE, VALIDADE).
  - Botão CONFIRMAR chama `handleConfirmar` (submit para RPC), desabilitado enquanto campos obrigatórios estiverem vazios.
  - Botão CANCELAR fecha o modal, mantendo os dados do produto/quantidade.
- `handleConfirmar` passa `p_lote`, `p_validade`, `p_fabricacao` ao RPC (usando `"1900-01-01"` como default para datas ausentes e `""` para lote, mesmo padrão da conferência).
- Ao concluir com sucesso (dialog de resultado), limpar também `lote`, `fabricacao`, `validade` (além dos campos já limpos hoje).

### 2. Backend — `fn_inventario_contagem_livre`

A função hoje aceita apenas `p_tenant_id, p_inventario_id, p_usuario_id, p_endereco_codigo, p_ean, p_quantidade`. Precisamos estender a assinatura com 3 parâmetros opcionais para gravar rastreabilidade:

```sql
p_lote text DEFAULT ''
p_validade date DEFAULT '1900-01-01'
p_fabricacao date DEFAULT '1900-01-01'
```

E persistir esses valores no registro da contagem (na mesma tabela onde já são gravadas as contagens livres — usar as mesmas colunas já usadas pelo fluxo dirigido).

Sem essa mudança, a UI ainda funciona, mas os dados de lote/validade não seriam persistidos.

## Fora de escopo

- Nenhuma alteração no fluxo dirigido (`InventarioProdutoPage`).
- Sem mudança de layout do card de produto/embalagem.
- Sem mudança nas telas administrativas.

## Confirmação necessária

Antes de implementar a migration, confirme: **atualizo a função `fn_inventario_contagem_livre` para receber e gravar lote/validade/fabricação?** Se preferir que a função seja ajustada por você no ERP/DB, implemento só o front — mas os dados de rastreabilidade não serão persistidos até a função ser estendida.
