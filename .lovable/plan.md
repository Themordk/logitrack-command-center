
## Objetivo

Implementar UI completa de gerenciamento de templates de etiqueta consumindo a RPC `resolver_etiqueta_template` e a tabela `etiqueta_template` (já existentes no backend). 4 tipos: ENDERECO, HU, PRODUTO, VOLUME.

## Etapas

### 1. Hook `src/hooks/useEtiquetaTemplate.ts` (novo)
Exporta `useEtiquetaTemplate(tipo, empresaId)`, tipos `EtiquetaConfig` e `CampoEtiqueta`. Chama `(supabase.rpc as any)("resolver_etiqueta_template", { p_tipo, p_empresa_id })`, faz parse do JSONB `campos`.

### 2. `src/components/etiqueta/thermalEngine.ts` — append-only
Adicionar ao fim: `TipoEtiqueta`, `EtiquetaConfigLike` e `getTemplateFromConfig(config)` (wrapper sobre `getTemplateFromSelection`). Não tocar código existente.

### 3. Adaptar os 4 previews (retrocompatível — `config?` opcional)
- **`EtiquetaVolumePreview.tsx`**: aceitar `config?`. Se presente, usar dimensões via `getTemplateFromConfig`, respeitar `com_cabecalho`, `com_logo`/`logo_url`. **Remover marca fixa "CORE / LogiTrack"** — substituir por `<img>` do `logo_url` ou nada. Filtrar/ordenar campos por `ativo` + `ordem`; `campo.chave` puxa de `volume[chave]` ou dos props `usuario`/`dataHora`.
- **`EtiquetaHUPreview.tsx`**: mesma estrutura; dimensões vindas do config em vez de 800×320 hardcoded.
- **`EtiquetaEnderecoPreview.tsx`**: quando `config` presente, ele sobrescreve `tamanho`/`orientacao` recebidos por prop; respeitar `com_cabecalho`/logo.
- **`EtiquetaProdutoPreview.tsx`**: mapear `config.campos[].ativo` (por `chave`: `marca`, `altura`, `largura`, `comprimento`, `peso_bruto`, `peso_liquido`, `m3`) para o `EtiquetaProdutoOptions` existente.

Sem `config` → comportamento atual idêntico.

### 4. Ligar os 4 `PrintEtiqueta*Modal.tsx`
Em cada modal, adicionar:
```ts
const { empresaId } = useTenant();
const { config, loading } = useEtiquetaTemplate("<TIPO>", empresaId);
```
- Usar `config.tamanho`/`config.orientacao` como default inicial dos selects (só na primeira montagem).
- Passar `config ?? undefined` ao Preview.
- `getPrintCSS`: derivar do `getTemplateFromConfig(config)` quando presente.
- Loading do hook → spinner `Loader2` dentro do modal.
- Se config for null → defaults hardcoded atuais.

### 5. Tela `src/pages/EtiquetaTemplatesPage.tsx` (nova)
Layout 2 colunas (dark design system, sem cores hex hardcoded):

**Esquerda — Controles:**
- Select de empresa (query `empresa` do tenant + opção "Padrão do tenant" = null).
- Tabs dos 4 tipos com ícones (MapPin, Package, Barcode, Box).
- Ao mudar empresa/tipo: chamar hook. Se `config.empresa_id === null` e empresa selecionada é específica, badge `muted` "Usando padrão do tenant".
- Campos do form: `nome` (input), `tamanho` (select 100x40 / 50x20 / 80x20 — só 100x40 para HU/VOLUME), `orientacao` (desabilitado se 80x20), switches `com_cabecalho` e `com_logo` (logo dependente de cabeçalho), input `logo_url`.
- Lista de `campos`: cada item com label, switch `ativo`, botões ↑/↓ para reordenar (reindexa `ordem`).

**Direita — Preview ao vivo:**
- Renderiza o `Etiqueta*Preview` do tipo selecionado com `config` em edição (estado local), usando dados mock.
- Moldura branca simulando etiqueta física.

**Ações:**
- **Salvar**: se `config.empresa_id === null` e empresa específica selecionada → INSERT (novo override). Senão → UPDATE por `id`. Grava `tenant_id`, `empresa_id`, `tipo`, `nome`, `tamanho`, `orientacao`, `com_cabecalho`, `com_logo`, `logo_url`, `campos` (JSON), `updated_at`. Sucesso: `toast.success`. Erro: `parseError` + `toast.error(parsed.title)`.
- **Restaurar padrão**: só habilitado se o template atual é override da empresa. `DeleteConfirmDialog` → DELETE do registro; recarrega hook (volta ao padrão do tenant).

### 6. Registro de rota e menu
- `App.tsx`: import + `case "/armazem/etiquetas": return <EtiquetaTemplatesPage onNavigate={onNavigate} />;` + entry em `breadcrumbs`.
- `TopNav.tsx`: no grupo "Armazém", após "Zonas de Atividade", adicionar `{ label: "Templates de Etiqueta", path: "/armazem/etiquetas" }`.

## Regras
- `as any` na RPC (types gerados não cobrem).
- Sem novas dependências, sem react-router, sem editar `src/components/ui/`.
- Design system: tokens semânticos, não cores hex novas.
- Erros: `parseError` + `toast.error(parsed.title)`.
- Retrocompatibilidade obrigatória em todos os previews.

## Arquivos afetados
- **Novos**: `src/hooks/useEtiquetaTemplate.ts`, `src/pages/EtiquetaTemplatesPage.tsx`.
- **Alterados**: `thermalEngine.ts` (append), 4 previews, 4 print modals, `App.tsx`, `TopNav.tsx`.
