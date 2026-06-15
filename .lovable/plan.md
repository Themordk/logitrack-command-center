# Ajustes Coletor — Bloqueio de Endereços + Detalhe de Endereço

## 1ª Ação — Validar `endereco.situacao` antes de processar

**Regra:** Sempre que o usuário escanear um endereço para movimentação, ler a coluna `endereco.situacao`. Permitir apenas `LIVRE` ou `OCUPADO`. Caso `BLOQUEADO` ou `BLOQUEADO_INVENTARIO`, abortar o fluxo e exibir mensagem padrão:

> "Endereço **{descricao}** está **{SITUACAO}**. Movimentações não são permitidas. Procure a supervisão."

A mensagem usará o mesmo padrão de erro já existente em cada tela (overlay `error`, `toast.error` ou `errorDialog`), sem mudar a UX.

### Telas afetadas e ponto exato da checagem


| Rota                                                 | Arquivo                                                                                                                                                                           | Onde inserir                                                                                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/coletor/armazenagem/iniciar` → destino na execução | `ArmazenagemExecucaoPage.tsx` (lookup do destino, ~linha 100, no `.from("endereco")`) — é onde o endereço é de fato escaneado. A página `iniciar` apenas lê EAN/HU, sem endereço. | Após buscar o endereço por `codigo_endereco`, validar `situacao`.                                                                                                                                            |
| `/coletor/movimentos/transferencia/origem`           | `TransferenciaOrigemPage.tsx` — `handleScan`, após o `.from("endereco")`                                                                                                          | Incluir `situacao` no `.select` e bloquear. (Aplicar mesma checagem em `TransferenciaDestinoPage.tsx` para consistência — destino também não pode ser bloqueado.)                                            |
| `/coletor/movimentos/abastecimento` (coleta)         | `AbastecimentoColetaPage.tsx` — `handleScanEndereco`                                                                                                                              | Incluir `situacao` no `.select` e bloquear antes do `matchesTarefa`. Aplicar a mesma checagem em `AbastecimentoDestinoPage.tsx` quando o destino for escaneado.                                              |
| `/coletor/separacao/endereco`                        | `SeparacaoEnderecoPage.tsx` — `handleScan`                                                                                                                                        | Antes de chamar a RPC `separacao_confirmar_endereco`, fazer um `select id, descricao, situacao from endereco` por `codigo_endereco`/`descricao = code` e bloquear se for `BLOQUEADO`/`BLOQUEADO_INVENTARIO`. |
| `/coletor/inventario/endereco`                       | `InventarioEnderecoPage.tsx` — `handleScan`, no `.from("endereco")` (linha ~107)                                                                                                  | Incluir `situacao` no `.select` e bloquear antes da comparação com `expectedId`.                                                                                                                             |


### Detalhes técnicos

- Incluir `situacao` no `select`: `select("id, descricao, codigo_endereco, situacao")`.
- Função utilitária local em cada tela (sem criar arquivo novo):
  ```ts
  const SITUACOES_PERMITIDAS = ["LIVRE", "OCUPADO"];
  ```
- Exibição: usar o mecanismo já presente na tela (`setErrorDialog` no Separação/Inventário, `setOverlay("error")` em Transferência/Armazenagem, `toast.error` em Abastecimento).

---

## 2ª Ação — Detalhe do Endereço (a partir de `/coletor/consulta/endereco`)

### Mudança em `ConsultaEnderecoPage.tsx`

- Após localizar o endereço, guardar `enderecoId` em state.
- No card que hoje exibe apenas `Endereço · descrição`, adicionar um link **VER DETALHES** alinhado à direita (mesmo padrão visual do botão equivalente em `ConsultaProdutoPage.tsx`).
- Ao clicar:
  ```ts
  sessionStorage.setItem("coletor_consulta_endereco_id", enderecoId);
  sessionStorage.setItem("coletor_consulta_endereco_back", "/coletor/consulta/endereco");
  onNavigate("/coletor/consulta/endereco/detalhe");
  ```

### Nova página `src/pages/coletor/ConsultaEnderecoDetalhePage.tsx`

Espelhar a estrutura visual de `ConsultaProdutoDetalhePage.tsx` (tabs, `cardClass`, `labelClass`, `valClass`, `inputClass`, `btnPrimary`, `ColetorLayout` com `showBack`).

Três abas:

**Aba INFORMAÇÕES** — somente leitura

- `codigo_endereco`
- `descricao`
- `situacao` (renderizar como Badge colorido seguindo o mapeamento já definido em `StatusBadge` para `endereco-situacao`)
- `ativo` (Sim/Não)

**Aba CONFIGURAÇÕES** — editáveis

- `tipo_endereco` (select: PULMAO, PICKING)
- `curva_acesso` (select: A, B, C, D)
- `total_pallet` (number)
- `lado` (select: PAR, IMPAR)

**Aba CUBAGEM** — editáveis

- `altura` (number)
- `largura` (number)
- `comprimento` (number)
- `m3` (number)

Cada aba editável tem botão **Salvar** chamando `supabase.from("endereco").update({...}).eq("id", enderecoId)`, com `toast.success`/`toast.error` e recarregando os dados após salvar. Sem cálculo automático de M³ (campo editável manualmente como solicitado).

### Registro da rota

Em `src/App.tsx`:

```ts
import { ConsultaEnderecoDetalhePage } from "./pages/coletor/ConsultaEnderecoDetalhePage";
// ...
case "/coletor/consulta/endereco/detalhe":
  return <ConsultaEnderecoDetalhePage onNavigate={onNavigate} />;
```

---

## Pontos a confirmar

- **Armazenagem**: a checagem prática deve ser na **execução** (onde o endereço é escaneado), e não na `iniciar` (que lê EAN/HU). Vou implementar em `ArmazenagemExecucaoPage.tsx`. OK? - OK
- **Transferência destino** e **Abastecimento destino**: por simetria, vou aplicar a mesma regra de bloqueio nessas telas também (mesmo não estando na lista). OK? - OK
  &nbsp;