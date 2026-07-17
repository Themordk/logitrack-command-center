# FASE 2 — Integrar Padronização de Mensagens no Web Admin

Aplicar `parseError` do `errorMapper` nos pontos de tratamento de erro do painel administrativo. Sem tocar em coletor, layout, dados, rotas, ou componentes de `ui/`.

## Alterações

### 1) `src/lib/errorMapper.ts` — adicionar 1 pattern
Verificado: já existe `INVALID_CREDENTIALS` no `BUSINESS_ERROR_MAP`, mas o Supabase Auth retorna a string bruta `"Invalid login credentials"` (sem match). Adicionar como **primeiro item** em `SYSTEM_ERROR_PATTERNS`:
```
{ pattern: /Invalid login credentials/i,
  title: "Usuário ou senha incorretos.",
  instruction: "Verifique seus dados e tente novamente." }
```

### 2) `src/hooks/useCrud.ts` — catch dos 3 métodos
- Adicionar import `import { parseError } from "@/lib/errorMapper";`
- Substituir o catch de `create` (linhas 179-183), `update` (193-197) e `remove` (213-217) pelo padrão do prompt:
  - `catch (err: unknown)` com `parseError(err, "criar em ${table}" | "atualizar em ${table}" | "excluir de ${table}")`
  - `toast.error(parsed.title, { description })` com truncamento a 150 chars
  - `throw err` ao final (hoje eles retornam `false`).
- Manter `console.error` opcional? O prompt não pede para remover — vou manter para diagnóstico.
- **Toasts de sucesso, fetchData, fetchOptions e demais lógica ficam intactos.**

Efeito colateral: os métodos passam a lançar em vez de retornar `false`. O único chamador crítico é `CrudModal.handleSave`, ajustado a seguir.

### 3) `src/components/crud/CrudModal.tsx` — envolver `onSave` em try/catch
- Adicionar import `import { toast } from "sonner";` (não existe hoje) e `import { parseError } from "@/lib/errorMapper";`
- Reescrever `handleSave` (linhas 79-98) para envolver `await onSave(cleanData)` em try/catch/finally:
  - `try`: chama `onSave`, se `ok` fecha o modal
  - `catch (err: unknown)`: `parseError(err, "salvar registro")` + `toast.error(parsed.title, { description })` (mesmo truncamento). Não fecha o modal.
  - `finally`: `setSaving(false)`
- Nada mais muda (validação, montagem do payload, layout, props e footer permanecem idênticos).

### 4) `src/components/crud/DeleteConfirmDialog.tsx` — **não alterar**
Verificado: `handleConfirm` só chama `onConfirm()` e usa o retorno booleano — não há bloco `catch`. Conforme regra do prompt, pular.

### 5) `src/pages/LoginPage.tsx` — mensagem do catch de login
- Adicionar import `import { parseError } from "@/lib/errorMapper";`
- Substituir o catch (linhas 130-134) para:
  ```
  } catch (err: unknown) {
    const parsed = parseError(err, "login");
    toast.error(parsed.title);
  }
  ```
- Não há bloco específico tratando `"Invalid login credentials"` — o novo pattern no `errorMapper` cobre. As mensagens customizadas lançadas via `throw new Error(...)` no fluxo (tenant inválido, usuário inativo, etc.) caem no fallback do `parseError` e continuam sendo exibidas com seu texto original (pois viram `technicalMessage`; o `title` fica "Ocorreu um erro inesperado.").
  - Para preservar essas mensagens de negócio já bem escritas, ajuste: quando `parsed.type === "system"` e o fallback for genérico, usar a mensagem original. Implementação simples: `toast.error(parsed.errorCode ? parsed.title : (err instanceof Error ? err.message : parsed.title));` — mostra o texto original quando não bateu com nenhum código/pattern.
- Restante da página (layout, redirect, force change) intacto.

### 6) `src/App.tsx` — ErrorBoundary como wrapper mais externo
- Adicionar import `import { ErrorBoundary } from "@/components/feedback/ErrorBoundary";`
- No `export default function App()` (linhas 590-602), envolver o `QueryClientProvider` com `<ErrorBoundary showDetails>`:
  ```tsx
  <ErrorBoundary showDetails>
    <QueryClientProvider ...>
      ...
    </QueryClientProvider>
  </ErrorBoundary>
  ```
- Rotas, breadcrumbs, imports e `AppContent` permanecem intactos.

## Fora do escopo
- Nenhuma página em `src/pages/coletor/*`.
- Nenhum componente em `src/components/ui/*`.
- Nenhuma nova dependência.
- Nenhuma alteração em outras páginas admin (ficam para uso incremental do hook `useResultDialog` em fases futuras).

## Validação
- Build TypeScript deve passar.
- Fluxo CRUD: erro de duplicidade/validação exibe título amigável; sucesso permanece com `toast.success`.
- Login: senha errada exibe "Usuário ou senha incorretos."; erros de tenant/usuário mantêm mensagens originais.
- Crash de qualquer Provider/página exibe fallback do ErrorBoundary em vez de tela branca.
