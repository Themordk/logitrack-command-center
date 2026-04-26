# Auditoria de filtros multi-empresa — Plano de correção

## 🔍 Diagnóstico

Auditei todos os dropdowns/selects de filtro em telas administrativas e relatórios. Identifiquei **dois padrões de vazamento entre empresas**:

### Padrão A — Lookups que deveriam respeitar `empresa_id` mas só filtram por `tenant_id`
Tabelas com coluna `empresa_id` direta retornando dados de **todas as empresas do tenant**:

| Tela | Tabela carregada | Problema |
|---|---|---|
| **Relatório Validade & Lote** | `grupo_produto`, `subgrupo_produto` | Sem filtro de `empresa_id` |
| **Relatório Curva ABC** | `grupo_produto`, `subgrupo_produto` | Sem filtro de `empresa_id` |
| **Relatório Baixo Giro** | `grupo_produto`, `subgrupo_produto` | Sem filtro de `empresa_id` |
| **Relatório Recebimento** | `parceiro` | Sem filtro de `empresa_id` |
| **Relatório Ciclo de Pedido** | `parceiro` | Sem filtro de `empresa_id` |
| **Relatório Cortes** (`fetchMotivosOcorrencia`) | `motivo_ocorrencia` | Sem `tenant_id` nem `armazem_id` |
| **Relatório Produtividade — Dashboard** | `armazem` | Sem `tenant_id` |
| **Relatório Produtividade — Operador** | `usuario` | Sem `tenant_id` nem `empresa_id` |
| **Relatório Movimento Saída — modal corte** | `motivo_ocorrencia` | Sem `armazem_id` (motivo é por armazém) |
| **Movimento Entrada — modal erro/divergência** | `motivo_ocorrencia` | Sem `armazem_id` |
| **Reatribuir Tarefas (modal)** | `usuario` | Filtra por empresa só se `empresaId` truthy — ok, mas redundante após guard global |
| **Abastecimento Geração — operadores** | `usuario` | Sem filtro de `empresa_id` |

### Padrão B — Lookups que deveriam respeitar `armazem_id` mas só filtram por `tenant_id`
Tabelas vinculadas a armazém retornando dados de **todos os armazéns**:

| Tela | Tabela carregada | Problema |
|---|---|---|
| **Relatório Estoque** | `tipo_estoque`, `setor` | Sem `armazem_id` (carrega setores de todos armazéns ao popular o dropdown) |
| **Relatório Validade & Lote** | `setor` | Sem `armazem_id` |
| **Dashboard (filtros)** | `armazem`, `turnos` | Não filtra por `empresa_id` ativa |
| **Entradas — modal gerar movimento** | `box`, `armazem` | Sem `empresa_id` (armazem)/`armazem_id` (box) |
| **Abastecimento — modal armazém** | `armazem` | Sem `empresa_id` |

### ✅ Telas já corrigidas (referência — não precisam de alteração)
`CadastroDocEntradaPage`, `CadastroDocSaidaPage`, `ParceirosPage`, `RotasPage`, `EnderecosBatchPage`, `GruposProdutoPage`, `UsuariosPage`, `ArmazensPage`, `ProdutosPage` (já passaram pela última auditoria).

---

## 🛠 Plano de execução

### 1. Padronizar dropdowns de relatórios para usar `fetchOptions` com escopo
Substituir as queries inline `supabase.from("xxx").select(...).eq("tenant_id", ...)` por `fetchOptions("xxx", tenantId, "descricao", { empresa_id, armazem_id })`, que já aplica os filtros corretos automaticamente.

**Arquivos:**
- `src/modules/reports/estoque/EstoqueReportPage.tsx` → `setor`, `tipo_estoque` filtrados por `armazem_id` ativo
- `src/modules/reports/validade-lote/ValidadeLoteReportPage.tsx` → `setor` por armazém; `grupo_produto`/`subgrupo_produto` por empresa
- `src/modules/reports/curva-abc/CurvaAbcReportPage.tsx` → idem grupo/subgrupo
- `src/modules/reports/baixo-giro/BaixoGiroReportPage.tsx` → idem grupo/subgrupo
- `src/modules/reports/recebimento/RecebimentoReportPage.tsx` → `parceiro` por empresa
- `src/modules/reports/ciclo-pedido/CicloPedidoReportPage.tsx` → `parceiro` por empresa
- `src/modules/reports/produtividade/ProdutividadeDashboardPage.tsx` → adicionar `tenant_id`; usar `armazemId` do contexto como default
- `src/modules/reports/produtividade/ProdutividadeOperadorPage.tsx` → `usuario` filtrado por `tenant_id` + `empresa_id`
- `src/modules/reports/cortes/cortes.service.ts` → `fetchMotivosOcorrencia` recebe `armazem_id` e filtra por `tenant_id` + `armazem_id`

### 2. Reagir à troca de empresa nos relatórios
Em todos os relatórios acima, garantir que o `useEffect` de carregamento dos lookups dependa de `[tenantId, empresaId, armazemId, empresaVersion]` (hoje muitos só dependem de `tenantId`). Limpar os filtros selecionados que se referem a registros da empresa anterior ao trocar.

### 3. Filtros do Dashboard (`DashboardFilters.tsx`)
- Adicionar prop `empresaId` e filtrar `armazem` por empresa ativa
- Filtrar `turnos` por `tenant_id` + `armazem_id` (já filtra por armazém quando selecionado, ok)
- Resetar `armazemId` quando trocar empresa

### 4. Modais de Entradas / Abastecimento
- `EntradasPage.openModal()` → adicionar `.eq("empresa_id", empresaId)` no `armazem` e `.eq("armazem_id", armazemId)` no `box`
- `AbastecimentoPage` → carregar `armazem` filtrado por `empresa_id`

### 5. Modais operacionais de Movimento Entrada/Saída
- Ao carregar `motivo_ocorrencia` para erro de transporte / divergência / corte de separação, adicionar `.eq("armazem_id", armazemId)` (motivo de ocorrência é por armazém)

### 6. Página `NovoInventarioPage` — busca de produtos
- Linha 179: `supabase.from("produto")` ao buscar produtos não filtra por `empresa_id`. Adicionar `.eq("empresa_id", empresaId)` para isolar produtos da empresa ativa.

### 7. Modal Reatribuir Tarefas
- Tornar o filtro `empresa_id` obrigatório (hoje é condicional). Após o guard global isso é redundante mas reforça segurança defensiva.

### 8. Estender `fetchOptions` com label customizável
Hoje `fetchOptions` recebe `labelField` mas não suporta o caso de `parceiro` (cujo label é `razaosocial`). Já é compatível pois aceita `labelField` como parâmetro — só precisa ser usado corretamente nas chamadas novas.

### 9. Corrigir build errors em edge functions
Os erros TS18046 em `supabase/functions/create-usuario/index.ts` (linha 122) e `reset-password/index.ts` (linha 108) são pré-existentes mas bloqueiam a build. Tipar `err` como `any`:
```ts
} catch (err: any) {
  return new Response(
    JSON.stringify({ success: false, error: err?.message || "Erro interno" }),
    ...
  );
}
```

---

## 📋 Resumo das alterações

| Categoria | Arquivos |
|---|---|
| Relatórios (lookups) | 9 arquivos em `src/modules/reports/` |
| Service layer | `cortes.service.ts` (assinatura `fetchMotivosOcorrencia`) |
| Dashboard | `DashboardFilters.tsx`, possivelmente `Dashboard.tsx` |
| Páginas operacionais | `EntradasPage`, `AbastecimentoPage`, `MovimentoEntradaPage`, `MovimentoSaidaPage`, `NovoInventarioPage`, `ReatribuirTarefasModal` |
| Edge functions (build fix) | `create-usuario/index.ts`, `reset-password/index.ts` |

Sem migração de banco — toda a correção é frontend, aproveitando os triggers de validação `trg_validar_empresa_usuario` e `trg_validar_armazem_empresa_usuario` já criados nas iterações anteriores como segunda camada de defesa.

## ✅ Resultado esperado
Após aprovação:
- Todos os dropdowns de filtros refletem **estritamente** a empresa/armazém selecionados no TopNav
- Trocar empresa no TopNav recarrega automaticamente todos os lookups e zera filtros que referenciam registros da empresa anterior
- Build do projeto passa sem erros TS