# Plano — Conferência Checkout

## 1. Tipo de Saída (`src/pages/TiposSaidaPage.tsx`)

Adicionar campo `conferencia_checkout` ao array `fields`, logo após `realiza_conferencia`:

- Label: `Conferência Checkout`, tipo `switch`, defaultValue `false`.
- Visualmente desabilitado quando `realiza_conferencia=false`.

Para suportar o "desabilitado" sem quebrar o modal genérico, estender `CrudModal` (`src/components/crud/CrudModal.tsx`):

- Adicionar `disabledWhen?: (form) => boolean` em `FieldSpec`.
- Para `type === "switch"`: quando `disabledWhen(form)` for `true`, renderizar `<Switch disabled />` com `opacity-50`, e o label também esmaecido.

No `onSave` da página, antes de chamar `create/update`, forçar:

```ts
if (!payload.realiza_conferencia) payload.conferencia_checkout = false;
```

## 2. Usuário (`src/pages/UsuariosPage.tsx`)

Adicionar no array `fields`, **antes** do toggle `ativo`:

```ts
{ name: "permite_checkout", label: "Permite Checkout", type: "switch", defaultValue: false }
```

Nenhuma outra alteração no fluxo de criação/edição/perfil.

## 3. Coletor — Conferência (`src/pages/coletor/ConferenciaProdutoPage.tsx`)

### 3.1 Leitura do modo (uma única vez no mount)

Após carregar tarefas, executar fetch paralelo:

```ts
const movimentoId = sessionStorage.getItem("coletor_conferencia_movimento_id");
const [{ data: mov }, { data: usr }] = await Promise.all([
  supabase.from("movimento_saida")
    .select("tipo_saida:tipo_saida_id(conferencia_checkout)")
    .eq("id", movimentoId).single(),
  supabase.from("usuario")
    .select("permite_checkout").eq("id", usuarioId).single(),
]);
const modoCheckout = !!mov?.tipo_saida?.conferencia_checkout && !!usr?.permite_checkout;
setModoCheckout(modoCheckout);
```

Estado `modoCheckout` calculado uma vez; não recalculado por scan.

### 3.2 Badge no header

Passar prop `headerExtra` ao `ColetorLayout` (ou renderizar dentro do título). Verificar API de `ColetorLayout` — se já não houver slot, adicionar prop opcional `titleBadge?: ReactNode`. Renderizar quando `modoCheckout`:

```tsx
<span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold uppercase">CHECKOUT</span>
```

### 3.3 Auto-confirmação no scan

Em `handleEanScan`, após sucesso (encontrou `embProd`):

```ts
if (modoCheckout) {
  const restante = qtdRequerida - qtdConferida;
  if (restante <= 0) { toast.warning("Item já conferido"); return; }
  // Confirma usando o RESTANTE como quantidade base (fator NÃO multiplica novamente —
  // restante já está em unidades; usaremos qtdFinal = restante diretamente)
  await confirmarCheckout(restante);
  return;
}
```

Criar helper `confirmarCheckout(qtdFinal)` que reusa o miolo de `handleConfirmar`, mas passa `qtdFinal` direto (sem multiplicar por fator) e `modo_conferencia: "checkout"`.

No JSX, esconder o bloco "QUANTIDADE A CONFERIR" e o botão "Confirmar Conferência" quando `modoCheckout === true`:

```tsx
{!modoCheckout && (<>...input quantidade... <ActionButton>Confirmar</ActionButton></>)}
```

Feedback visual: usar `StatusOverlay` tipo `success` com mensagem "Conferido" (`duration={600}`), além do `toast.success` já existente.

### 3.4 Auditoria — `modo_conferencia`

Adicionar parâmetro `p_modo_conferencia` à RPC `conferencia_saida_confirmacao`:

```ts
await supabase.rpc("conferencia_saida_confirmacao" as any, {
  p_tenant_id: tenantId,
  p_tarefa_id: tarefaId,
  p_quantidade: qtdFinal,
  p_usuario_id: usuarioId,
  p_modo_conferencia: modoCheckout ? "checkout" : "manual",
});
```

Premissa: a função RPC já aceita (ou foi/será atualizada para aceitar) este parâmetro junto às migrations dos campos novos. Confirmar com o usuário se a RPC ainda não aceita.

## Detalhes técnicos

- `tipos.ts` (`src/integrations/supabase/types.ts`) é auto-gerado — não editar; usar `as any` onde a tipagem ainda não refletir os novos campos/parâmetros.
- Não criar componentes novos além do badge inline.
- Não alterar fluxo manual: tudo dentro do branch `if (modoCheckout)`.

## Arquivos afetados

1. `src/components/crud/CrudModal.tsx` — suporte a `disabledWhen` para `switch`.
2. `src/pages/TiposSaidaPage.tsx` — novo campo + força `false` quando conferência desligada.
3. `src/pages/UsuariosPage.tsx` — novo campo `permite_checkout`.
4. `src/components/coletor/ColetorLayout.tsx` — prop opcional `titleBadge` (caso necessário).
5. `src/pages/coletor/ConferenciaProdutoPage.tsx` — detecção, badge, auto-confirmação, payload `modo_conferencia`.

  
**A RPC** `conferencia_saida_confirmacao` **foi atualizada e já aceita o parâmetro** `p_modo_conferencia`**.**

A assinatura atualizada é:

```
conferencia_saida_confirmacao(
  p_tenant_id        uuid,
  p_tarefa_id        uuid,
  p_quantidade       numeric,
  p_usuario_id       uuid,
  p_modo_conferencia text DEFAULT 'manual'
)
```

A coluna `modo_conferencia` também foi adicionada em `tarefa_execucao` com constraint `CHECK IN ('manual', 'checkout')`.

**Pode prosseguir com a implementação completa conforme o plano aprovado.** Nenhuma migration adicional é necessária.