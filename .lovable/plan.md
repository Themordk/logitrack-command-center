# Padronização de saldos UN + CX no Coletor

Exibir saldos em unidades com a conversão em caixas logo abaixo, e destacar a embalagem escaneada, em 6 telas do coletor. Sem novas dependências, sem alterações de backend.

## Verificações já feitas
- `produto.fator_caixa` existe.
- `produto_embalagem` possui `fator`, `embalagem`, `ean`.
- A RPC `rpc_coletor_armazenagem_itens_movimento` já retorna `fator_caixa` — nenhuma migration necessária.
- Nenhum dos arquivos listados tem alteração conflitante; nada será sobrescrito de forma inesperada.

## O que será feito

1. **Novo componente `src/components/coletor/QtdEmCaixa.tsx`** — mostra `{qtd} UN` e, quando o fator de caixa for maior que 1, uma segunda linha `= X CX (+ Y UN)`. Tamanhos sm/md/lg e alinhamento configuráveis. Com fator 1 (ou ausente) renderiza só a linha de UN.

2. **`InfoCard.tsx`** — chips de Lastro/Camada/Fator/Lote/Validade com fonte maior; o chip "Fator Cx" ganha destaque em badge azul quando o fator for maior que 1. Props inalteradas (beneficia Recebimento Execução e Consulta Produto Detalhe automaticamente).

3. **Armazenagem Itens** (`ArmazenagemItensPage.tsx`) — adiciona `fator_caixa` à interface, usa `QtdEmCaixa` no saldo do picking e mostra a conversão em CX abaixo de "A armazenar", "Armazenado" e "Restante".

4. **Consulta Endereço** (`ConsultaEnderecoPage.tsx`) — busca `fator_caixa` no embed do produto e troca o número do saldo por `QtdEmCaixa`.

5. **Consulta HU** (`ConsultaHUPage.tsx`) — mesmo embed de `fator_caixa`; `QtdEmCaixa` nos blocos "Itens Agrupados" (sm) e "Produtos na HU" (md).

6. **Transferência – Produto** (`TransferenciaProdutoPage.tsx`) — captura `fator` e `embalagem` da `produto_embalagem` do EAN escaneado e grava em sessionStorage; no caminho por HU/endereço grava os valores neutros `1` / `UN`.

7. **Transferência – Detalhe** (`TransferenciaDetalhePage.tsx`) — reescrita da tela: bloco "Embalagem escaneada" com badge e "Fator: N UN por EMB", saldo exibido na embalagem escaneada (com resto em UN e total em UN), label do input dinâmico ("Quantidade em CX") e preview da conversão. `transf_quantidade` continua sendo gravado **sempre em UN** para não quebrar as etapas seguintes.

8. **Mudança Picking – Lista** (`MudancaPickingListaPage.tsx`) — `fator_caixa` na interface/consulta, `QtdEmCaixa` por item e total do cabeçalho com conversão em CX quando todos os itens compartilham o mesmo fator (só UN quando há mistura).

## Detalhes técnicos
- Cores via `hsl(...)` inline seguindo o padrão já usado nas telas do coletor; ícone `Box` do lucide-react no card de embalagem.
- Conversões sempre com `Number(...)` explícito e `Math.floor` + módulo.
- Nenhum arquivo fora dos oito listados é tocado.
