# Plano — Performance e exatidão do relatório Posição de Estoque

## Diagnóstico (causa raiz confirmada)

A tabela `estoque_geral` tem **39.127 linhas**. O serviço atual (`src/modules/reports/estoque/estoque.service.ts`) faz:

```ts
.from("estoque_geral").select(... produto(...), endereco(...))
.eq("tenant_id", ...).order("atualizado_em", desc).limit(500)
```

…e **só depois, em memória**, aplica `sku`, `marca`, `armazem_id`, `tipo_endereco`, `tipo_estoque_id`, `setor_id`, `grupo_id`, `subgrupo_id`, `codigo_endereco`.

Consequências:
1. **Inexatidão (bug reportado):** o SKU `9026358` existe em `produto` (2 registros) mas não aparece entre as 500 linhas mais recentes de `estoque_geral` → resultado vazio. O filtro EAN funciona porque ele já resolve `produto_id` no servidor (`.in("produto_id", ...)`) antes do `limit(500)`.
2. **Performance:** trazemos sempre 500 linhas + joins de `produto` e `endereco` mesmo quando o usuário filtra por 1 SKU. Em tenants maiores, isso desperdiça payload e CPU.
3. **Filtros silenciosamente ignorados** quando o registro alvo está fora da janela das 500 mais recentes (mesmo problema para Grupo, Subgrupo, Marca, Setor, Armazém, Código de Endereço).

## Correção (somente `estoque.service.ts`)

Replicar o padrão já usado para EAN: **resolver filtros de tabelas relacionadas no servidor** antes de consultar `estoque_geral`, e empurrar o máximo para a query principal.

### A. Pré-resolução server-side de `produto_id`
Quando houver qualquer um destes filtros: `sku`, `ean`, `marca`, `grupo_id`, `subgrupo_id`, `parceiro_id`:
- Consultar `produto` com `.eq("tenant_id")`, `.eq("empresa_id")` quando aplicável.
- `sku`: usar `.ilike("sku", `%${sku}%`)` (case-insensitive, mantém busca parcial atual).
- `marca`: `.ilike("marca", `%${marca}%`)`.
- `grupo_id`, `subgrupo_id`, `parceiro_id`: `.eq(...)`.
- Se houver EAN, intersectar com os `produto_id` vindos de `produto_embalagem`.
- Coletar `produto.id` (limit alto, ex.: 5000) e aplicar `.in("produto_id", ids)` na query principal. Se vier vazio → retornar `[]` (igual ao tratamento atual do EAN).

### B. Pré-resolução server-side de `endereco_id`
Quando houver `armazem_id`, `tipo_endereco`, `tipo_estoque_id`, `setor_id` ou `codigo_endereco`:
- Consultar `endereco` com esses filtros + `tenant_id`.
- Aplicar `.in("endereco_id", ids)` na query principal. Vazio → `[]`.
- Para evitar estourar payload com endereços, paginar internamente em lotes de 1000 ids se necessário (na prática, com `armazem_id` informado já fica pequeno; sem ele e com `tipo_endereco`, restringimos por `armazem_id` quando disponível no contexto).

### C. Limite e ordenação
- Aumentar `limit` para **2000** quando há filtros restritivos (SKU/EAN/endereço/grupo) — suficiente para qualquer caso unitário e mantém o teto. Sem filtros restritivos, manter 500 e exibir aviso na UI já existente.
- Manter `order("atualizado_em", desc)` apenas como tie-breaker; ordenação final continua no cliente (sku, descricao, validade, total desc).

### D. Higienização de filtros
- `trim()` em `sku`, `ean`, `marca`, `codigo_endereco` antes de aplicar (evita strings com espaço quebrando o match).
- `sku` e `ean` com `length === 0` após trim → ignorar.

## Índices recomendados (opcional, segunda etapa)
Se a query continuar lenta após o fix, criar índices via migration:
- `produto (tenant_id, sku)` — busca por SKU.
- `produto_embalagem (ean)` — já provavelmente existe; verificar.
- `estoque_geral (tenant_id, produto_id)` e `estoque_geral (tenant_id, endereco_id)`.

Esses não são necessários para resolver o bug; só entram se `EXPLAIN ANALYZE` mostrar seq scan custoso. Confirmar com `supabase--slow_queries` antes.

## O que NÃO muda
- UI (`EstoqueReportPage.tsx`) permanece igual — mesmos filtros, mesmas colunas, mesmos exports.
- Schema do banco não muda nesta primeira etapa.
- Comportamento do filtro EAN preservado.

## Arquivos
- `src/modules/reports/estoque/estoque.service.ts` (único arquivo editado)

## Validação após implementar
1. Filtrar SKU `9026358` → deve retornar as linhas de `estoque_geral` correspondentes (se houver saldo).
2. Filtrar EAN equivalente → mesmo resultado.
3. Filtrar por Armazém + Tipo Endereço PICKING → conferir contagem.
4. Sem filtros → comportamento atual (top 500 recentes).
