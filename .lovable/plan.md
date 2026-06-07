# Refatoração — Integração ERP como Galeria

## Observação de rota
No código atual, a rota é `/config/integracao` (hash router). A descrição usa `/configuracoes/integracao-erp`. Vou manter o caminho existente para não quebrar menu/breadcrumbs/permissões: **galeria em `/config/integracao`** e **detalhe em `/config/integracao/:erpProvedorId`**. Se preferir renomear para `/configuracoes/integracao-erp`, ajusto na implementação.

## Escopo
- A página `IntegracaoPage` deixa de abrir direto Credenciais/Sincronização/Logs do Omie.
- Passa a renderizar uma **galeria de cards** (um por `middleware.erp_provedor`).
- O conteúdo atual (StatusBar + Tabs Credenciais/Sincronização/Logs) é movido para uma nova página de detalhe acionada pela sub-rota com `erpProvedorId`.

## Arquivos

### Novos
- `src/pages/integracao/IntegracaoGalleryPage.tsx` — galeria de ERPs (componente principal da rota).
- `src/pages/integracao/ErpCard.tsx` — card individual com badge/estado/ação.
- `src/pages/integracao/IntegracaoErpDetalhePage.tsx` — wrapper com StatusBar + Tabs (Credenciais/Sincronização/Logs) parametrizado por `erpProvedorId` (hoje fixo em "omie" para compatibilidade).
- `src/pages/integracao/useErpGallery.ts` — hook de fetch (provedores + integrações + fallback `omie_config`).

### Alterados
- `src/pages/IntegracaoPage.tsx` — passa a apenas decidir: se há `:erpProvedorId` na rota, renderiza Detalhe; senão, renderiza Galeria.
- `src/App.tsx` — adicionar match para `/config/integracao/<erpId>` em `renderPage` e breadcrumb dinâmico em `getDynamicBreadcrumb`.
- `src/pages/integracao/entidades.ts` — sem mudança estrutural (helper `mw` reaproveitado).

### Não alterados
- `StatusBar.tsx`, `CredenciaisTab.tsx`, `SincronizacaoTab.tsx`, `LogsFilasTab.tsx`, `LogsPanel.tsx`, `FilasPanel.tsx` — comportamento atual preservado dentro do Detalhe.
- Nenhuma alteração de schema/RLS/edge functions.

## Fluxo de dados da galeria
Dentro de `useErpGallery(tenantId, empresaId, empresaVersion)`:

1. `mw.from("erp_provedor").select("id,nome,disponivel,ordem,esquema_credencial").order("ordem")`.
2. `mw.from("erp_integracao").select("erp_provedor_id,ativo,status,ultimo_teste_em,ultimo_teste_ok,mensagem_erro").eq("tenant_id", tenantId).eq("empresa_id", empresaId)`.
3. `mw.from("omie_config").select("id, atualizado_em").eq("tenant_id", tenantId).eq("empresa_id", empresaId).maybeSingle()` — apenas para fallback do card Omie.
4. Combina em uma lista `ErpCardData[]` com `{ provedor, integracao | null, legadoOmie?: boolean, ultimoTeste?: string }`.
5. Auto-refresh a cada 30 s (igual à `StatusBar`) e refetch quando `empresaVersion` muda.

## Regras de exibição do card (resolvidas em `ErpCard.tsx`)
Prioridade ao decidir o estado visual:

```text
if !provedor.disponivel              -> EM_BREVE  (cinza, opacidade-50, sem botão, não clicável)
else if integracao?.status == 'erro' -> ERRO      (borda destructive, badge vermelho "Erro de conexão",
                                                   mensagem_erro truncada, botão "Revisar configuração")
else if integracao?.status == 'ativo'-> CONECTADO (borda emerald, badge verde "Conectado",
                                                   "Última sync: <formatado>", botão "Editar configuração")
else if provedor.id == 'omie'
        && legadoOmie                -> CONECTADO_LEGADO (borda emerald sutil, badge "Conectado (legado)",
                                                          botão "Editar configuração")
else                                 -> NAO_CONFIGURADO (borda neutra, badge "Não configurado",
                                                         botão "Configurar")
```

Cores via tokens semânticos do design system (sem cores hard-coded): `border-emerald-500/40`, `border-destructive/60`, `bg-muted/40`, etc. — mesmas convenções já usadas em `StatusBar.tsx`.

Formatação de `ultimo_teste_em`: reutiliza `relativeTime` exportada por `StatusBar.tsx` + `formatDateTimeBrasilia` de `src/utils/dateTime.ts` para o tooltip (regra de exibição UTC-3 já vigente no projeto).

## Layout
- Header (mesmo do atual): título "Integração ERP", subtítulo "Selecione e configure a integração com o seu sistema ERP".
- `StatusBar` permanece **no topo da galeria** (já agrega entidades ativas/erros/registros importados a partir das integrações do tenant — independente de ERP selecionado).
- `Tabs` (Credenciais/Sincronização/Logs) são **removidas da galeria** e só aparecem em `IntegracaoErpDetalhePage`.
- Grid responsivo: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`.

## Navegação
- Clique no botão de qualquer card → `window.location.hash = "#/config/integracao/" + provedor.id`.
- `IntegracaoPage` detecta o segmento adicional e renderiza `IntegracaoErpDetalhePage` (que monta `StatusBar` + Tabs já existentes; por enquanto todas as Tabs funcionam apenas para `omie`, demais ERPs ficam atrás de `disponivel=false` e portanto não chegam ao detalhe).
- Botão "Voltar" no Detalhe leva para `#/config/integracao`.
- Breadcrumb dinâmico: `CORE LogiTrack › Configurações › Integração › <Nome do ERP>`.

## Compatibilidade Omie
- Se `erp_integracao` para o Omie não existir mas `omie_config` existir → card "Conectado (legado)" para sinalizar que ainda não migrou para o novo modelo, mas a integração antiga continua válida.
- O detalhe do Omie continua lendo/gravando em `omie_config` exatamente como hoje (sem mexer em `CredenciaisTab`, `SincronizacaoTab`, `LogsFilasTab`).

## Regras gerais
- Nenhuma alteração de banco, RLS, edge functions ou tipos gerados.
- Sem novas dependências.
- Sem mudança no menu lateral nem nas permissões da rota `/config/integracao`.
- Toasts, erros e loadings seguem o padrão das demais páginas (`Loader2` + `card-surface`).
