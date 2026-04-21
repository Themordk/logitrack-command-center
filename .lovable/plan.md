

## Plano: Seleção de Lote/Validade na Separação (produtos com controle de LOTE/VALIDADE)

### Diagnóstico

Hoje `SeparacaoProdutoPage.tsx` chama `separacao_executar_coleta` passando apenas `p_tenant_id`, `p_tarefa_id`, `p_quantidade`, `p_endereco_id`, `p_usuario_id`. A função foi estendida no banco e passou a aceitar também `p_validade (date)`, `p_fabricacao (date)`, `p_lote (text)` e `p_hu (uuid)` — atualmente ignorados pela UI. Além disso, quando o produto tem `tipo_controle ∈ { LOTE, VALIDADE, LOTE_SERIE }`, o operador precisa **escolher o lote no endereço** (PVPS) antes de confirmar a quantidade.

### Fluxo desejado

```text
Separação/Endereço
   ↓ (scan do endereço OK)
   ↓
   ├── tipo_controle = NENHUM  ───────────────────────┐
   │                                                   │
   └── tipo_controle ∈ {LOTE, VALIDADE, LOTE_SERIE}    │
          ↓                                            │
     Separação/Lote (NOVA ROTA)                        │
        - Lista saldos por lote/validade no endereço   │
        - Sugere PVPS (validade asc) já pré-selecionado│
        - Operador seleciona lote + informa quantidade │
        - Confirmar                                    │
          ↓                                            │
          └──────────────────────────────────────────► Separação/Produto
                                                       (scan EAN + qtd + confirmar)
                                                        ↓
                                                   separacao_executar_coleta
                                                   (com lote/validade/fabricacao)
```

### Mudanças

**1. Nova rota/página: `src/pages/coletor/SeparacaoLotePage.tsx`**
- Caminho: `/coletor/separacao/lote`.
- Carrega da `sessionStorage` a `tarefa_atual` + `endereco_id` resolvido.
- Consulta `estoque_geral` filtrando por `tenant_id + empresa_id + produto_id + endereco_id + quantidade_disponivel > 0`, agrupando por `lote + data_validade + data_fabricacao + hu_id`.
- Ordena por `data_validade ASC` (PVPS) — primeira linha pré-selecionada como **sugestão**.
- UI: lista de cards clicáveis mostrando `Lote • Val: dd/mm/yyyy • Fab: dd/mm/yyyy • Saldo: N`; linha sugerida recebe badge "PVPS".
- Botão "Confirmar Lote" salva em `sessionStorage`:
  - `coletor_separacao_lote_selecionado = { lote, validade, fabricacao, hu_id, saldo_disponivel }`
- Em seguida navega para `/coletor/separacao/produto`.
- Botão "Voltar" retorna a `/coletor/separacao/endereco`.

**2. Alterações em `SeparacaoEnderecoPage.tsx`**
- Após `separacao_confirmar_endereco` retornar sucesso, decidir destino pelo `tipo_controle` da tarefa atual:
  - Se `["LOTE","VALIDADE","LOTE_SERIE"].includes(tipo_controle)` → `/coletor/separacao/lote`.
  - Caso contrário → `/coletor/separacao/produto` (comportamento atual).
- Se a tarefa não carregar `tipo_controle`, fazer fallback consultando `produto.tipo_controle` em `enrichTarefas` (mesmo padrão já existente).
- O atalho "Outros Endereços do Produto" também deve respeitar essa bifurcação após `handleConfirmarEnderecoAlt`.

**3. Alterações em `SeparacaoProdutoPage.tsx`**
- Ler `coletor_separacao_lote_selecionado` do `sessionStorage` (quando presente) e exibir os dados do lote escolhido em um card informativo (Lote, Validade, Fabricação) — não editável.
- Ao chamar `separacao_executar_coleta`, incluir os 4 novos parâmetros:
  ```ts
  p_validade: loteSel?.validade ?? null,
  p_fabricacao: loteSel?.fabricacao ?? null,
  p_lote: loteSel?.lote ?? null,
  p_hu: loteSel?.hu_id ?? null,
  ```
- Validação extra: para produtos com controle de lote, bloquear "Confirmar Quantidade" se não houver lote selecionado (não deveria ocorrer — rota é pré-requisito — mas garantir guard-rail).
- Validação de saldo: a quantidade informada × fator não pode exceder `saldo_disponivel` do lote. Se exceder, exibir dialog pedindo para voltar à tela de lote e selecionar outro / ajustar qtd.
- Ao navegar para a próxima tarefa (`advanceToNext`), **limpar** `coletor_separacao_lote_selecionado` da sessão para não vazar para a próxima.
- No botão voltar ("showBack backPath"), usar `/coletor/separacao/lote` quando a tarefa atual tiver controle de lote; caso contrário manter `/coletor/separacao/endereco`.

**4. Alterações em `src/App.tsx`**
- Import da nova página `SeparacaoLotePage`.
- `case "/coletor/separacao/lote": return <SeparacaoLotePage onNavigate={onNavigate} />;`
- Coletor não tem breadcrumb no cabeçalho, então nenhuma entrada adicional no mapa de breadcrumbs é necessária.

### Chaves de sessionStorage envolvidas

| Chave | Escrita por | Consumida por |
|---|---|---|
| `coletor_separacao_tarefa_atual` (já existe) | EnderecoPage | LotePage, ProdutoPage |
| `coletor_separacao_lote_selecionado` (nova) | LotePage | ProdutoPage |

Formato: `{ lote: string, validade: "YYYY-MM-DD"|null, fabricacao: "YYYY-MM-DD"|null, hu_id: string|null, saldo_disponivel: number }`.

### Regras funcionais

- **PVPS**: ordenar por `data_validade ASC`, desempate por `data_fabricacao ASC`, depois por `lote`. Primeiro item é a sugestão (pré-selecionado + badge).
- **Lote vazio**: saldos onde `lote = ''` ou `data_validade = 1900-01-01` ainda podem aparecer (produtos recém-migrados); nesse caso exibir "—" e ainda permitir seleção (a função backend recebe `null`).
- **Endereço alternativo**: quando o operador escolheu "Outros Endereços do Produto", o `endereco_id` resolvido é o alternativo; a consulta de saldos usa esse mesmo endereço.
- **Zero saldo**: se nenhum lote tiver saldo > 0, exibir estado vazio "Sem saldo neste endereço" com botão "Voltar". Isso já é prevenido pelo banco durante `separacao_confirmar_endereco`, mas a UI deve tratar.

### Tipos (nova página)

```ts
interface LoteDisponivel {
  lote: string;
  validade: string | null;   // ISO date
  fabricacao: string | null; // ISO date
  hu_id: string | null;
  saldo_disponivel: number;
}
```

### Arquivos

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/pages/coletor/SeparacaoLotePage.tsx` | novo | Tela de seleção de lote/validade com sugestão PVPS |
| `src/pages/coletor/SeparacaoEnderecoPage.tsx` | alterado | Bifurca destino por `tipo_controle` |
| `src/pages/coletor/SeparacaoProdutoPage.tsx` | alterado | Envia `p_validade/p_fabricacao/p_lote/p_hu` + exibe lote escolhido + valida saldo |
| `src/App.tsx` | alterado | Rota `/coletor/separacao/lote` |

### Observações

- Nenhuma alteração de schema ou de função SQL é necessária — a função `separacao_executar_coleta` já aceita os novos parâmetros.
- Consistente com o padrão existente (ex.: `RecebimentoExecucaoPage` já usa `tipo_controle` para decidir exibir o modal de lote/validade).
- Nada muda para produtos com `tipo_controle = NENHUM` — fluxo atual preservado.

