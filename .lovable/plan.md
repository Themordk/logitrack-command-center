# Importação manual de entrada — fallback Recebimentos → Notas

## Objetivo

Em **Atividades → Gerar Entradas → Importar do ERP**, ao informar a chave de acesso (ou número do documento), o sistema deve:

1. Consultar **primeiro** `sync-recebimentos` (compras para revenda).
2. Se não houver registro correspondente, consultar `sync-notas-entrada` (NF-e de entrada).
3. Se ambas falharem, exibir erro consolidado.

Sem mudanças visuais na UI — apenas a lógica do fluxo `entidade: "nota_entrada"` em `ImportarDoERPModal`.

## Escopo

- Frontend: `src/components/erp/ImportarDoERPModal.tsx` (somente o branch `nota_entrada`).
- Backend: **nenhuma alteração** nas Edge Functions `sync-recebimentos` e `sync-notas-entrada` (já existentes e deployadas).
- Sem mudanças em UI, RLS, RPCs ou migrations.

## Lógica nova (branch `nota_entrada`)

```text
input = valor.trim()
body  = { tenant_id, empresa_id, ...(input.length === 44 ? { chave_nfe: input } : { numero_nota: input }) }

# Passo 1 — Recebimentos (compra/revenda)
res1 = invoke('sync-recebimentos', body)
if res1.sucesso === true:
    setRegistro({ ...res1, _origem: 'recebimento' })
    return PREVIA

# Passo 2 — Fallback NF-e de entrada
res2 = invoke('sync-notas-entrada', body)
if res2.sucesso === true:
    setRegistro({ ...res2, _origem: 'nota_entrada' })
    return PREVIA

# Passo 3 — Erro consolidado
erro = "Documento não encontrado no ERP (verificado em Recebimentos e Notas de Entrada)."
       + detalhes opcionais de res1.erro / res2.erro
return ERRO
```

### Regras de performance e assertividade

- **Sequencial, não paralelo**: evita criar documento duplicado caso ambas as funções respondam positivo. Recebimentos tem prioridade porque é o caso de uso mais comum (compra para revenda).
- **Curto-circuito** no primeiro sucesso — segunda chamada só ocorre quando a primeira retorna `sucesso === false` ou erro de rede com mensagem indicando "não encontrado".
- **Erros não relacionados a "não encontrado"** (timeout, 5xx, falha de auth) devem interromper o fluxo imediatamente sem cair no fallback, para não mascarar problemas reais.
- **Indicador visual** existente ("Consultando ERP Omie...") reaproveitado; opcionalmente trocar a mensagem para "Consultando recebimentos..." → "Consultando notas fiscais..." entre as etapas (mudança mínima de label, sem alterar layout).

### Tela de prévia

- O campo `_origem` permite que a tela de PREVIA (e o toast de sucesso) exiba a fonte ("Recebimento" ou "Nota Fiscal de Entrada") sem mudar a estrutura dos campos exibidos.
- `camposPrevia` em `EntradasPage.tsx` já cobre os campos comuns (`numero_nota`, `parceiro_nome`, `data_emissao`, `valor_total_nota`, `qtd_itens`); ambos os endpoints retornam esse shape — confirmar antes do build; se divergir, normalizar no helper.

## Detalhes técnicos

- Adicionar helper local `tentarImportarEntrada(body)` no próprio `ImportarDoERPModal.tsx`, encapsulando a sequência e retornando `{ data, origem } | { erro }`.
- Classificar erro como "não encontrado" usando heurística: `data?.sucesso === false` **ou** mensagem contendo `não encontrad` / `not found` / HTTP 404. Demais erros sobem direto.
- Manter o restante do componente intacto (estados, polling de produto/parceiro, redirect_sync).

## Fora de escopo

- Alterar `sync-recebimentos` ou `sync-notas-entrada`.
- Alterar a UI de `EntradasPage`, `CrudTable`, ou tokens de design.
- Tornar a busca paralela ou criar uma terceira edge function "roteadora".
