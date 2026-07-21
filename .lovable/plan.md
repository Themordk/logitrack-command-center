## Objetivo

Padronizar todas as telas de cadastro/edição dos menus **Armazém**, **Dados Mestres** e a tela **Gerar HU** (Atividades) para abrirem em um **painel lateral (Sheet)** — mesmo padrão visual usado em "Configurações do Roteiro de Separação" e "Gerenciar Endereços" da Zona de Atividade — em vez do modal centralizado atual.

Todos os campos, validações, comportamentos condicionais (`visibleWhen`, `requiredWhen`, `disabledWhen`) e lógica de salvamento permanecem exatamente iguais. A mudança é **apenas de apresentação/layout**.

## Escopo — telas afetadas

**Via refatoração do `CrudModal` (17 telas em um único ajuste):**
- Armazém: Armazéns, Endereços, Setores, Zonas de Atividade, Rotas, Box, Tipos de Estoque
- Dados Mestres: Empresas, Produtos (embalagem/picking sub-modais), Grupos, Subgrupos, Parceiros, Veículos, Turnos, Usuários, Motivos de Ocorrência, SLA de Ocorrência

**Via refatoração pontual (modais próprios que não usam `CrudModal`):**
- `src/pages/HUsPage.tsx` — modal "Gerar HU / Editar HU"
- `src/pages/ProdutosPage.tsx` — modal principal do Produto + sub-modais de Embalagem e Picking
- `src/pages/TiposEntradaPage.tsx` — modal seccionado
- `src/pages/TiposSaidaPage.tsx` — modal seccionado

## Abordagem técnica

### 1. Refatorar `src/components/crud/CrudModal.tsx`
Trocar `Dialog/DialogContent/DialogHeader/DialogFooter` por `Sheet/SheetContent/SheetHeader/SheetFooter` (`@/components/ui/sheet`), com:
- `side="right"`, largura `w-full sm:max-w-2xl`, altura total.
- Header sticky no topo com título.
- Área de campos com scroll (`flex-1 overflow-y-auto px-6 py-4`), preservando o grid 1/2 colunas atual.
- Footer sticky no rodapé com botões "Cancelar" e "Salvar" (mesmo estilo atual).
- API pública (`CrudModalProps`, `FieldSpec`) **inalterada** — nenhuma das 17 páginas consumidoras precisa mudar.

### 2. Refatorar modais próprios para o mesmo padrão Sheet
Em `HUsPage.tsx`, `ProdutosPage.tsx`, `TiposEntradaPage.tsx` e `TiposSaidaPage.tsx`:
- Substituir `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter` por `Sheet`/`SheetContent`/`SheetHeader`/`SheetFooter`.
- Manter o mesmo layout interno (seções, grid, subformulários).
- Em `ProdutosPage`, os sub-modais de Embalagem e Picking (modais dentro do modal) também passam a ser Sheets laterais empilhados (segundo nível continua abrindo lateral por cima).
- Largura padrão: `sm:max-w-2xl`; para Produtos usar `sm:max-w-4xl` (equivalente ao `max-w-4xl` atual) devido à densidade.

### 3. O que **não** muda
- `DeleteConfirmDialog`, modais de impressão de etiqueta, modais de importação ERP, modal de registrar ocorrência, `ArmazemConfigModal` (que já é configurações e pode virar Sheet numa fase futura se desejado), modais de operação (Liberar Armazenagem, Reatribuir Tarefas, etc.).
- Nenhum comportamento de negócio, RPC, validação ou dado gravado.

## Detalhes técnicos

- Componente base já disponível: `@/components/ui/sheet` (já usado por `ZonaEnderecosSheet` e pelo Roteiro de Separação).
- Estrutura do `SheetContent`:
  ```tsx
  <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
    <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
      <SheetTitle>{title}</SheetTitle>
    </SheetHeader>
    <div className="flex-1 overflow-y-auto px-6 py-4">{/* campos */}</div>
    <SheetFooter className="px-6 py-4 border-t border-border shrink-0">
      {/* Cancelar / Salvar */}
    </SheetFooter>
  </SheetContent>
  ```
- Fechamento por overlay/ESC preservado via `onOpenChange`.
- Tratamento de erros (`parseError` + `toast.error`) mantido inalterado.

## Verificação

- Typecheck limpo após as alterações.
- Abrir 3–4 telas amostrais (Armazéns, Zonas de Atividade, Produtos, HUs) e confirmar que o painel lateral abre, valida, salva e fecha corretamente, incluindo campos condicionais.
