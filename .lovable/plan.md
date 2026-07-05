## Objetivo
Incluir os novos campos booleanos `gera_mov_automatico` e `libera_mov_automatico` — presentes nas tabelas `tipo_entrada` e `tipo_saida` — nas telas de listagem e cadastro/edição localizadas em **Dados Mestres > Tipos de Entrada** e **Dados Mestres > Tipos de Saída**.

## Escopo
1. **TiposEntradaPage.tsx**
   - Adicionar colunas na tabela: `gera_mov_automatico` e `libera_mov_automatico` (tipo `badge`, como os demais booleanos da página).
   - Adicionar campos no modal de cadastro/edição: dois switches com `defaultValue: false`.

2. **TiposSaidaPage.tsx**
   - Adicionar colunas na tabela: `gera_mov_automatico` e `libera_mov_automatico`. Serão renderizados com o mesmo padrão visual dos demais booleanos da página (badge customizado Sim/Não).
   - Adicionar campos no modal de cadastro/edição: dois switches com `defaultValue: false`.

## Fora do escopo
- Nenhuma alteração em regras de negócio, backend, validações extras ou outras telas.
- Não serão criados relacionamentos de dependência entre os novos switches e os existentes.

## Arquivos afetados
- `src/pages/TiposEntradaPage.tsx`
- `src/pages/TiposSaidaPage.tsx`

## Implementação
- Ajustar arrays `columns` e `fields` em ambas as páginas.
- Manter o padrão visual e de interação já estabelecido em cada tela (badge para entrada; custom badge para saída).
- Os campos são `boolean NOT NULL`, portanto o modal receberá `defaultValue: false`.