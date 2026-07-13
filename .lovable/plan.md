## Fase 2B — Ocorrências: correções + integração no coletor

### Parte 1 — Bug fix
- `src/pages/OcorrenciasOperacionaisPage.tsx`: alterar `contexto={{ etapa: "AUDITORIA" }}` para `contexto={{}}` no `RegistrarOcorrenciaButton`, permitindo que o operador escolha a etapa no modal.

### Parte 2 — `src/pages/OcorrenciaDetalhePage.tsx`
- Adicionar `EM_TRATAMENTO` nos mapas `STATUS_BADGE`, `STATUS_LABEL` e `STATUS_DOT` (roxo).
- Novos imports lucide: `MapPin, ClipboardList, UserX, Hash, Calendar, Tag, Wrench`.
- Query `load()`: incluir joins `endereco:endereco_id(descricao)` e `usuario_causador:usuario!ocorrencia_operacional_usuario_causador_id_fkey(nome)`.
- Adicionar InfoItems para: endereço, tarefa, causador, lote, validade, categoria (badge Preventiva/Corretiva).
- Ampliar `DialogAction` com `EM_TRATAMENTO`; adicionar botão "Iniciar tratamento" (cor roxa) quando status = `EM_INVESTIGACAO`.
- Adicionar suporte a cor `purple` no `ActionBtn`.
- Título do dialog e select de status do modal "Registrar Histórico" — incluir opção EM_TRATAMENTO.
- Timeline: ícone `Wrench` para EM_TRATAMENTO.

### Parte 3 — `src/pages/MotivosOcorrenciaPage.tsx`
- Novas colunas na tabela: `acao_automatica`, `prioridade_padrao`, `categoria_padrao` (com labels amigáveis; categoria como badge azul/laranja).
- Atualizar `etapa_ocorrencia` para incluir `INVENTARIO` e `AUDITORIA`.
- Novos campos no formulário: `acao_automatica`, `prioridade_padrao`, `categoria_padrao`. Verificar suporte a `enumLabels` no `CrudModal`; se não existir, usar `enumValues` diretamente sem alterar o CrudModal.

### Parte 4 — Integração `RegistrarOcorrenciaColetorButton` em 9 telas do coletor
Para cada tela abaixo, ler primeiro para localizar as variáveis reais de produto/endereço/tarefa/documento; posicionar o botão como ação secundária (antes das ações principais). Se uma variável não existir, passar `undefined`.

- `ConferenciaProdutoPage.tsx` — etapa `RECEBIMENTO`, produto atual + `documento_origem_id` do movimento entrada.
- `ArmazenagemExecucaoPage.tsx` — etapa `ARMAZENAGEM`, produto, endereço destino, tarefa.
- `AbastecimentoColetaPage.tsx` — etapa `ABASTECIMENTO`, produto, endereço origem pulmão, tarefa.
- `AbastecimentoDestinoPage.tsx` — etapa `ABASTECIMENTO`, produto, endereço destino picking, tarefa.
- `SeparacaoProdutoPage.tsx` — etapa `SEPARACAO`, produto, endereço picking, tarefa. Não mexer no fluxo de corte.
- `ConferenciaItensPage.tsx` — etapa `EXPEDICAO`, produto conferido, `documento_origem_id` do movimento saída.
- `InventarioEnderecoPage.tsx` — etapa `INVENTARIO`, endereço.
- `InventarioProdutoPage.tsx` — etapa `INVENTARIO`, produto + endereço.
- `ConsultaProdutoDetalhePage.tsx` — etapa `undefined` (operador escolhe), produto.

### Fora de escopo
- Nada de backend (tabelas/enums/RPCs/edge functions).
- Sem alterar `App.tsx`, `SeparacaoOcorrenciasPage.tsx`, `LiberarErroTransporteModal.tsx`, os 3 componentes de ocorrência criados na Fase 2A, nem componentes em `src/components/ui/`.
