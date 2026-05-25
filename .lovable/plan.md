# Plano: Tipos de Tarefa + Produtos sem código de barras

## 1) Configurações → Tipos de Tarefa

Nova rota administrativa para configurar o comportamento dos tipos de tarefa existentes. **Não permite criar nem excluir** — apenas editar campos de comportamento. Código e Descrição são exibidos somente-leitura.

### Rota e navegação
- Nova rota: `/config/tipos-tarefa`
- Adicionar em `src/components/TopNav.tsx`, grupo "Configurações", item "Tipos de Tarefa" (após "Perfis de Acesso").
- Adicionar entry em `breadcrumbs` e no `renderPage` switch (`src/App.tsx`).

### Página `src/pages/TiposTarefaPage.tsx`
- Lista todos os registros de `tipo_tarefa` do tenant (RLS por `get_current_tenant()`).
- Sem coluna `ativo` — listar todos.
- Tabela (CrudTable, sem ação "Novo" e sem ação "Excluir"):
  - Código (texto, somente leitura)
  - Descrição (texto, somente leitura)
  - Prioridade Padrão
  - Tempo Estimado (s)
  - Gera Movimento Estoque (badge sim/não)
  - Bloqueia Estoque (badge)
  - Exige Conferência (badge)
- Ação única por linha: **Editar** (lápis).

### Modal de edição (`CrudModal` ou inline)
Campos editáveis:
- `prioridade_padrao` (number, 1–999)
- `tempo_estimado_segundos` (number)
- `gera_movimento_estoque` (switch)
- `bloqueia_estoque` (switch)
- `exige_conferencia` (switch)
- `tipo_movimento` (select: 1=Entrada, 2=Saída, 3=Transferência — confirmar valores no uso atual)

Campos somente-leitura (visíveis, `disabled`):
- `codigo`
- `descricao`

Update via `supabase.from('tipo_tarefa').update({...}).eq('id', id)` — payload contém só os campos editáveis acima. Toast de sucesso, refresh da lista.

### Permissões
- Gate por permissão `configuracoes.editar` (ou novo módulo `tipo_tarefa`), seguindo padrão das demais telas de config.

## 2) Dados Mestres → Produtos: alerta de produtos sem código de barras

"Sem código de barras" = produto sem **nenhuma** `produto_embalagem` ativa com `ean` preenchido (não-nulo e não-vazio). Hoje 42.752 de 43.059 produtos ativos estão nesse estado — totalmente relevante.

### Totalizador no header da página (`src/pages/ProdutosPage.tsx`)
- Acima/ao lado dos controles atuais, badge de alerta clicável:
  - Ícone `AlertTriangle` (amarelo/destructive token), texto: `N produtos sem código de barras`.
  - Loader enquanto consulta.
- Query (uma chamada head/count):
  ```ts
  supabase.from('produto')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('empresa_id', empresaId).eq('ativo', true)
    .not('id', 'in', `(select produto_id from produto_embalagem where ativo=true and ean is not null and ean<>'')`)
  ```
  Como PostgREST não aceita subselect em `in`, criar uma **view** `vw_produto_sem_ean` (apenas SELECT — migration) com colunas `id, tenant_id, empresa_id`, e consultar:
  ```ts
  supabase.from('vw_produto_sem_ean').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('empresa_id', empresaId)
  ```

### Filtro "Apenas sem código de barras"
- Toggle ao lado do search/totalizador: quando ligado, filtra a listagem.
- Implementação: quando ativo, troca o `from('produto')` por join com a view (`.in('id', subset)`) — ou mais simples: buscar `select id from vw_produto_sem_ema` paginado e filtrar `.in('id', ids)` na query principal.
- Alternativa mais limpa: criar **view consolidada** `vw_produto_listagem` que já traz boolean `tem_ean` — e o filtro vira `.eq('tem_ean', false)`. Recomendado.

### Alerta inline na linha (CrudTable)
- Nova coluna pequena (ícone) na tabela de produtos: badge `AlertTriangle` quando `tem_ean=false`, tooltip "Sem código de barras cadastrado".
- Trocar `select` da página para usar a view `vw_produto_listagem` (mantém demais campos) e adicionar a coluna.

### Migration necessária (Supabase)
```sql
CREATE OR REPLACE VIEW public.vw_produto_listagem AS
SELECT p.*,
  EXISTS (
    SELECT 1 FROM public.produto_embalagem pe
    WHERE pe.produto_id = p.id
      AND pe.ativo = true
      AND pe.ean IS NOT NULL
      AND pe.ean <> ''
  ) AS tem_ean
FROM public.produto p;
```
RLS herda de `produto`. Sem mudanças destrutivas; existente continua igual (página atual lê `produto.*`).

## Fora de escopo
- Criação/exclusão de `tipo_tarefa` (reservado ao Suporte).
- Mudanças no fluxo do coletor.
- Edição em massa de EAN; permanece edição produto-a-produto via aba Embalagens do produto.
- Notificações/e-mails sobre produtos sem EAN.

## Validação
- Tipos de Tarefa: editar registro existente, confirmar persistência e que código/descrição não mudam; tentar acessar sem permissão deve bloquear.
- Produtos: totalizador bate com SQL; filtro reduz lista corretamente; ícone aparece nas linhas certas; após cadastrar uma embalagem com EAN, totalizador e ícone desaparecem do produto.
