## Plano — Fase 2C: Simplificação UX do botão de Ocorrência no Coletor

### Objetivo
Reduzir o formulário do bottom sheet de ocorrência de ~10 campos para **1 toque obrigatório** (selecionar motivo) + detalhes opcionais expansíveis, e eliminar duplicidade na separação.

### 1. Reescrever `src/components/ocorrencia/RegistrarOcorrenciaColetorButton.tsx`
- Fluxo wizard em 1 tela:
  - Contexto (produto/endereço, somente leitura)
  - Lista de motivos como cards selecionáveis (obrigatório)
  - Link "Adicionar detalhes (opcional)" → expande accordion com: Tipo (default `OUTROS`), Categoria, Prioridade, Qtd Esperada/Real + Divergência, Lote, Validade, Observação
  - Botões Cancelar / Confirmar
- Defaults automáticos:
  - `etapa` ← `contexto.etapa`
  - `tipo_ocorrencia` ← `OUTROS`
  - `categoria` ← `motivo.categoria_padrao` ?? `CORRETIVA`
  - `prioridade` ← `motivo.prioridade_padrao` ?? `NORMAL`
- Campos Qtd/Lote/Validade só aparecem se houver `contexto.produto_id`
- Chamada RPC `registrar_ocorrencia_operacional` inalterada

### 2. Remover duplicidade em `src/pages/coletor/SeparacaoProdutoPage.tsx`
- Remover import e uso do `RegistrarOcorrenciaColetorButton` do rodapé
- Manter o botão ⚠️ existente no canto superior direito que leva para `SeparacaoOcorrenciasPage` (corte + ocorrência)

### 3. Remover botão em `src/pages/coletor/ConsultaProdutoDetalhePage.tsx`
- Tela informativa sem etapa definida — remover import e uso do botão

### 4. Ajuste de posicionamento (verificação)
Nas 7 telas restantes (`ConferenciaProdutoPage`, `ConferenciaItensPage`, `ArmazenagemExecucaoPage`, `AbastecimentoColetaPage`, `AbastecimentoDestinoPage`, `InventarioEnderecoPage`, `InventarioProdutoPage`), garantir que o botão de ação principal (Confirmar/Continuar) fique acima do botão de ocorrência. Corrigir apenas onde estiver invertido.

### Fora do escopo
- Nenhuma alteração em banco, RPCs, enums, App.tsx, componentes web de ocorrência ou `SeparacaoOcorrenciasPage`.
