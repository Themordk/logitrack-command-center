
# Integração do Motor de Armazenagem

Integração dos dois arquivos enviados (`RegraArmazenagemPage.tsx` e `ColetorSugestaoPickingPage.tsx`) ao app, seguindo o `GUIA_INTEGRACAO.md`. Backend (RPCs, tabelas `regra_armazenagem` e `log_sugestao_armazenagem`) é premissa já pronta.

## 1. Arquivos a copiar

- `user-uploads://RegraArmazenagemPage.tsx` → `src/pages/RegraArmazenagemPage.tsx`
- `user-uploads://ColetorSugestaoPickingPage.tsx` → `src/pages/coletor/ColetorSugestaoPickingPage.tsx`

Copiar sem alterações (usam `supabase`, `useTenant`, `ColetorLayout`, `useFeedback`, `sonner`, todos já disponíveis).

## 2. Roteamento web — `src/App.tsx`

- Import estático de `RegraArmazenagemPage` (padrão do projeto — imports lazy não são usados no App atual).
- Novo case em `renderPage`:
  ```ts
  case "/armazem/regras-armazenagem": return <RegraArmazenagemPage />;
  ```
- Novo breadcrumb no Record:
  ```ts
  "/armazem/regras-armazenagem": [
    { label: "CORE LogiTrack" }, { label: "Armazém" },
    { label: "Regras de Armazenagem" },
  ],
  ```

## 3. Menu — `src/components/TopNav.tsx`

Adicionar item ao grupo "Armazém" (após "Templates de Etiqueta"):
```ts
{ label: "Regras de Armazenagem", path: "/armazem/regras-armazenagem" },
```

## 4. Roteamento coletor — `src/App.tsx` (`renderColetorPage`)

Adicionar case:
```ts
case "/coletor/sugestao-picking":
  return <ColetorSugestaoPickingPage onNavigate={onNavigate} />;
```
A página lê os dados do produto do `localStorage` (fallback já suportado — `core_sugestao_produto_id`, `_sku`, `_desc`, `_lote`, `_validade`, `_quantidade`). Não vamos alterar telas de recebimento agora; o gatilho pode ser adicionado num passo posterior quando o fluxo desejado for definido.

## 5. Fora de escopo (não faremos nesta entrega)

- Integração automática a partir da conferência de recebimento (o guia menciona como opcional; requer decisão de UX sobre em qual momento redirecionar).
- Item de menu no coletor Home — a tela é destino de fluxo, não navegação direta.
- Registro em `useCrud` — não há uso de CRUD genérico para `regra_armazenagem`.
- Regeneração de `types.ts` — projeto usa `as any` para RPCs novas (padrão vigente).

## 6. Verificação

- Rota `#/armazem/regras-armazenagem` abre, carrega/salva regras do armazém do contexto.
- Menu Armazém → "Regras de Armazenagem" navega corretamente.
- Rota `#/coletor/sugestao-picking` renderiza a tela quando dados no localStorage.
- Sem erros TypeScript.
