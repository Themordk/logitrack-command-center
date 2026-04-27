## Ajustes em Cadastros: Tipo de Estoque e Setor

Dois ajustes pequenos e independentes nas telas de cadastro administrativo.

---

### 1) Tipo de Estoque — vincular à Empresa do TopNav (e não ao Armazém)

**Comportamento atual**
- Hoje a página injeta manualmente `armazem_id` no save e o hook `useCrud` também trata `tipo_estoque` como tabela "de armazém", reinjetando `armazem_id`. Nenhum `empresa_id` é enviado, embora a coluna seja **NOT NULL** no banco — funciona hoje só porque o BD aceita o que vier ou porque há trigger; o ajuste corrige isso e alinha ao seletor do TopNav.

**Mudanças**

- `src/pages/TiposEstoquePage.tsx`
  - Remover a injeção de `armazem_id` no `handleSave`.
  - Passar `empresa_id` (do `useTenant`) no payload de criação e edição.
  - O componente continua usando `useCrud` normalmente (filtros de listagem permanecem como hoje).

- `src/hooks/useCrud.ts`
  - Mover `"tipo_estoque"` de `TABLES_WITH_ARMAZEM` para `TABLES_WITH_EMPRESA`.
  - Efeitos: a listagem passa a ser filtrada por `empresa_id` (acompanha o seletor do TopNav, com refetch via `empresaVersion`) e o create injeta `empresa_id` automaticamente, sem `armazem_id`.

**Coluna `armazem_id` em `tipo_estoque`**: é nullable no banco — registros novos ficarão sem armazém atrelado, conforme solicitado. Registros antigos não são tocados.

---

### 2) Setor — adicionar dropdown de Armazém no formulário

**Comportamento atual**
- O formulário não pede armazém; o `useCrud` injeta o `armazem_id` ativo do contexto. Isso impede cadastrar setor em outro armazém da mesma empresa sem trocar o contexto.

**Mudanças**

- `src/pages/SetoresPage.tsx`
  - Carregar opções de armazém via `fetchOptions("armazem", tenantId, "descricao", { empresa_id })`, no padrão já usado em `UsuariosPage.tsx`.
  - Adicionar um campo `armazem_id` do tipo `select` (obrigatório) na lista `fields`, posicionado antes de `descricao`.
  - No `handleSave`, enviar o `armazem_id` informado no formulário (substituindo o uso do `armazem_id` do contexto). O `useCrud` só injeta o do contexto quando o payload vem vazio, então enviar o valor escolhido tem precedência natural.
  - Recarregar opções quando `empresaId` mudar (TopNav).

**Sem mudanças no banco**: `setor.armazem_id` já é NOT NULL e continuará sendo preenchido — apenas a origem do valor muda (form em vez de contexto).

---

### Detalhes técnicos

**`useCrud` — antes**
```ts
const TABLES_WITH_ARMAZEM = new Set([
  "tipo_estoque", "setor", "endereco", "box", ...
]);
```
**depois**
```ts
const TABLES_WITH_EMPRESA = new Set([..., "tipo_estoque"]);
const TABLES_WITH_ARMAZEM = new Set([
  "setor", "endereco", "box", ... // sem tipo_estoque
]);
```

**`SetoresPage` — esboço**
```ts
const [armazens, setArmazens] = useState<{value:string;label:string}[]>([]);
useEffect(() => {
  if (tenantId && empresaId) {
    fetchOptions("armazem", tenantId, "descricao", { empresa_id: empresaId })
      .then(setArmazens);
  }
}, [tenantId, empresaId]);

const fields: FieldSpec[] = [
  { name: "armazem_id", label: "Armazém", type: "select", required: true,
    options: armazens, placeholder: "Selecione o armazém..." },
  { name: "descricao", label: "Descrição", type: "text", required: true, ... },
  { name: "tipo", label: "Tipo", type: "enum", enumValues: [...] },
  { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
];

const handleSave = async (data: Record<string, any>) => {
  // armazem_id já vem do form; useCrud não sobrescreve quando há valor
  if (editItem) return crud.update(editItem.id, data);
  return crud.create(data);
};
```

---

### Arquivos editados

- `src/hooks/useCrud.ts`
- `src/pages/TiposEstoquePage.tsx`
- `src/pages/SetoresPage.tsx`

Sem migração de banco.
