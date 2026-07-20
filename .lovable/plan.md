## Ajustes na tela /atividades/mov-saida (Ondas de Carregamento)

### 1. Novos filtros (RPC já suporta todos os parâmetros)
A RPC `listar_ondas_carregamento` já aceita `p_numero_documento`, `p_tipo_saida_id`, `p_parceiro_codigo_erp`, `p_vendedor` e `p_transportador`.

Em `src/pages/MovimentoSaidaPage.tsx` adicionar os seguintes estados/controles, na mesma linha inline dos filtros atuais:
- `filterNumeroDocumento` — `<input number>` com debounce (400 ms), enviado como `Number(...)` ou `null`.
- `filterTipoSaidaId` — `<select>` populado por `tipo_saida` (`tenant_id`, `empresa_id` quando houver, `ativo=true`, `orderBy=descricao`) via `useQuery` estático.
- `filterParceiroCodigoErp` — `<input text>` com debounce (400 ms).
- `filterVendedor` — `<input text>` com debounce (400 ms).
- `filterTransportador` — `<input text>` com debounce (400 ms).

Ajustes na `listQuery`:
- Incluir os cinco novos valores debounced no `queryKey`.
- Enviar os novos parâmetros no payload da RPC (`null` quando vazios).
- Resetar `page` para 1 no `useEffect` de dependências dos filtros.

### 2. Truncar razão social do card (máx. 35 caracteres)
No card do movimento (L748):
- Utilitário local `const truncate = (s, n=35) => s && s.length > n ? s.slice(0, n) + '…' : s;`
- Substituir `{mov.parceiro_nome}` por `{truncate(mov.parceiro_nome)}` e adicionar `title={mov.parceiro_nome}` para tooltip nativo.

### 3. Exibir Tipo de Saída no card, alinhado à direita da Data
Contexto verificado: a RPC **não retorna** `tipo_saida_descricao` (Returns confirmadas via `pg_get_functiondef`). Como o requisito exige "nenhuma mudança na RPC", buscar o rótulo em query auxiliar, no padrão já usado por `opsQuery`:
- Nova `tipoSaidaMapQuery` (`useQuery`), dependendo de `movIdsKey`:
  - `select movimento_saida_id, documento_saida:tipo_pedido_id ( tipo_saida:tipo_pedido_id ( descricao ) )` a partir de `movimento_saida_documento` (JOIN → `documento_saida.tipo_pedido_id` → `tipo_saida.descricao`) filtrando por `movimento_saida_id in (ids)`.
  - Reduzir para `Map<movimentoId, descricao>` — pegar o primeiro tipo distinto (na prática a onda tem um único `tipo_saida` porque o motor agrupa por tipo).
- Propagar `tipo_saida_descricao?: string` na interface `MovSaida` e no `movimentos` memo.
- Substituir a linha `Box: {mov.box_nome} • {formatDate(mov.data_emissao)}` (L750) por dois elementos em `flex justify-between`:
  ```
  <div className="flex items-center justify-between mt-0.5">
    <span className="text-xs text-muted-foreground">Box: {mov.box_nome} • {formatDate(mov.data_emissao)}</span>
    <span className="text-xs text-muted-foreground truncate max-w-[45%] text-right">
      {mov.tipo_saida_descricao || '—'}
    </span>
  </div>
  ```

### 4. Aba "Informações" — incluir campos faltantes
Campos do `movimento_saida` hoje ausentes do card "Dados do Movimento" (grid em L933): `numero_documento` (nº do movimento interno, se existir), `total_esperado`, `total_separado`, `total_conferido`, `total_cortado`, `total_itens`, `data_criacao`, `operador_nome`, `rota_descricao`, `veiculo_placa`, `tipo_saida_descricao`.

Alterações:
- Propagar os campos da RPC (`total_itens`, `total_esperado`, `total_separado`, `total_conferido`, `total_cortado`, `operador_nome`, `rota_descricao`, `veiculo_placa`) para dentro de `MovSaida` no memo `movimentos` (hoje descartados). Não requer migração — já vêm de `listar_ondas_carregamento`.
- Reutilizar o `tipoSaidaMapQuery` do item 3 para o campo Tipo de Saída.
- Ampliar o array do grid `Dados do Movimento` com os novos rótulos:
  `Tipo de Saída`, `Rota`, `Placa Veículo`, `Operador`, `Total de Itens`, `Total Esperado`, `Total Separado`, `Total Conferido`, `Total Cortado`.
- Manter `grid-cols-3` (o layout já é responsivo).

### Detalhes técnicos
- Nenhuma mudança na RPC ou nas views de banco.
- Toda a lógica adicional é frontend + uma query auxiliar (`tipoSaidaMapQuery`) já dentro do escopo de UI.
- Manter o padrão de `useDebounce(400)`, `queryKey` incluindo filtros e `staleTime: 30_000` já vigente.
- Sem alterações no coletor.