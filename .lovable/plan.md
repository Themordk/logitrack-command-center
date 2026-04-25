
# Plano — Propagação consistente da Empresa Ativa em todas as rotas

## 🎯 Objetivo
Garantir que **toda troca de empresa no TopNav** force re-fetch e filtragem correta em **todas as telas administrativas** (CRUDs, atividades operacionais, dashboard e relatórios). Hoje apenas as telas baseadas em `useCrud` reagem corretamente; muitas páginas e relatórios continuam mostrando dados da empresa anterior.

---

## 🔍 Diagnóstico da auditoria

### ✅ OK — Reagem à troca (via `useCrud`)
Tipos Estoque/Saída/Entrada, Veículos, Turnos, Zonas, Rotas, Volumes, Setores, Subgrupos, Armazéns, Empresas, Box, Endereços, HUs, Motivos, Grupos, Parceiros, Usuários, Produtos (lista), Tipos Box.

### ❌ BUG — Não reagem à troca (precisam correção)
| Página | Tabela / Service | Sintoma |
|---|---|---|
| `MovimentoEntradaPage` | `vw_movimento_entrada_lista` | Não filtra por empresa nem reage à troca |
| `MovimentoSaidaPage` | `vw_movimento_saida_lista` | Idem |
| `SaidasPage` | `documento_saida` | Idem |
| `InventarioPage` | `vw_inventario_lista` | Idem |
| `RoteiroSeparacaoPage` | `agrupamento_separacao`, `agrupamento_conferencia`, `ordem_expedicao` | Lê só por tenant; não filtra por empresa |
| `RastreabilidadePage` | `hu` etc. | Não filtra por empresa |
| `Dashboard` + `dashboard.service.ts` | Diversas | Ignora `empresaId` no filtro principal |
| `IntegracaoPage` | `integracao_config`, `integracao_objetos` | Lê só por tenant; configs podem cruzar empresas |
| `PerfisAcessoPage` | `perfil` | Lê só por tenant — **manter assim** (perfis são globais ao tenant) |
| Relatórios (Estoque, Validade-Lote, Cortes, Curva ABC, Baixo Giro, Movimentações, Recebimento, Ciclo Pedido, Inventário, Ocupação, Produtividade) | services | Já recebem `empresa_id` mas o `useEffect` não escuta `empresaId/empresaVersion` → relatório só atualiza ao clicar "Aplicar" |

### ✅ Já corretos por terem `empresaId` nas deps
`EntradasPage`, `AbastecimentoPage`, `CadastroDocEntradaPage`, `CadastroDocSaidaPage`, `NovoInventarioPage`, `HUsPage`.

---

## 🛠️ Estratégia de correção

### 1. Padronização — usar **sempre** `empresaVersion` como gatilho
Para qualquer página que faça fetch direto via `supabase` (não usa `useCrud`), adicionar:
```ts
const { tenantId, empresaId, empresaVersion } = useTenant();
// ...
useEffect(() => { fetchData(); }, [fetchData]);
// e fetchData deve ter empresaId/empresaVersion nas deps do useCallback
```
Isso garante reatividade automática mesmo quando o `empresaId` muda para o mesmo valor (não acontece, mas é defesa) e evita esquecer alguma dep.

### 2. Adicionar filtro `.eq("empresa_id", empresaId)` onde a tabela tem coluna `empresa_id`
Tabelas operacionais que possuem `empresa_id` e precisam ser filtradas:
- `documento_saida`, `documento_entrada`
- `movimento_entrada`, `movimento_saida`
- `inventario`, `abastecimento`
- `agrupamento_separacao`, `agrupamento_conferencia`, `ordem_expedicao`
- `hu`, `estoque_geral`, `estoque_movimento` (no que aparecer em telas web)
- Views: `vw_movimento_entrada_lista`, `vw_movimento_saida_lista`, `vw_inventario_lista`, `vw_abastecimento_lista`, `vw_movimento_entrada_info`, `vw_movimento_entrada_docs_vinculados`, `vw_movimento_saida_*` — adicionar filtro por empresa quando expuserem a coluna; se a view não expor, encaminhar via subquery por IDs.

### 3. Ajustes específicos por arquivo

#### Telas operacionais
- **`MovimentoEntradaPage.tsx`**: incluir `empresaId, empresaVersion` no `useCallback` de `fetchMovements`; adicionar `.eq("empresa_id", empresaId)` na query de `vw_movimento_entrada_lista`. Bloquear fetch quando `!empresaId`.
- **`MovimentoSaidaPage.tsx`**: idem para `vw_movimento_saida_lista`.
- **`SaidasPage.tsx`**: incluir `empresaId, empresaVersion` em `fetchDocs` e adicionar `.eq("empresa_id", empresaId)` em `documento_saida`.
- **`InventarioPage.tsx`**: incluir `empresaId, empresaVersion` em `fetchInventarios` e filtrar `vw_inventario_lista` por empresa.
- **`RoteiroSeparacaoPage.tsx`**: incluir `empresaId, empresaVersion` nos três `useCallback` (`fetchAgrupamentos`, `fetchAgrupConf`, `fetchOrdens`) e adicionar `.eq("empresa_id", empresaId)` nas três queries.
- **`RastreabilidadePage.tsx`**: aplicar `empresa_id` na busca por HU/produto/pedido (quando coluna existir) e reagir a `empresaVersion`.
- **`IntegracaoPage.tsx`**: Definição de chave por (tenant, empresa, armazem) — incluir filtro por empresa nas leituras e gravações; reagir a `empresaVersion`. Validar com o usuário se "config de integração" deve mesmo ser por empresa (provavelmente sim, pois ERP costuma ser por filial).

#### Dashboard
- **`Dashboard.tsx`** + **`dashboard.service.ts`**: 
  - Receber `empresaId` no `dfArgs` e propagar para o service.
  - Em `dashboard.service.ts`, adicionar `.eq("empresa_id", empresaId)` em todas as queries que tocam tabelas com essa coluna (movimentos, documentos, inventário, estoque).
  - `Dashboard.tsx`: incluir `empresaId, empresaVersion` no `useMemo` que monta `dfArgs` e nas deps do `useEffect`.

#### Relatórios (padrão tríade)
Para cada Página de relatório (`/modules/reports/*/`), substituir o atual `useEffect([tenantId])` por um efeito que escuta também `empresaId` e `empresaVersion`, **executando o fetch automaticamente** ao trocar de empresa.

Arquivos a ajustar:
- `EstoqueReportPage.tsx`
- `ValidadeLoteReportPage.tsx`
- `CortesReportPage.tsx`
- `CurvaAbcReportPage.tsx`
- `BaixoGiroReportPage.tsx`
- `MovimentacoesReportPage.tsx`
- `RecebimentoReportPage.tsx`
- `CicloPedidoReportPage.tsx`
- `InventarioReportPage.tsx`
- `OcupacaoReportPage.tsx`
- `ProdutividadeDashboardPage.tsx` / `ProdutividadeOperadorPage.tsx`

Padrão a aplicar:
```ts
const { tenantId, empresaId, empresaVersion } = useTenant();
useEffect(() => {
  if (!tenantId) return;
  // recarrega lookups/contexto
  loadLookups();
  // dispara o relatório com filtros atuais (silencioso)
  handleAplicar({ silent: true });
}, [tenantId, empresaId, empresaVersion]);
```

Garantir que os services já recebem `empresa_id` (a maioria já recebe) e adicionar onde faltar (`movimentacoes.service.ts`, `produtividade.service.ts`, `recebimento.service.ts`, `ciclo-pedido` — verificar e completar).

### 4. Whitelist do `useCrud`
Revisar e completar `TABLES_WITH_EMPRESA` em `useCrud.ts`. Adicionar (se faltar):
- `tipo_entrada`, `tipo_saida`, `tipo_estoque`, `setor`, `endereco`, `box`, `turno`, `motivo_ocorrencia`, `veiculo`, `zona_atividade`, `rotas`, `picking_produto`, `agrupamento_separacao`, `agrupamento_conferencia`, `ordem_expedicao`, `inventario`, `documento_entrada`, `documento_saida`, `volume_expedicao`.
> Verificar caso a caso no schema (algumas tabelas como `setor`/`endereco` pertencem a um `armazem` que já pertence a uma empresa — nesse caso filtrar pela cadeia em vez de `empresa_id` direto).

### 5. Hardening de segurança no banco
- Estender o trigger `trg_validar_empresa_usuario` para mais tabelas operacionais que tenham `empresa_id`: `agrupamento_separacao`, `agrupamento_conferencia`, `ordem_expedicao`, `hu`, `lms_metrica_diaria`, `estoque_geral`, `estoque_movimento`, `picking_produto` (se aplicável), `integracao_config`, `integracao_objetos`.
- Manter exceção para perfil ADMINISTRADOR (já implementado).

### 6. UX — Overlay durante a troca
O `EmpresaSwitchOverlay` já existe e aparece por 450ms. Aumentar levemente para ~700ms para cobrir re-fetches médios e adicionar texto "Atualizando dados…".

---

## 📦 Entregáveis

### Frontend
- `src/pages/MovimentoEntradaPage.tsx`
- `src/pages/MovimentoSaidaPage.tsx`
- `src/pages/SaidasPage.tsx`
- `src/pages/InventarioPage.tsx`
- `src/pages/RoteiroSeparacaoPage.tsx`
- `src/pages/RastreabilidadePage.tsx`
- `src/pages/IntegracaoPage.tsx`
- `src/pages/Dashboard.tsx` + `src/pages/dashboard/dashboard.service.ts`
- `src/components/EmpresaSwitchOverlay.tsx` (texto/duração)
- `src/hooks/useCrud.ts` (whitelist completa)
- 11 páginas de relatórios em `src/modules/reports/*/`
- 2-3 services de relatórios para incluir filtro `empresa_id` (onde faltar)

### Backend (migration)
- Estender trigger `trg_validar_empresa_usuario` para tabelas adicionais.

---

## 🧪 Casos de teste após implementação
1. ADMIN troca empresa → Dashboard, Movimentos, Documentos, Inventário, Abastecimento, Roteiro, todos os Relatórios e Rastreabilidade refazem fetch automaticamente.
2. Nenhuma tela mostra dado da empresa anterior por mais de ~700ms.
3. Usuário não-ADMIN não vê o seletor e não consegue forçar mudança via console (validado pelo trigger no banco).
4. F5 mantém empresa correta (já garantido pelo `localStorage`).
5. Relatório aberto em uma empresa, ao trocar empresa, recarrega automaticamente com os filtros atuais.

---

## ⚠️ Riscos / Pontos de atenção
- **Views consolidadas** (`vw_movimento_entrada_lista` etc.): confirmar que expõem `empresa_id`. Se não expuserem, será preciso evoluir a view (migration) ou filtrar via subquery.
- **`PerfisAcessoPage`** intencionalmente fica fora (perfis são globais por tenant).
- **`agrupamento_separacao` / `agrupamento_conferencia` / `ordem_expedicao`**: hoje têm `empresa_id` opcional (`Nullable: Yes`) — registros antigos podem estar com NULL. Aplicar fallback amigável + script de saneamento opcional.
- **`integracao_config` / `integracao_objetos`**: schema atual usa `armazem_id` (não `empresa_id`). Como armazém pertence à empresa, filtrar por armazéns da empresa ativa em vez de `empresa_id` direto.
- Performance: nenhum impacto significativo — filtros adicionais aproveitam índices por `tenant_id`/`empresa_id` (recomendado garantir índice composto onde houver gargalo).
