
## Objetivo
Entregas do dia 20/07 no coletor de recebimento:
1. Bloquear confirmação com validades inválidas.
2. Sinalizar visualmente itens com status DIVERGENTE nas telas de execução e conferência.

## 1. Validação de datas — `src/pages/coletor/RecebimentoExecucaoPage.tsx`

Modal Lote/Validade (`showLoteModal`):

- Adicionar validação derivada dos inputs `fabricacao` e `validade` (comparação de strings `YYYY-MM-DD` — segura, sem timezone).
  - **Regra A**: `validade < fabricacao` → inválido, mensagem "Validade não pode ser anterior à fabricação".
  - **Regra B**: `validade < hoje` (data atual em Fortaleza) → inválido, mensagem "Produto vencido — validade não pode ser anterior à data atual".
- Exibir uma faixa vermelha (`bg-[#E02424]/15 text-[#E02424]`) logo abaixo dos campos de data quando houver erro.
- Estender o `disabled` do `ActionButton` CONFIRMAR (linha 468) para incluir a flag de erro; assim o registro fica bloqueado no modal (o produto anterior permanece intacto e o usuário pode corrigir ou cancelar).
- Manter a lógica atual para tipos de controle que não pedem validade (`LOTE` puro sem validade também exige fabricação/validade hoje — a regra só é ativada quando o input `validade` está preenchido; mas como o modal já exige ambos preenchidos para `VALIDADE`/`LOTE`/`LOTE_SERIE`, a validação sempre roda nesses tipos).

Hoje em Fortaleza: derivar como `new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" })` para obter `YYYY-MM-DD` comparável.

## 2. Ícone de atenção para itens DIVERGENTES

### 2.1 `RecebimentoExecucaoPage.tsx` (lista "Itens conferidos")
- O select da view já traz `status` por linha (linhas 116/132). Onde `status === "DIVERGENTE"` exibir um `AlertTriangle` (lucide, já importado) size 16, cor `#F59E0B`, ao lado do SKU (dentro do bloco `flex justify-between items-baseline`, linha 360).
- Tooltip via `title="Item divergente"` para acessibilidade.

### 2.2 `RecebimentoConferenciaPage.tsx` (resumo agrupado por SKU)
- Incluir `status` no `.select(...)` do `loadResumo` (linha 43).
- Ao agrupar por SKU (linhas 48-60), marcar `divergente: true` se qualquer linha do grupo tiver `status === "DIVERGENTE"`. Adicionar campo `divergente?: boolean` na interface `ItemResumo`.
- No card do item (linha 124), renderizar `AlertTriangle` (size 16, `#F59E0B`) ao lado da descrição quando `item.divergente`.

## Escopo excluído
- Nenhuma alteração em RPCs, views ou schema.
- Nenhuma mudança em outras rotas (`/coletor/recebimento/iniciar`, `/concluido`, etc.).
- Não altera regras de finalização — apenas indicação visual e bloqueio local do modal de datas.
