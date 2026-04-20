

## Plano: Cadastro em Lote de Endereços

### Visão geral
Nova tela acessível a partir de **Armazém → Localizações/Endereços**, com botão secundário "Cadastro em Lote" no header da listagem. A tela permite gerar combinatoriamente múltiplos endereços (Rua × Prédio × Nível × Apto) com regras de paridade no Prédio, validação prévia, prevenção de duplicidade e inserção em lote no Supabase.

### Fluxo do usuário

```text
┌──────────────────────────────────────────────────────┐
│ Endereços (lista)                                    │
│   [+ Novo Endereço]  [⚡ Cadastro em Lote]            │
└──────────────────────────────────────────────────────┘
                        ↓ clica
┌──────────────────────────────────────────────────────┐
│ Cadastro em Lote                                     │
│   Configurações comuns (Armazém, Setor, Tipo, ...)   │
│   Intervalos (Rua/Prédio/Nível/Apto Inicial→Final)   │
│   Lado: PAR / IMPAR / TODOS                          │
│   ┌────────────────────────────────────────────┐     │
│   │ Resumo: "Serão criados 128 endereços"      │     │
│   │ [Pré-visualizar] (mostra 50 primeiros)     │     │
│   └────────────────────────────────────────────┘     │
│   [Cancelar]            [Gerar Endereços]            │
└──────────────────────────────────────────────────────┘
                        ↓ confirma
              valida → checa duplicados → insert
                        ↓
              "X endereços criados com sucesso"
                        ↓
                volta para a lista
```

### Estrutura da tela (UX)

Layout consistente com o padrão administrativo (h-screen, `card-surface`, dark mode), em duas colunas (md:grid-cols-2). Seções:

1. **Configurações comuns** — aplicadas a todos os endereços gerados
   - Armazém * (select)
   - Setor * (select)
   - Tipo de Estoque * (select)
   - Tipo Endereço * (PULMAO / PICKING)
   - Tipo Estrutura (enum)
   - Situação * (LIVRE / OCUPADO / BLOQUEADO) — default LIVRE
   - Curva de Acesso (A/B/C/D)
   - Total Pallets (visível apenas se PULMAO)
   - Altura, Largura, Comprimento, M³, Peso Máx
   - Ativo (switch, default ON)

2. **Intervalos** — cada par lado-a-lado em uma linha
   - Rua: [Inicial] até [Final]
   - Prédio: [Inicial] até [Final]
   - Nível: [Inicial] até [Final]
   - Apto: [Inicial] até [Final]
   - Lado * (PAR / IMPAR / TODOS) — aplicado sobre o **Prédio**

3. **Resumo dinâmico** (atualiza em tempo real)
   - "Serão criados **N** endereços"
   - Botão `[Pré-visualizar]` abre tabela com até 50 linhas: `Endereço | Tipo | Situação`

4. **Ações**
   - Cancelar (volta para lista)
   - Gerar Endereços (com loading e disabled durante operação)

### Regras de geração

- **Combinação total**: produto cartesiano `Ruas × Prédios(filtrados por Lado) × Níveis × Aptos`
- **Filtro Lado** (aplicado no Prédio):
  - `PAR` → mantém apenas pares
  - `IMPAR` → mantém apenas ímpares
  - `TODOS` → mantém todos (gravado como `PAR` no banco por padrão; ver Observações)
- **Formato descrição**: `R{rr}-P{pp}-N{nn}-A{aa}` (zero-pad 2 dígitos), reusando `buildDescricao`.
- **Validações antes de gerar**:
  - Inicial ≤ Final em todos os 4 intervalos
  - Todos os campos obrigatórios preenchidos
  - Limite de segurança: máximo **5.000 endereços** por lote (proteção UX/DB)
- **Prevenção de duplicidade**:
  - Antes do insert, consulta `endereco` filtrando por `tenant_id + armazem_id + (rua, predio, nivel, apto) IN (...)`
  - Remove do payload os já existentes
  - Exibe contagem: "X criados, Y já existiam (ignorados)"
- **Performance**:
  - Geração das combinações em memória com `useMemo` (instantâneo até 5k)
  - Insert em chunks de 500 registros via `supabase.from('endereco').insert([...])`
  - Loading bloqueante com contador de progresso durante chunks

### Detalhes técnicos

**Arquivos novos**
- `src/pages/EnderecosBatchPage.tsx` — nova página (componente único, autocontido)

**Arquivos modificados**
- `src/pages/EnderecosPage.tsx` — adicionar botão "Cadastro em Lote" no `headerActions` (ícone `Layers` ou `Copy`), chamando `onNavigate("/armazem/enderecos/lote")`
- `src/App.tsx`:
  - Adicionar `import { EnderecosBatchPage }`
  - Adicionar rota `case "/armazem/enderecos/lote": return <EnderecosBatchPage onNavigate={onNavigate} />`
  - Adicionar breadcrumb `"/armazem/enderecos/lote": [..., { label: "Endereços", path: "/armazem/enderecos" }, { label: "Cadastro em Lote" }]`

**Tipo do payload por endereço** (consistente com schema atual de `endereco`):
```ts
{
  tenant_id, armazem_id, setor_id, tipo_estoque_id,
  rua, predio, nivel, apto,
  descricao, lado: 'PAR' | 'IMPAR',
  tipo_endereco, tipo_estrutura?, situacao,
  curva_acesso?, total_pallet?,
  altura?, largura?, comprimento?, m3?, peso_total?,
  ativo: true
}
```

**Algoritmo (pseudocódigo)**
```ts
const ruas = range(ruaIni, ruaFim);
const niveis = range(nivelIni, nivelFim);
const aptos = range(aptoIni, aptoFim);
const prediosBase = range(predioIni, predioFim);
const predios = lado === 'TODOS' ? prediosBase
              : lado === 'PAR'   ? prediosBase.filter(n => n % 2 === 0)
              : prediosBase.filter(n => n % 2 !== 0);

const combos = [];
for (r of ruas) for (p of predios) for (n of niveis) for (a of aptos)
  combos.push({ rua:r, predio:p, nivel:n, apto:a,
                descricao: buildDescricao(r,p,n,a),
                lado: (p % 2 === 0 ? 'PAR' : 'IMPAR'),
                ...common });
```

**Reuso**: `fetchOptions("armazem"|"setor"|"tipo_estoque", tenantId)` do `useCrud.ts`, e `buildDescricao` (mover para util compartilhado ou duplicar localmente).

### Observações importantes
- **Campo `lado` no banco** é enum `PAR | IMPAR` (não aceita `TODOS`). Quando o usuário escolhe `TODOS`, o `lado` de cada registro é derivado da paridade do `predio` individual — preservando integridade do schema sem migration.
- **Sem alteração de schema**: nenhum migration necessário; todos os campos já existem na tabela `endereco`.
- **RLS**: o insert respeita `tenant_full_access` automaticamente (todos os registros recebem `tenant_id` do contexto).
- **Erro de chunk**: se um chunk falhar, aborta o restante e mostra contagem do que foi salvo + mensagem de erro.

### Resumo dos arquivos
| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/pages/EnderecosBatchPage.tsx` | novo | Tela completa de cadastro em lote |
| `src/pages/EnderecosPage.tsx` | alterado | Botão "Cadastro em Lote" no header |
| `src/App.tsx` | alterado | Rota + breadcrumb |

