
# Fase 2 — Componentes de Registro de Ocorrência Operacional

Objetivo: criar componentes reutilizáveis para registrar ocorrências operacionais em qualquer tela (web e coletor) e atualizar as telas relacionadas para consumir o novo modelo (categoria, endereço, causador, lote, validade e status `EM_TRATAMENTO`). O backend (tabela, enums e RPC `registrar_ocorrencia_operacional`) já está pronto e não será alterado.

## Arquivos a criar

1. **`src/components/ocorrencia/RegistrarOcorrenciaModal.tsx`**
   - Dialog reutilizável que recebe `contexto: OcorrenciaContexto` via props.
   - Cabeçalho com título e etapa; card informativo com produto/endereço/causador quando fornecidos.
   - Campos: Tipo, Motivo (query em `motivo_ocorrencia` filtrada por tenant, etapa, empresa e ativo), Categoria (auto-preenche por `categoria_padrao`), Prioridade (auto-preenche por `prioridade_padrao`), Quantidades esperada/real (com divergência calculada), Lote, Validade, Observação.
   - Se `contexto.etapa` não vier definida (uso via botão "Nova ocorrência"), exibir select de etapa dentro do modal.
   - Submit chama `supabase.rpc('registrar_ocorrencia_operacional', {...})` com todos os parâmetros descritos, tratando retorno como objeto ou JSON string; `toast` de sucesso/erro; chama `onSuccess`.

2. **`src/components/ocorrencia/RegistrarOcorrenciaButton.tsx`**
   - Botão web nas variantes `icon` (tooltip) e `full` (ícone + texto amber).
   - Controla `open` internamente e delega para o modal.

3. **`src/components/ocorrencia/RegistrarOcorrenciaColetorButton.tsx`**
   - Usa `ActionButton variant="warning"`.
   - Abre bottom sheet fullscreen com estilo do coletor (mesmo padrão visual do `SeparacaoOcorrenciasPage.tsx`), motivos listados como cards selecionáveis, inputs em dark, botões `ActionButton`.
   - Consome a mesma RPC.

## Arquivos a modificar

4. **`src/pages/OcorrenciasOperacionaisPage.tsx`**
   - Adicionar KPI "Em tratamento" (roxo) contando `EM_TRATAMENTO`.
   - Filtro select de Categoria (Preventiva/Corretiva).
   - Colunas novas na tabela: Categoria (badge) e Endereço (font-mono via join).
   - Query com join `endereco:endereco_id(descricao)`.
   - Botão "Nova ocorrência" no header (variante `full`) abrindo o modal com select de etapa.
   - `onSuccess` chama `refresh()`.

5. **`src/pages/OcorrenciaDetalhePage.tsx`**
   - Query com joins: `endereco`, `usuario_causador`.
   - InfoItems condicionais: Endereço, Tarefa, Causador, Lote, Validade, Categoria.
   - Suporte a status `EM_TRATAMENTO` em `STATUS_BADGE/LABEL/DOT` e no select do modal "Registrar histórico".
   - Ação "Iniciar tratamento" quando status = `EM_INVESTIGACAO`; manter "Resolver"/"Cancelar" em `EM_TRATAMENTO`.

6. **`src/pages/MotivosOcorrenciaPage.tsx`**
   - Colunas: `acao_automatica`, `prioridade_padrao`, `categoria_padrao` com labels amigáveis.
   - Campos no modal CRUD para esses três novos atributos (enum selects).
   - Ampliar `etapa_ocorrencia` para incluir `INVENTARIO` e `AUDITORIA`.

## Restrições

- Nenhuma alteração em `App.tsx`, `SeparacaoOcorrenciasPage.tsx`, `LiberarErroTransporteModal.tsx`, componentes shadcn ou banco/edge functions.
- Sem novas dependências.
- Datas exibidas pela `@/utils/dateTime` (padrão do projeto).
- Escrita de timestamps não aplicável (RPC cuida).

## Detalhes técnicos

- Contexto tenant via `useTenant()` (`tenantId`, `empresaId`, `armazemId`, `usuarioId`).
- Classes de input/label padronizadas conforme prompt.
- Tratamento defensivo do retorno da RPC (JSON.parse quando string).
- Motivos filtrados no client: `empresa_id === null || empresa_id === empresaId`.
- Divergência exibida em vermelho quando > 0, verde quando 0.
