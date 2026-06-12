# Conferência — Total conferido + Limpar item (coletor/conferencia/itens)

## Escopo

Apenas UI/frontend em `src/pages/coletor/ConferenciaItensPage.tsx`. Nenhuma migration (a função `separacao_conferencia_limpar_item(p_tenant_id, p_movimento_saida_id, p_produto_id, p_usuario_id)` já existe e retorna `void`).

## Mudanças

### 1) Exibir total conferido

No container de cada item, mostrar `conferido / quantidade_requerida` (campos já presentes no objeto da sessão `coletor_conferencia_tarefas`).

Formato sugerido (lado direito do card, antes do botão):

```
Conferido
12 / 30
```

- Cor verde quando `conferido >= quantidade_requerida`, âmbar quando `> 0`, muted quando `0`.

### 2) Botão "Limpar conferência"

Ícone `RotateCcw` (lucide) em pill discreto no canto direito do card.

Fluxo ao clicar:

1. `confirm()` nativo: "Limpar toda a conferência do produto {sku}?"
2. Chamar RPC:
  ```ts
   supabase.rpc('separacao_conferencia_limpar_item', {
     p_tenant_id: tenantId,                                          // useTenant()
     p_movimento_saida_id: sessionStorage.getItem('coletor_conferencia_movimento_id'),
     p_produto_id: t.produto_id,
     p_usuario_id: localStorage.getItem('core_usuario_id'),
   })
  ```
3. Em sucesso:
  - Toast "Conferência do item limpa."
  - Atualizar lista local: `conferido = 0`, `status = 'ATRIBUIDA'` para aquele item; persistir de volta em `sessionStorage` (`coletor_conferencia_tarefas`) para a `ConferenciaProdutoPage` enxergar o reset ao voltar.
4. Em erro: toast com `error.message`.

Estado `clearingId` (uuid do item) desabilita só aquele botão durante a chamada (spinner `Loader2`).

### 3) Detalhes UX

- Botão escondido quando `conferido === 0` (nada a limpar) — opcional, mas evita ruído.
- Após limpar, manter o card visível com badge `ATRIBUIDA`.

## Verificação

- Onda com item parcialmente conferido → badge mostra `X / Y`, botão visível, clique limpa, badge vai para `0 / Y` e status `ATRIBUIDA`.
- Voltar para `/coletor/conferencia/produto` → o item aparece como pendente novamente.
- Erro de RPC → toast vermelho com mensagem.