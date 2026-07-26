## Correção da Etiqueta HU — Preview de Template e Tamanho Padrão

### Arquivo único: `src/pages/EtiquetaTemplatesPage.tsx`

**1. Mock enriquecido no preview HU (função `renderPreview`, ~linha 731)**
Substituir o mock mínimo por um objeto completo com todos os campos operacionais, para que a preview lateral na tela de configuração reflita como a etiqueta ficará impressa:
- `peso_bruto: 45.5`, `numero_movimento: "131"`, `data_entrada: "21/07/2026"`
- `parceiro_nome: "FORNECEDOR EXEMPLO LTDA"`, `numero_nota: "250"`
- `lote_principal: "L2026-A"`, `validade_proxima: "15/12/2026"`
- `total_itens: 3`, `total_quantidade: 150`, `tamanho: "M"`

**2. Tamanho padrão 100×70 para novos templates HU (função `handleCreateNew`, ~linha 203)**
Detectar `tipo === "HU"` e usar:
- `tamanho: "100x70"`, `altura_mm: 70` para HU
- Mantém `100x40` / `altura_mm: 40` para os demais tipos (Endereço, Produto, Volume)

### Fora do escopo
- Nenhum outro arquivo alterado
- Sem mudanças em RPCs, `components/ui/`, ou `EtiquetaHUPreview.tsx`
- Imports existentes preservados
