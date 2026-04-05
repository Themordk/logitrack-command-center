

# Plano: Módulo Completo de Abastecimento (CORE LogiTrack WMS)

## Estado Atual

- Tabela `abastecimento` **nao existe** no banco
- RPC `gerar_abastecimento_preventivo` **nao existe** (referenciada em MovimentoSaidaPage mas nunca criada)
- Tipo de tarefa `ABAST` ja existe (`172beee9-65ac-44dc-95a2-36b67b4aebbe`)
- `picking_produto` tem `est_minimo` e `est_maximo` (base para corretivo)
- `endereco.tipo_endereco` tem enum `PULMAO | PICKING`
- Menu TopNav ja aponta para `/atividades/Abastecimento` (case errado, sem pagina)
- Coletor ja tem `AbastecimentoListPage` basica (apenas lista tarefas ABAST)

---

## Arquitetura da Solucao

```text
BANCO DE DADOS
  abastecimento (cabecalho)
  vw_abastecimento_lista (view consolidada)
  fn_gerar_abastecimento (RPC transacional)

FRONTEND ADMIN
  AbastecimentoPage.tsx (lista + geracao)

FRONTEND COLETOR
  AbastecimentoListPage.tsx (ja existe, melhorar)
```

---

## FASE 1 -- Migration SQL

### 1.1 Tabela `abastecimento`

```sql
CREATE TABLE public.abastecimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  armazem_id uuid NOT NULL,
  tipo enum_tipo_abastecimento NOT NULL, -- 'PREVENTIVO' | 'CORRETIVO'
  status enum_status_abastecimento NOT NULL DEFAULT 'GERADO',
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,                       -- usuario que gerou
  finalizado_em timestamptz,
  total_tarefas integer DEFAULT 0,
  total_itens numeric DEFAULT 0,
  observacao text
);
-- Enums: PREVENTIVO/CORRETIVO e GERADO/EM_EXECUCAO/FINALIZADO/CANCELADO
```

RLS: `tenant_id = get_current_tenant()`

### 1.2 Coluna `abastecimento_id` na tabela `tarefa`

Adicionar `abastecimento_id uuid` (nullable) na tabela `tarefa` para vincular tarefas ABAST ao cabecalho de geracao.

### 1.3 View `vw_abastecimento_lista`

JOIN `abastecimento` com `usuario` (criado_por -> nome/login), `armazem` (descricao). Conta tarefas vinculadas via subquery. Elimina N+1.

### 1.4 RPC `fn_gerar_abastecimento`

Funcao `SECURITY DEFINER` que recebe parametros:
- `p_tenant_id`, `p_empresa_id`, `p_armazem_id`, `p_tipo` (PREVENTIVO/CORRETIVO), `p_usuario_id`
- `p_simular boolean DEFAULT false` (modo preview sem INSERT)

Logica:

**Preventivo**:
1. Busca tarefas SEP pendentes (status CRIADA/EM_ANDAMENTO) agrupadas por produto_id
2. Para cada produto, soma quantidade_requerida pendente
3. Busca saldo picking atual (`estoque_geral` WHERE endereco.tipo_endereco = 'PICKING')
4. Se saldo_picking < demanda_separacao: necessidade = demanda - saldo_picking
5. Busca saldo pulmao disponivel para o produto
6. quantidade_abastecimento = LEAST(necessidade, saldo_pulmao)
7. Se > 0: cria tarefa ABAST com origem = endereco pulmao, destino = endereco picking

**Corretivo**:
1. Busca `picking_produto` ativo no armazem
2. Para cada registro, busca saldo picking atual
3. Se saldo <= est_minimo: necessidade = est_maximo - saldo_atual
4. Busca saldo pulmao disponivel
5. quantidade_abastecimento = LEAST(necessidade, saldo_pulmao)
6. Se > 0: cria tarefa ABAST

**Anti-duplicacao**: Antes de criar, verifica se ja existe tarefa ABAST pendente para mesmo produto+endereco_destino.

**Retorno**: JSON com lista de itens gerados (ou simulados), total de tarefas, e alertas (produtos sem saldo pulmao).

### 1.5 Indices

```sql
CREATE INDEX idx_tarefa_abastecimento ON tarefa (abastecimento_id) WHERE abastecimento_id IS NOT NULL;
CREATE INDEX idx_tarefa_tipo_status ON tarefa (tipo_tarefa_id, status, produto_id);
CREATE INDEX idx_estoque_endereco_produto ON estoque_geral (endereco_id, produto_id);
CREATE INDEX idx_picking_produto_armazem ON picking_produto (armazem_id, produto_id) WHERE ativo = true;
```

---

## FASE 2 -- Pagina Admin (`AbastecimentoPage.tsx`)

Nova pagina em `/atividades/abastecimento` (corrigir case no TopNav).

### Layout

**Cabecalho**: Titulo "Abastecimento" + botoes "Gerar Preventivo" e "Gerar Corretivo"

**Tabela principal** (via `vw_abastecimento_lista`):
- Tipo (badge colorido: Preventivo=azul, Corretivo=amarelo)
- Status (badge: Gerado=cinza, Em Execucao=amarelo, Finalizado=verde, Cancelado=vermelho)
- Armazem
- Tarefas geradas (count)
- Qtd total itens
- Criado por / Data
- Acoes: Ver tarefas, Cancelar

**Modal de geracao**:
1. Selecionar armazem
2. Botao "Simular" -> chama RPC com `p_simular=true` -> mostra preview em tabela (SKU, Descricao, Qtd Necessaria, Saldo Pulmao, Qtd a Abastecer, Endereco Picking)
3. Botao "Confirmar Geracao" -> chama RPC com `p_simular=false`
4. Exibir alertas: produtos com necessidade mas sem saldo pulmao

**Detalhe do abastecimento** (expandir ou modal):
- Lista de tarefas ABAST vinculadas (produto, qtd, status, operador atribuido)

### Paginacao e filtros

- Filtro por tipo, status, periodo
- Paginacao server-side usando padrao `useCrud` existente (ou query direta na view)

---

## FASE 3 -- Melhorias no Coletor

Atualizar `AbastecimentoListPage.tsx`:
- Adicionar info de endereco origem (pulmao) e destino (picking) em cada card
- Permitir ao operador iniciar execucao (navegar para fluxo similar a transferencia)

---

## Regras Operacionais WMS Incorporadas

1. **Anti-duplicacao**: RPC verifica tarefa ABAST pendente antes de criar nova
2. **Priorizacao**: Tarefas geradas com prioridade baseada em urgencia (preventivo com onda proxima = prioridade alta)
3. **Consolidacao por corredor**: Agrupar tarefas por rua/corredor do endereco destino para minimizar deslocamento
4. **Simulacao**: Modo preview obrigatorio antes de gerar, mostrando impacto
5. **Transacional**: Toda geracao em uma unica transacao SQL (SECURITY DEFINER)

---

## Arquivos Afetados

```text
NOVOS:
  - 1 migration SQL (enums, tabela, coluna, view, RPC, indices)
  - src/pages/AbastecimentoPage.tsx (painel admin completo)

EDITADOS:
  - src/App.tsx (rota + breadcrumb)
  - src/components/TopNav.tsx (corrigir path do menu)
  - src/pages/coletor/AbastecimentoListPage.tsx (melhorar cards)
  - src/integrations/supabase/types.ts (auto-gerado)
```

## Resultado

| Funcionalidade | Status |
|---|---|
| Tabela abastecimento com status flow | Novo |
| Geracao preventiva (demanda SEP) | Novo |
| Geracao corretiva (min/max picking) | Novo |
| Simulacao antes de gerar | Novo |
| Anti-duplicacao de tarefas | Novo |
| View consolidada (0 N+1) | Novo |
| Painel admin com filtros | Novo |
| Coletor com info de enderecos | Melhoria |

