# Adequação de Fator de Caixa e Embalagem (UN x CX)

Objetivo: tornar fator de caixa e embalagem visíveis e à prova de erro nas telas de scan do coletor, e habilitar visualização em caixa no relatório e filtros extras no cadastro de produtos.

## Verificações feitas antes do plano

- `produto` já possui `updated_at`, `updated_by`, `referencia`, `lastro`, `camada`, `fator_caixa`.
- A RPC `fn_produto_atualizar_dados_operacionais(uuid,int,int,int,uuid)` já existe no banco.
- `fn_inventario_contagem_livre` **já multiplica internamente** pelo fator da embalagem (`v_qtd_final := p_quantidade * COALESCE(fator,1)`). Portanto a conversão NÃO deve ser feita no frontend — o item 6c/7c do documento fica cancelado (evitaria dupla conversão).
- `useCrud` hoje suporta apenas `eq`, `gte`, `lte` nos filtros.
- Lista de produtos usa a view `vw_produto_listagem`, que expõe `sku`, `descricao` e `referencia`.
- `TenantContext` já expõe `usuarioId`.

## Onda A — baixo risco

1. **`useCrud`**: suportar operador `ilike` nos dois blocos de filtros (listagem e `fetchAllIds`).
2. **Produtos (`/dados-mestres/produtos`)**: três campos de filtro (SKU, Descrição, Referência) em `extraFilters`, combinados por AND com o filtro "sem código de barras" e com a busca global; botão "Limpar filtros" quando houver algum preenchido.
3. **Relatório de Estoque**: expor `fator_caixa` no service e adicionar switch "Visualizar em Caixa" que renderiza Disponível/Bloqueado/Total como `X CX + Y UN`; produtos sem fator (nulo ou 1) continuam em UN. Exportações Excel/PDF respeitam o modo.
4. **Rastreabilidade no admin**: ao salvar produto pelo modal, gravar `updated_at`/`updated_by`. Embalagens e picking ficam inalterados (não possuem essas colunas).

## Onda B — coletor, consulta e inventário livre

5. **`/coletor/consulta/produto`**:
   - buscar `fator_caixa` do produto e o tipo de estoque do endereço no join;
   - saldo por endereço exibindo `N UN` em destaque e `= X CX + Y UN` abaixo (só quando fator > 1), inclusive no total de cada seção;
   - badge com a descrição do tipo de estoque ao lado do endereço;
   - botão "Ver detalhes do produto" como `ActionButton` full-width abaixo do card (card deixa de ser clicável).
6. **`/coletor/inventario/livre/produto`**:
   - card de Embalagem sempre visível após o scan (remover a condição `fator > 1`), com destaque quando for unidade;
   - rótulo dinâmico do input: "Quantidade em CX/UN";
   - preview de conversão `= qtd × fator UN` abaixo do input quando fator > 1;
   - **envio ao RPC permanece com a quantidade escaneada** (o backend converte), com comentário no código registrando essa regra.

## Onda C — detalhe do produto no coletor

7. **Aba INFO reorganizada em 4 blocos**: (1) descrição/SKU/imagem, (2) informações gerais somente leitura, (3) campos editáveis Lastro, Camada e Fator Caixa, (4) botão Salvar. Salvamento via `fn_produto_atualizar_dados_operacionais`, com toast de sucesso/erro e recarga dos dados. `tipo_controle` permanece somente leitura.
8. **Aba EMBALAGENS**: novo `src/lib/embalagens.ts` com a lista padrão (UN, CX, FD, GL, PC, PT, DZ, MT, LT, KG, SC, PL, BD, TB) e troca do input livre por um select; valores legados fora da lista aparecem como opção adicional para não se perderem.

## Notas técnicas

- Sem migrações novas: tudo já existe no banco.
- Chamada da RPC nova usa `as any` até a regeneração dos types (padrão do projeto).
- Padrões mantidos: hash routing, `useCrud`, `ColetorLayout`, `ActionButton`, `ScanField`, Sonner, Lucide, tokens de cor do design system.
- Nenhuma dependência nova; nenhum componente novo em `components/ui/`.
