

# Plano: Otimizar Fluxo de Abastecimento

## Problema 1 -- Simulacao nao exibe itens

A RPC `fn_gerar_abastecimento` retorna um array plano de objetos `{origem, destino, produto_id, quantidade}`, mas o frontend espera `result.itens`, `result.alertas`, `result.total_tarefas` -- campos que nao existem no retorno real. Por isso `simItens` fica vazio.

## Problema 2 -- Fluxo precisa virar nova rota

O usuario quer que ao clicar "Gerar Preventivo/Corretivo", o sistema navegue para uma rota dedicada (similar a Onda de Carregamento) em vez de abrir modal.

---

## Arquitetura Proposta

```text
AbastecimentoPage (lista de lotes)
  └─ Botao "Gerar Preventivo/Corretivo"
       └─ Modal selecao armazem → navega para nova rota

AbastecimentoGeracaoPage (nova rota: /atividades/abastecimento/gerar)
  ├─ Filtros superiores (Saldo Picking ordem, Setor)
  ├─ Tabela com checkbox (SKU, Descricao, End.Origem, End.Destino,
  │   Saldo Picking, Saldo Pulmao, Est.Minimo, Est.Maximo, Em Separacao)
  ├─ Selecionar todos / individuais
  └─ Botao "Confirmar Geracao"
       └─ Popup atribuicao usuario (opcional)
            └─ Gera tarefas + tarefa_atribuicao
```

---

## Detalhamento

### 1. Ajustar RPC `fn_gerar_abastecimento` (migration SQL)

A RPC precisa retornar dados enriquecidos para a nova tela. Alterar o retorno da simulacao para incluir:
- `sku`, `descricao` (JOIN com `produto`)
- `endereco_origem_desc`, `endereco_destino_desc` (JOIN com `endereco`)
- `saldo_picking` (saldo atual no endereco picking)
- `saldo_pulmao` (saldo atual no endereco pulmao)
- `est_minimo`, `est_maximo` (de `picking_produto`)
- `em_separacao` (tarefas SEP pendentes para o produto)
- `setor_id`, `setor_descricao` (do endereco destino, para filtro)
- `quantidade` (qtd a abastecer)

O retorno deve ser um array de objetos enriquecidos quando `p_simular = true`.

### 2. Nova pagina `AbastecimentoGeracaoPage.tsx`

Rota: `/atividades/abastecimento/gerar?tipo=PREVENTIVO&armazem=UUID`

Layout inspirado em `MovimentoSaidaPage`:
- **Barra de filtros superior**: 
  - Ordenar por Saldo Picking (crescente/decrescente)
  - Filtro por Setor
- **Tabela com colunas**: SKU | Descricao | End. Origem | End. Destino | Saldo Picking | Saldo Pulmao | Est. Minimo | Est. Maximo | Em Separacao
- **Checkbox** por linha + "Selecionar todos" no header
- **Rodape fixo**: contadores (X itens selecionados, Y tarefas) + botao "Confirmar Geracao"

### 3. Popup de atribuicao de usuario

Ao clicar "Confirmar Geracao":
1. Abre dialog com select de usuarios do tipo operador (consulta tabela `usuario`)
2. Campo opcional -- pode confirmar sem selecionar usuario
3. Ao confirmar:
   - Chama RPC `fn_gerar_abastecimento` com `p_simular = false` passando apenas os itens selecionados
   - Se usuario atribuido: insere registros em `tarefa_atribuicao` para cada tarefa gerada

### 4. Ajustar `AbastecimentoPage.tsx`

- Remover modal de simulacao/geracao (todo o fluxo multi-step)
- Botoes "Gerar Preventivo/Corretivo" abrem modal simples de selecao de armazem, e ao confirmar navegam para `/atividades/abastecimento/gerar?tipo=X&armazem=Y`
- Manter tabela de listagem e modal de detalhe de tarefas

### 5. Registrar rota no `App.tsx`

- Adicionar rota dinamica `/atividades/abastecimento/gerar` no switch/case
- Adicionar breadcrumb correspondente
- Importar novo componente

### 6. Ajustar RPC para aceitar lista de itens selecionados

Adicionar parametro opcional `p_itens jsonb` a `fn_gerar_abastecimento`. Quando `p_simular = false` e `p_itens` for informado, gerar tarefas apenas para os itens passados (produto_id + destino + quantidade).

---

## Arquivos Afetados

```text
NOVOS:
  - src/pages/AbastecimentoGeracaoPage.tsx
  - 1 migration SQL (ajustar RPC)

EDITADOS:
  - src/pages/AbastecimentoPage.tsx (simplificar, remover modal multi-step)
  - src/App.tsx (nova rota + breadcrumb + import)
  - src/hooks/useRoutePermission.ts (mapear nova rota)
```

