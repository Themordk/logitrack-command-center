## Escopo

Duas melhorias independentes:

### 1. Campo `realiza_conferencia` em Tipos de Entrada

**Arquivo:** `src/pages/TiposEntradaPage.tsx`

- Adicionar coluna `realiza_conferencia` (type: `badge`) na lista, entre "Código ERP" e "Status", com label "Realiza Conferência".
- Adicionar campo no formulário do modal (`FieldSpec`, type: `switch`, `defaultValue: true`) logo abaixo de "Código ERP".

Nenhuma migração necessária — o campo já existe na tabela.

### 2. Relatório de Itens sem Endereço de Picking (Movimentos de Entrada)

**Objetivo:** Botão na tela `MovimentoEntradaPage` que abre um relatório imprimível com todos os itens de entradas em aberto cujo produto não possui `picking_produto` cadastrado, para a equipe de conferência providenciar a definição.

**Campos do relatório:**
- SKU
- Referência
- Descrição
- Número do Movimento
- Data de Criação (created_at do movimento)

**Consulta (via service):**
- Buscar `movimento_entrada_item` do tenant/empresa/armazém corrente cujo `movimento_entrada.status` ainda esteja em aberto (não `ARMAZENADO`/`CANCELADO`).
- Filtrar produtos que NÃO tenham registro em `picking_produto` para o mesmo `empresa_id`/`armazem_id`.
- Retornar SKU, referência, descrição do produto, `numero_movimento` e `created_at` do movimento.

**Estrutura de arquivos (segue framework de relatórios existente):**
```text
src/modules/reports/picking-nao-cadastrado/
  ├── pickingNaoCadastrado.service.ts   (query + tipos)
  └── PickingNaoCadastradoReportPage.tsx (Header + Toolbar + Table, com onExportPdf/Excel/Print)
```

**Integração na `MovimentoEntradaPage`:**
- Adicionar botão "Itens sem Picking" na toolbar (ao lado dos existentes) que navega para a rota do novo relatório.
- Registrar a rota em `src/App.tsx` (ou onde estão as rotas de relatório) seguindo o mesmo padrão dos relatórios atuais (`/relatorios/...`).

**Padrões visuais e de export:** reutilizar `ReportHeader`, `ReportTable` e `src/modules/reports/utils/exporters.ts` — mesmo estilo SAP denso já usado nos demais relatórios (fonte 9px, landscape A4, header com botões PDF/Excel/Imprimir).

## Fora de escopo

- Nenhuma alteração no fluxo de conferência a partir do novo flag `realiza_conferencia` (apenas cadastro/exibição).
- Nenhuma alteração de RPC/schema de banco.
