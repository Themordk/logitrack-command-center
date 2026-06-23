## Filtro: "Apenas produtos com mais de uma localização"

Adicionar um checkbox no painel de filtros do relatório **Posição de Estoque** (`/relatorios/estoque`) que restringe o resultado a produtos (SKUs) que aparecem em **2 ou mais endereços distintos com estoque > 0**, combinando com os demais filtros já existentes.

### Comportamento
- Checkbox rotulado **"Apenas produtos com mais de uma localização"** posicionado no grid de filtros (próximo a SKU/EAN).
- Quando marcado:
  1. O backend (`fetchEstoqueReport`) busca normalmente aplicando todos os outros filtros.
  2. Sobre o resultado, agrupa por `sku`, contando endereços distintos (`codigo_endereco` ou `endereco_descricao`) onde `quantidade_total > 0`.
  3. Mantém na lista apenas linhas cujo SKU tenha **≥ 2 endereços distintos com saldo**.
- Quando desmarcado: comportamento atual inalterado.
- Filtro combina com Armazém, Tipo Endereço, Tipo Estoque, Setor, Grupo, Subgrupo, Marca, SKU, EAN, Código do Endereço (a contagem é feita sobre o conjunto já filtrado).
- Aparece como filtro ativo no `ReportHeader` (chip "Multi-localização: Sim") e nos exports PDF.
- `handleClear` desmarca o checkbox.

### Detalhes técnicos
- **`src/modules/reports/estoque/estoque.service.ts`**: adicionar `apenas_multi_localizacao?: boolean` em `EstoqueFilter`. Após montar `results`, se a flag estiver ativa, calcular `Map<sku, Set<endereco_key>>` considerando apenas linhas com `quantidade_total > 0`, e filtrar `results` por SKUs cujo set tenha `size >= 2`. Chave do endereço: `codigo_endereco ?? endereco_descricao`.
- **`src/modules/reports/estoque/EstoqueReportPage.tsx`**:
  - Novo state `filterMultiLocalizacao: boolean`.
  - Novo célula no grid de filtros usando `<Checkbox>` (`@/components/ui/checkbox`) + `<Label>`.
  - Passar `apenas_multi_localizacao: filterMultiLocalizacao || undefined` em `handleGenerate`.
  - Resetar em `handleClear` e no `useEffect` de troca de empresa.
  - Adicionar em `activeFilters` quando true.
