
## Plano: Substituir `rpc_coletor_armazenagem_buscar_tarefa` por `fn_buscar_dados_armazenagem`

### Análise comparativa

**Função antiga (`rpc_coletor_armazenagem_buscar_tarefa`)** retorna apenas:
`tarefa_id`, `produto_id`, `produto_descricao`, `quantidade_requerida`, `quantidade_armazenada`, `quantidade_restante`.

**Função nova (`fn_buscar_dados_armazenagem`)** retorna:
`tarefa_id`, `produto_id`, `sku`, `descricao`, `qtd_conferida`, `validade`, `fabricacao`, `lote`, `qtd_armazenada`, `varios_pickings`, `enderecos_picking`, `qtd_a_armazenar`.

### Mapeamento de campos (UI atual → Nova função)

| Uso na UI | Campo antigo | Campo novo | Status |
|---|---|---|---|
| Descrição produto | `produto_descricao` | `descricao` | ✅ |
| SKU exibição | (não tinha) | `sku` | ✅ ganho |
| Qtd requerida | `quantidade_requerida` | `qtd_conferida` (lê do conferido) | ✅ |
| Qtd já armazenada | `quantidade_armazenada` | `qtd_armazenada` | ✅ |
| Qtd restante | `quantidade_restante` | `qtd_a_armazenar` | ✅ |
| Lote para `finalizar_armazenagem` | sessionStorage (legado conferência) | `lote` | ✅ ganho — elimina dependência de sessionStorage |
| Validade | sessionStorage | `validade` | ✅ ganho |
| Fabricação | sessionStorage | `fabricacao` | ✅ ganho |
| Endereço picking sugerido | query `picking_produto` | `enderecos_picking` | ✅ elimina query |
| Vários pickings | query manual | `varios_pickings` | ✅ ganho |

### Consultas adicionais que continuam necessárias
1. **`movimento_entrada_id`** (via `tarefa.id_documento_origem` → `movimento_entrada_item`) — obrigatório para `finalizar_armazenagem`. **Não vem na nova função.** ⚠️
2. **`rpc_coletor_armazenagem_execucao`** (estoque pulmão/picking, totais) — continua útil para cards de stats.
3. **Lookup de endereço destino** ao escanear (continua, é leitura específica do scan do operador).

### Recomendação
Sugerir adicionar `movimento_entrada_id` ao retorno de `fn_buscar_dados_armazenagem` para eliminar a última consulta acessória pré-execução. Caso contrário, mantemos o lookup atual (1 query, aceitável).

### Mudanças no código

**1. `src/pages/coletor/ArmazenagemIniciarPage.tsx`**
- Trocar chamada `rpc_coletor_armazenagem_buscar_tarefa` por `fn_buscar_dados_armazenagem`.
- Parâmetros: `p_tenant_id`, `p_empresa_ids: [empresaId]` (array), `p_ean: code`.
- Atualizar interface `TarefaResult` para os novos nomes (`descricao`, `sku`, `qtd_a_armazenar`, `qtd_armazenada`, `lote`, `validade`, `fabricacao`, `enderecos_picking`, `varios_pickings`).
- Persistir em `sessionStorage` os novos campos: `coletor_armazenagem_lote`, `coletor_armazenagem_validade`, `coletor_armazenagem_fabricacao`, `coletor_armazenagem_picking_sugerido`, `coletor_armazenagem_varios_pickings`, além dos existentes.
- Exibir SKU na tela de confirmação (ganho de UX).

**2. `src/pages/coletor/ArmazenagemExecucaoPage.tsx`**
- **Remover query** `picking_produto` (passa a ler `coletor_armazenagem_picking_sugerido` do sessionStorage).
- Lote/validade/fabricação já vêm da função e ficam no sessionStorage — fluxo `handleConfirm` permanece igual (já lê do sessionStorage).
- Manter query de `movimento_entrada_id` (a menos que função seja estendida).
- Manter `rpc_coletor_armazenagem_execucao` para cards de estoque.
- Se `varios_pickings = 'S'`, exibir aviso "Produto possui múltiplos pickings".

### Diagrama do fluxo simplificado

```text
ANTES                                  DEPOIS
─────                                  ──────
Iniciar:  1 RPC buscar_tarefa          Iniciar:  1 RPC fn_buscar_dados_armazenagem
                                                 (já traz lote/val/fab/picking)
Execução: 1 RPC execucao (stats)       Execução: 1 RPC execucao (stats)
          1 query tarefa                         1 query tarefa→mov_entrada
          1 query mov_entrada_item               (− picking_produto eliminado)
          1 query picking_produto
          1 RPC finalizar                        1 RPC finalizar
─────                                  ──────
Total: 5 idas ao backend               Total: 4 idas ao backend (− 1 query)
```

### Observações técnicas
- `p_empresa_ids` é `uuid[]` — passar `[empresaId]`.
- `enderecos_picking` provavelmente vem como string concatenada (ex: "R01-P02-N01-A01"); tratar como `text` para exibição direta.
- `varios_pickings` provavelmente é `'S'/'N'` — interpretar como flag booleana.
- Datas (`validade`, `fabricacao`) chegam como `YYYY-MM-DD` — passar diretamente para `finalizar_armazenagem`.
- Sugestão opcional: estender `fn_buscar_dados_armazenagem` para retornar também `movimento_entrada_id` e `hu_id` (se aplicável), eliminando a última query intermediária.

### Arquivos modificados
- `src/pages/coletor/ArmazenagemIniciarPage.tsx`
- `src/pages/coletor/ArmazenagemExecucaoPage.tsx`
