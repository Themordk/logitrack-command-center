## Ajustes na tela /atividades/movimentos (Movimentos de Entrada)

### 1. Novos filtros (RPC já suporta)
A RPC `listar_movimentos_entrada` já aceita `p_tipo_entrada_id`, `p_placa_veiculo`, `p_box_id` e `p_parceiro_codigo_erp`. Basta acrescentar os controles de UI e enviar os parâmetros.

Em `src/pages/MovimentoEntradaPage.tsx`:
- Adicionar 4 novos estados de filtro:
  - `filterTipoEntradaId` — `<select>` populado por `tipo_entrada` (empresa/tenant ativos, `ativo=true`, ordenado por descrição). Carregado via `useQuery` estático.
  - `filterPlacaVeiculo` — `<input text>` com debounce (400 ms), padroniza uppercase.
  - `filterBoxId` — `<select>` populado por `box` (tenant + armazém ativo se houver, `ativo=true`).
  - `filterParceiroCodigoErp` — `<input text>` com debounce (400 ms).
- Incluir os novos valores no `queryKey` e no payload da RPC (`p_tipo_entrada_id`, `p_placa_veiculo`, `p_box_id`, `p_parceiro_codigo_erp`), enviando `null` quando vazios.
- Resetar página ao alterar qualquer novo filtro.
- Manter layout inline atual (`flex flex-wrap`), inserindo os campos na mesma linha dos existentes.

### 2. Truncar razão social do card do movimento (máx. 35 caracteres)
No card do movimento (`movements.map` em torno da L582), aplicar truncamento no `parceiro_nome`:
- Utilitário local: `const truncate = (s, n=35) => s && s.length > n ? s.slice(0, n) + '…' : s;`
- Exibir `truncate(mov.parceiro_nome)`, mantendo `title={mov.parceiro_nome}` para tooltip nativo.
- Preserva o `MoreVertical` sempre acessível sem scroll horizontal.

### 3. Exibir Tipo de Entrada no card, alinhado à direita da Data
- A RPC já retorna `tipo_entrada_descricao`. Propagar esse campo do `listRows` para `MovEntry` (novo campo `tipo_entrada_descricao?: string`).
- Substituir a linha atual `<p className="text-xs text-muted-foreground">{fmtDate(...)}</p>` por um `flex justify-between`:
  ```
  <div className="flex items-center justify-between mt-1">
    <span className="text-xs text-muted-foreground">{fmtDate(mov.created_at)}</span>
    <span className="text-xs text-muted-foreground truncate max-w-[45%] text-right">
      {mov.tipo_entrada_descricao || '—'}
    </span>
  </div>
  ```

### 4. Aba "Informações" — incluir campos faltantes do movimento
Ampliar a view/interface e o card "Dados do Movimento":
- Estender `MovimentoInfo` com os campos hoje ausentes: `tipo_entrada_descricao`, `numero_movimento`, `status`, `created_at`, `usuario_criacao` (login), `total_volume`, `total_volume_conferido` já existem.
- Verificar se `vw_movimento_entrada_info` já expõe esses campos. Caso `tipo_entrada_descricao` ou `numero_movimento` estejam faltando, criar migração para adicioná-los à view (join com `tipo_entrada` e coluna direta de `movimento_entrada`).
- No JSX da aba "Informações", adicionar novos campos ao grid "Dados do Movimento" (transformar em `grid-cols-3`) exibindo: **Nº Movimento**, **Tipo de Entrada**, **Status**, **Data Criação** — em complemento aos já existentes (Armazém, Box, Placa, Valor Descarga, Crossdocking, Observação).

### Detalhes técnicos
- Nenhuma mudança lógica na RPC (`listar_movimentos_entrada` já aceita todos os parâmetros).
- Migração SQL apenas se `vw_movimento_entrada_info` não retornar `tipo_entrada_descricao`/`numero_movimento`; a confirmação será feita na primeira leitura antes de aplicar a migração.
- Sem alteração no coletor.
