## Adicionar campo "Peso Bruto" ao cadastro de produto

Incluir o novo campo `peso_bruto` (já existente em `public.produto`) no formulário de cadastro/edição em `/dados-mestres/produtos`.

### Alterações em `src/pages/ProdutosPage.tsx`

1. **Default do form (linha ~96)**: adicionar `peso_bruto: ""` ao objeto inicial.
2. **Seção 2 — Controle de Estoque (linhas ~331-344)**: adicionar um novo input numérico "Peso Bruto (kg)" ao lado de "Tolerância", mantendo o grid de 3 colunas.
   ```tsx
   <div>
     <label className={labelClass}>Peso Bruto (kg)</label>
     <input type="number" step="0.001" value={form.peso_bruto ?? ""}
            onChange={(e) => set("peso_bruto", e.target.value)}
            className={inputClass} />
   </div>
   ```
3. **Conversão numérica no save (linha ~167)**: incluir `"peso_bruto"` na lista de campos convertidos via `Number()`.

### Fora de escopo
- Listagem/tabela de produtos (sem nova coluna, salvo se solicitado).
- `produto_embalagem.peso_bruto` (já existente, não alterado).
- Validação obrigatória (campo opcional).