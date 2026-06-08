# Plan — Refresh visual e finalização no Checkout da Conferência

## Diagnóstico

Arquivo: `src/pages/coletor/ConferenciaProdutoPage.tsx`, função `executarConfirmacao` (lin. ~176–260).

Foram identificados dois defeitos que produzem exatamente os sintomas relatados:

### 1) Container REQUERIDA/CONFERIDA/RESTANTE não atualiza após o scan

Hoje o estado `qtdConferida` (que alimenta o container) **só é atualizado dentro de `if (tarefaAtualizada)`**:

```ts
const newQtdConferida = Number(tarefaAtualizada?.quantidade_executada || qtdConferida + qtdFinal);
const newQtdRequerida = Number(tarefaAtualizada?.quantidade_requerida || qtdRequerida);

if (tarefaAtualizada) {
  setQtdConferida(newQtdConferida);          // <- só roda se o refetch voltou
  ...
}
```

O refetch direto em `from("tarefa").select(...)` pode retornar `null` para o coletor (RLS, sessão sem JWT válido, ou simplesmente quando o trigger ainda não terminou). Quando isso ocorre, `setQtdConferida` **nunca é chamado**, embora a RPC tenha gravado com sucesso — o usuário vê CONFERIDA = 0 e acha que não conferiu (falso negativo).

### 2) Não há mensagem de sucesso ao concluir a tarefa/onda

Quando `newQtdConferida >= newQtdRequerida` e não há próxima tarefa, o código apenas dispara um `toast.success(...)` e chama `onNavigate("/coletor/conferencia/iniciar")` imediatamente. No modo Checkout (1 scan → conclui tudo), a navegação acontece antes do React pintar o estado atualizado e antes do usuário registrar o toast — o efeito visível é "nada aconteceu, voltei para a tela anterior".

Há também um caso intermediário: quando conclui a tarefa atual mas existe próxima, hoje só aparece um `toast.success("Item conferido! Próximo item...")` muito rápido, sem feedback visual forte.

## Mudanças (apenas UI/presentation)

Arquivo único: `src/pages/coletor/ConferenciaProdutoPage.tsx`.

### A. Atualizar contadores sempre, com fallback

Mover `setQtdConferida(newQtdConferida)` e o `setTarefas([...])` para **fora** do `if (tarefaAtualizada)`. O cálculo de fallback `qtdConferida + qtdFinal` já está correto e cobre o caso de refetch nulo. Assim o container REQUERIDA / CONFERIDA / RESTANTE atualiza imediatamente após o RPC retornar sucesso, independentemente do refetch.

Também tratar o caso `quantidade_executada = 0` corretamente (hoje `|| qtdConferida + qtdFinal` interpreta `0` como falsy — trocar por checagem `?? `).

### B. Feedback visual forte no sucesso

Reutilizar o componente já existente `StatusOverlay` (`src/components/coletor/StatusOverlay.tsx`, que mostra ícone/cor por 800 ms em tela cheia):

- Após cada confirmação bem-sucedida: disparar overlay `success` com mensagem "Item conferido" (modo checkout) ou "Quantidade registrada".
- Quando a tarefa atual encerra e há próxima: overlay `success` "Item conferido — próximo" e só então `loadTarefa(next)`.
- Quando a onda inteira encerra: substituir o `toast + onNavigate` imediato por:
  1. Atualizar contadores na tela (`setQtdConferida(newQtdRequerida)`).
  2. Abrir o `resultDialog` (modal já existente) com `sucesso: true` e mensagem **"Conferência da Onda #N finalizada com sucesso"** + botão "Fechar".
  3. Navegar para `/coletor/conferencia/iniciar` apenas no `onClick` do botão Fechar (handler `handleDialogClose` já existente, ajustado para navegar quando `resultDialog.sucesso === true` e onda concluída).

### C. Pequeno ajuste no checkout para evitar dupla execução

No bloco `if (modoCheckout)` de `handleEanScan`, usar a versão **mais recente** de `qtdConferida`/`qtdRequerida` (estado atual via leitura direta de `tarefas[tarefaIdx]`) para calcular `restante`, evitando que valores em closure travem o cálculo se o usuário escanear de novo muito rápido.

## Fora de escopo

- Nenhuma alteração em RPC, migrations ou edge functions.
- Nenhuma alteração na lógica de negócio do checkout (continua: scan único → executa `restante`).
- Sem mudanças no modo manual além do reuso do `StatusOverlay` para sucesso (consistência visual).

## Validação

1. Logar como o usuário de teste (`7c937c97-…`) com tipo de saída checkout.
2. Iniciar conferência da onda, abrir uma tarefa.
3. Escanear o EAN do produto:
   - Container deve mostrar CONFERIDA = REQUERIDA, RESTANTE = 0 imediatamente.
   - Overlay verde "Item conferido" aparece por ~800 ms.
   - Se for última tarefa: modal de sucesso com "Conferência da Onda finalizada com sucesso" e botão Fechar; só sai da tela ao clicar Fechar.
   - Se houver próxima: avança automaticamente para a próxima após o overlay.
