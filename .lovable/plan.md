

# Plano: Elevar Performance de Loading — Movimentos de Entrada e Ondas de Carregamento

## Problema Atual

Ambas as telas sofrem do problema classico **N+1 queries**: para cada registro da lista principal, o frontend faz 2-4 requisicoes adicionais ao Supabase para buscar dados relacionados (parceiro, box, documento, etc). Com 20 registros por pagina, isso gera **40-80 requisicoes HTTP** so para montar a lista.

### Movimentos de Entrada — Diagnostico

```text
fetchMovements() — POR CADA MOVIMENTO (x20):
  1. movimento_entrada_documento → buscar documento_entrada_id
  2. documento_entrada → buscar parceiro_id
  3. parceiro → buscar razaosocial
  Total: 3 queries x 20 = 60 queries extras

loadDetails() — AO CLICAR NUM MOVIMENTO:
  1. vw_movimento_entrada_resumo (1 query)
  2. vw_movimento_entrada_conferencia_detalhe (1 query)
  3. vw_movimento_entrada_armazenagem_detalhe (1 query)
  4. movimento_entrada_item → produto_ids (1 query)
  5. picking_produto + produto_embalagem (2 queries)
  6. movimento_entrada → box_id, armazem_id (1 query)
  7. box + armazem (2 queries)
  8. movimento_entrada_documento → doc_ids (1 query)
  9. POR CADA DOC: documento_entrada + parceiro + count items (3 x N)
  Total: ~12 + 3*N queries
```

### Ondas de Carregamento — Diagnostico

```text
fetchMovimentos() — POR CADA ONDA (x20):
  1. box → buscar descricao
  2. movimento_saida_documento → buscar primeiro doc
  3. documento_saida → buscar parceiro_id
  4. parceiro → buscar razaosocial
  Total: 4 queries x 20 = 80 queries extras

loadTabData() — AO CLICAR NUMA ONDA:
  1-3. 3 views (resumo, separacao, conferencia)
  4. movimento_saida_documento
  5. POR CADA DOC: documento_saida + parceiro (2 x N)
  Total: 4 + 2*N queries
```

---

## Solucao: Views Consolidadas no Banco

Seguindo a arquitetura `view-driven-ui` ja estabelecida no projeto, criaremos **2 views novas** para a listagem principal e **2 views novas** para os documentos vinculados. Isso elimina 100% das queries N+1.

### Novas Views

#### 1. `vw_movimento_entrada_lista`
Consolida tudo que a lista lateral precisa numa unica query paginada.

```sql
CREATE OR REPLACE VIEW vw_movimento_entrada_lista AS
SELECT
  me.id,
  me.numero_movimento,
  me.status,
  me.created_at,
  me.placa_veiculo,
  me.empresa_id,
  me.armazem_id,
  me.tenant_id,
  -- Parceiro do primeiro documento vinculado
  p.razaosocial AS parceiro_nome
FROM movimento_entrada me
LEFT JOIN LATERAL (
  SELECT med.documento_entrada_id
  FROM movimento_entrada_documento med
  WHERE med.movimento_entrada_id = me.id
  LIMIT 1
) first_doc ON true
LEFT JOIN documento_entrada de ON de.id = first_doc.documento_entrada_id
LEFT JOIN parceiro p ON p.id = de.parceiro_id;
```

**Resultado**: 1 query paginada substitui 60+ queries.

#### 2. `vw_movimento_saida_lista`
Consolida a lista de ondas.

```sql
CREATE OR REPLACE VIEW vw_movimento_saida_lista AS
SELECT
  ms.id,
  ms.numero_onda,
  ms.status,
  ms.data_emissao,
  ms.destino_carga,
  ms.motorista,
  ms.total_pedidos,
  ms.peso_total,
  ms.m3,
  ms.prioridade,
  ms.total_volume,
  ms.observacao,
  ms.box_id,
  ms.rota_id,
  ms.veiculo_id,
  ms.empresa_id,
  ms.tenant_id,
  b.descricao AS box_nome,
  p.razaosocial AS parceiro_nome
FROM movimento_saida ms
LEFT JOIN box b ON b.id = ms.box_id
LEFT JOIN LATERAL (
  SELECT msd.documento_saida_id
  FROM movimento_saida_documento msd
  WHERE msd.movimento_saida_id = ms.id
  LIMIT 1
) first_doc ON true
LEFT JOIN documento_saida ds ON ds.id = first_doc.documento_saida_id
LEFT JOIN parceiro p ON p.id = ds.parceiro_id;
```

**Resultado**: 1 query paginada substitui 80+ queries.

#### 3. `vw_movimento_entrada_docs_vinculados`
Consolida documentos vinculados a um movimento de entrada.

```sql
CREATE OR REPLACE VIEW vw_movimento_entrada_docs_vinculados AS
SELECT
  med.movimento_entrada_id,
  de.numero_nota,
  p.razaosocial,
  de.valor_total_nota,
  de.qtd_volume,
  de.tenant_id,
  (SELECT count(*) FROM documento_entrada_item dei
   WHERE dei.documento_entrada_id = de.id) AS total_skus
FROM movimento_entrada_documento med
JOIN documento_entrada de ON de.id = med.documento_entrada_id
LEFT JOIN parceiro p ON p.id = de.parceiro_id;
```

**Resultado**: 1 query substitui 3*N queries.

#### 4. `vw_movimento_saida_docs_vinculados`
Consolida documentos vinculados a uma onda.

```sql
CREATE OR REPLACE VIEW vw_movimento_saida_docs_vinculados AS
SELECT
  msd.movimento_saida_id,
  msd.ordem,
  ds.numero_pedido,
  ds.data_emissao,
  ds.valor_pedido,
  p.razaosocial AS parceiro,
  ds.tenant_id
FROM movimento_saida_documento msd
JOIN documento_saida ds ON ds.id = msd.documento_saida_id
LEFT JOIN parceiro p ON p.id = ds.parceiro_id;
```

#### 5. `vw_movimento_entrada_info`
Consolida dados da aba Informacoes (movimento + box + armazem).

```sql
CREATE OR REPLACE VIEW vw_movimento_entrada_info AS
SELECT
  me.id AS movimento_id,
  me.confirma_volume,
  me.total_volume,
  me.total_volume_conferido,
  me.placa_veiculo,
  me.valor_descarga,
  me.crossdocking,
  me.observacao,
  me.tenant_id,
  b.descricao AS box_descricao,
  a.descricao AS armazem_descricao
FROM movimento_entrada me
LEFT JOIN box b ON b.id = me.box_id
LEFT JOIN armazem a ON a.id = me.armazem_id;
```

---

## Mudancas no Frontend

### MovimentoEntradaPage.tsx

| Funcao | Antes | Depois |
|--------|-------|--------|
| `fetchMovements()` | 1 query + 3*N enrichment | 1 query a `vw_movimento_entrada_lista` |
| `loadDetails()` docs vinculados | loop com 3 queries por doc | 1 query a `vw_movimento_entrada_docs_vinculados` |
| `loadDetails()` info tab | 3 queries (mov + box + armazem) | 1 query a `vw_movimento_entrada_info` |
| `loadDetails()` alerts | 2 queries (picking + embalagem) | mantido (sao queries por batch com `.in()`, ja performaticas) |

### MovimentoSaidaPage.tsx

| Funcao | Antes | Depois |
|--------|-------|--------|
| `fetchMovimentos()` | 1 query + 4*N enrichment | 1 query a `vw_movimento_saida_lista` |
| `loadTabData()` docs | loop com 2 queries por doc | 1 query a `vw_movimento_saida_docs_vinculados` |

---

## Resultado Esperado

```text
ANTES (20 registros na lista):
  Mov. Entrada: ~62 requisicoes HTTP
  Ondas:        ~82 requisicoes HTTP

DEPOIS:
  Mov. Entrada: ~1 requisicao (lista) + 4 ao clicar detalhe
  Ondas:        ~1 requisicao (lista) + 4 ao clicar detalhe
```

Reducao de **95%+** no numero de requisicoes. O tempo de carregamento deve cair proporcionalmente.

---

## Arquivos a Modificar

| Arquivo | Acao |
|---------|------|
| Migration SQL | Criar 5 views novas |
| `src/pages/MovimentoEntradaPage.tsx` | Substituir fetchMovements e loadDetails para usar views |
| `src/pages/MovimentoSaidaPage.tsx` | Substituir fetchMovimentos e loadTabData para usar views |
| `src/integrations/supabase/types.ts` | Atualizado automaticamente |

Nenhuma informacao ou funcionalidade sera removida das telas.

