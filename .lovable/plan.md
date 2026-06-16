## Ajuste no Coletor — Inventário aceita endereços bloqueados

**Arquivo:** `src/pages/coletor/InventarioEnderecoPage.tsx`

Atualmente (linhas 122–123) a UI bloqueia qualquer endereço cuja `situacao` não seja `LIVRE` ou `OCUPADO`, exibindo o diálogo "Endereço Incorreto". Como o módulo de inventário precisa contar endereços que estão `BLOQUEADO` ou `BLOQUEADO_INVENTARIO` (estado normal durante a contagem), essa validação será removida apenas nesta rota.

### Mudança
- Remover o bloco `if (!["LIVRE","OCUPADO"].includes(found.situacao)) { setErrorDialog(...); return; }`.
- Manter as demais validações: pertencer ao inventário (`itens.some(...)`), já contado, etc.
- Nenhuma alteração em backend, triggers ou outras rotas do coletor (as rotas operacionais — armazenagem, separação, abastecimento, transferência, consulta — continuam bloqueando, conforme plano anterior).

### Resultado
O operador poderá escanear `R01-P10-N01-A10` mesmo com situação `BLOQUEADO_INVENTARIO` e prosseguir para a contagem.
