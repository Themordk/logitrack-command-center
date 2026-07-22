# Isolamento por Empresa — Tela de Endereços

## Problema

Ao trocar a empresa no seletor do TopNav, a lista de `Localizações / Endereços` continua trazendo registros de outras empresas do mesmo tenant. A tabela `endereco` não tem coluna `empresa_id` (a empresa está em `armazem.empresa_id`), e a view `vw_endereco_listagem` também não expõe esse campo — por isso ficou fora do auto-filtro por empresa em `useCrud`.

## Estratégia

Expor `empresa_id` diretamente na view `vw_endereco_listagem` e filtrar no `useCrud` por igualdade. Motivos:

- **Performático**: `.eq("empresa_id", ...)` sobre uma coluna já indexada em `armazem` (via join) é mais rápido e escalável do que fazer `armazem_id IN (SELECT ...)` no cliente.
- **Simples**: reaproveita o mecanismo já existente (`TABLES_WITH_EMPRESA`) sem introduzir lógica nova de subqueries.
- **Reativo**: o `useCrud` já refaz o fetch quando `empresaVersion` muda; basta ele reconhecer que a view tem empresa.

## Passos

1. **Migration** — recriar `public.vw_endereco_listagem` incluindo `a.empresa_id`, mantendo `security_invoker = on` e o GRANT SELECT para `authenticated`. Nenhuma outra coluna muda.
2. **`src/hooks/useCrud.ts`** — adicionar `vw_endereco_listagem` ao conjunto que aciona o filtro `.eq("empresa_id", empresaId)` (aplicado sobre `table`, não `writeTable`, já que a escrita continua indo para `endereco`, que não tem `empresa_id`). Ajuste mínimo: registrar a view num novo set `VIEWS_WITH_EMPRESA` e considerar esse set no cálculo de `requiresEmpresa` para leitura.
3. **`src/pages/EnderecosPage.tsx`** — nenhuma alteração necessária; a página já reage a `empresaVersion` via `useCrud`.

## Verificação

- Selecionar uma empresa A com endereços; conferir na UI.
- Trocar para empresa B (que tenha outros endereços) e confirmar que a lista renova e não mostra endereços da empresa A.
- Buscar por código de endereço que pertence somente à empresa A com a empresa B selecionada — deve retornar vazio.

## SQL da migration

```sql
CREATE OR REPLACE VIEW public.vw_endereco_listagem
WITH (security_invoker = on) AS
SELECT
  e.id, e.tenant_id, a.empresa_id, e.armazem_id, e.setor_id, e.tipo_estoque_id,
  e.rua, e.predio, e.nivel, e.apto, e.descricao, e.tipo_endereco, e.lado,
  e.situacao, e.curva_acesso, e.ativo, e.tipo_estrutura, e.codigo_endereco,
  a.descricao  AS armazem_descricao,
  s.descricao  AS setor_descricao,
  te.descricao AS tipo_estoque_descricao
FROM public.endereco e
LEFT JOIN public.armazem a       ON a.id  = e.armazem_id
LEFT JOIN public.setor s         ON s.id  = e.setor_id
LEFT JOIN public.tipo_estoque te ON te.id = e.tipo_estoque_id;

GRANT SELECT ON public.vw_endereco_listagem TO authenticated;
```
