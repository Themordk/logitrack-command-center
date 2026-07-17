# FASE 1 — Infraestrutura de Padronização de Mensagens

Criação de 4 arquivos novos, sem alterar nenhum arquivo existente e sem adicionar dependências. Verifiquei que `components/ui/collapsible.tsx`, `dialog.tsx` e `button.tsx` já existem no projeto.

## Arquivos a criar

### 1. `src/lib/errorMapper.ts`
- Interface `ParsedError` (type, title, details, errorCode, technicalMessage, instruction).
- Constante `BUSINESS_ERROR_MAP` cobrindo todos os códigos listados: inventário, estoque/endereço, EAN/produto, tarefas, separação/conferência/expedição, abastecimento, auth, ERP, genéricos.
- Constante `SYSTEM_ERROR_PATTERNS` com regex do Postgres/Supabase (duplicate key, RLS, FK, not-null, check, JWT, network, timeout, etc).
- Função exportada `parseError(error, context?)`: extrai mensagem → tenta business match → tenta system pattern → fallback genérico.
- Função exportada `formatErrorForCopy(parsed, extras?)`: JSON estruturado com timestamp.
- Auxiliares internos `extractMessage` e `findBusinessError` (aceita Error, string, `{message}`, `{mensagem, codigo}`, JSON stringificado).

### 2. `src/components/feedback/ResultDialog.tsx`
- Componente unificado sucesso/aviso/erro usando `Dialog`, `Button`, `Collapsible` do shadcn.
- Props: open, onClose, type, title, details, errorCode, technicalMessage, instruction, confirmLabel, onConfirm, secondaryLabel, onSecondary, coletorMode.
- Ícones Lucide: `CheckCircle2` / `AlertTriangle` / `XCircle` com cores do design system (green/yellow/red em bg-*/15).
- `coletorMode`: ícones e botões maiores; oculta seção técnica; instrução destacada.
- Modo web: seção "Detalhes técnicos" colapsável com código, mensagem técnica e botão "Copiar erro completo" (usa `formatErrorForCopy` + `toast.info` do sonner).
- Cores via tokens: `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`.

### 3. `src/hooks/useResultDialog.ts`
- Hook que encapsula estado do dialog e retorna `dialogProps` + `showSuccess` / `showWarning` / `showError` / `showParsedError` / `close` / `isOpen`.
- `showError` invoca `parseError` automaticamente com `context` opcional.
- Suporta `coletorMode` na criação para propagar ao componente.
- Callbacks `onClose` / `onSecondary` disparados após fechar o dialog.

### 4. `src/components/feedback/ErrorBoundary.tsx`
- Classe React `ErrorBoundary` com `getDerivedStateFromError` + `componentDidCatch` (log em console).
- Fallback UI: ícone `AlertTriangle`, título customizável (`fallbackMessage`), instrução, e botões "Tentar novamente" (reset state) e "Recarregar página" (`window.location.reload`) com ícone `RefreshCw`.
- Prop `showDetails` exibe `error.message` em bloco monospace para diagnóstico.

## Regras respeitadas
- Nenhum arquivo existente é modificado (nem `App.tsx`, nem `components/ui/*`, nem páginas).
- Nenhuma dependência nova.
- Named exports em tudo.
- Tipagem estrita (sem `as any`).
- Aliases `@/` em todos os imports.
- Design system dark-first via tokens CSS.

## Validação
- Build TypeScript deve passar.
- Nenhuma página passa a usar os novos módulos nesta fase — eles ficam prontos para adoção incremental nas próximas fases.
