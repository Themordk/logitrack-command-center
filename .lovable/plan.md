## Diagnóstico

Após inspecionar `useCrud.ts`, as páginas envolvidas e o schema do banco, identifiquei a causa raiz comum: **o hook `useCrud` força o filtro `armazem_id = <contexto>` em todas as tabelas listadas em `TABLES_WITH_ARMAZEM`**, e injeta esse mesmo valor automaticamente em `INSERT`s. Isso quebra os fluxos abaixo quando:
- o usuário não tem armazém ativo no contexto (gera erro 23502 / lista vazia);
- registros antigos foram cadastrados com `armazem_id` diferente/`NULL` (não aparecem na lista, ex.: `motivo_ocorrencia` que é nullable);
- o cadastro precisa permitir escolher o armazém manualmente (turnos, zonas).

## Correções por item

### 1. Lista de Endereços vazia (Armazém → Localizações)
- **Causa:** `useCrud` filtra por `armazem_id = contexto`. Se o usuário trocou de empresa/armazém ou tem endereços vinculados a outro armazém, eles somem. Também trava se o contexto não tem armazém.
- **Correção:** Adicionar **filtro de Armazém na toolbar da página** (dropdown no topo), default = armazém do contexto, mas permitindo trocar/limpar. Passar esse valor como `filters: { armazem_id }` para `useCrud` e **remover `endereco` do auto-filtro de `TABLES_WITH_ARMAZEM`** (passa a ser controlado pela tela). Manter validação de obrigatoriedade no form.

### 2. Box → Dropdown "Tipo de Box" vazio
- **Causa:** `BoxPage` chama `fetchOptions("tipo_box", ..., { armazem_id: armazemId })` somente quando há armazém selecionado. Sem armazém ativo, o dropdown fica vazio. Além disso, se os tipos foram cadastrados em outro armazém, não aparecem.
- **Correção:** Buscar `tipo_box` por **tenant** (sem filtro de armazém) — `tipo_box` é cadastro genérico do tenant. Remover o filtro `{ armazem_id }` da chamada `fetchOptions`. Mesmo tratamento aplicado à coluna de exibição.

### 3. Turnos → erro 23502 ao criar
- **Causa:** `turnos.armazem_id` é `NOT NULL`. O form não tem campo de armazém; depende do contexto. Sem armazém no contexto → INSERT falha.
- **Correção:**
  - Adicionar campo **Armazém** (dropdown obrigatório) no `CrudModal` da `TurnosPage`, populado por `fetchOptions("armazem", tenantId, "descricao", { empresa_id })` — mesmo padrão de `SetoresPage`.
  - Default = `armazemId` do contexto quando existir.
  - Em `handleSave`, deixar o `armazem_id` vir do form (não sobrescrever pelo contexto).
  - Adicionar coluna "Armazém" na lista (resolvido via `armazemOptions`).

### 4. Motivos de ocorrência → lista vazia
- **Causa:** `motivo_ocorrencia.armazem_id` é **nullable**, mas a tabela está em `TABLES_WITH_ARMAZEM` — `useCrud` aplica `.eq('armazem_id', contexto)`, escondendo registros com `armazem_id IS NULL` ou de outro armazém.
- **Correção:** Remover `motivo_ocorrencia` de `TABLES_WITH_ARMAZEM` no `useCrud.ts` (cadastro genérico do tenant, escopo por tenant_id já isola). Manter campo opcional de armazém no form (pode adicionar depois se desejado). Lista voltará a exibir todos os motivos do tenant.

### 5. Zonas de atividade → criar com armazém + revisar lista
- **5.1 Criação:**
  - `zona_atividade.armazem_id` é `NOT NULL`. Hoje o form não tem campo; depende do contexto. Sem armazém ativo → erro.
  - Adicionar campo **Armazém** (dropdown obrigatório) no `CrudModal` da `ZonasAtividadePage`, populado por `fetchOptions("armazem", tenantId, "descricao", { empresa_id })`.
  - Default = `armazemId` do contexto.
  - Em `handleSave`, usar `armazem_id` vindo do form.
  - Corrigir o nome da coluna `Ativo` (com A maiúsculo no schema) — manter consistência usando `"Ativo"` no FieldSpec/columns como já está, mas validar.
- **5.2 Lista:**
  - `useCrud` filtra por `armazem_id = contexto`. Se contexto sem armazém → lista vazia. Se zonas estão em outros armazéns → não aparecem.
  - Adicionar **filtro de Armazém na toolbar** da `ZonasAtividadePage` (mesmo padrão do item 1), passar como `filters: { armazem_id }` ao `useCrud`, e remover `zona_atividade` de `TABLES_WITH_ARMAZEM`.

## Resumo de mudanças no `useCrud.ts`
Reduzir `TABLES_WITH_ARMAZEM` para apenas tabelas onde o filtro automático realmente deve ocorrer:
```ts
// Antes: endereco, box, turnos, motivo_ocorrencia, zona_atividade, tipo_box, picking_produto
// Depois: box, picking_produto
// (endereco/zona_atividade passam a ter filtro controlado pela tela;
//  turnos/motivo_ocorrencia/tipo_box são cadastros do tenant — escopo só por tenant_id;
//  o INSERT continua exigindo armazem_id quando o schema é NOT NULL — vindo do form.)
```
Manter o `create` injetando `armazem_id` do contexto **somente** quando o payload não traz; não vamos mais bloquear o `fetchData` se não houver armazém para essas tabelas.

## Arquivos a editar
- `src/hooks/useCrud.ts` — reduzir `TABLES_WITH_ARMAZEM`.
- `src/pages/EnderecosPage.tsx` — toolbar com filtro de armazém + `filters` no `useCrud`.
- `src/pages/BoxPage.tsx` — `fetchOptions("tipo_box")` sem filtro de armazém.
- `src/pages/TurnosPage.tsx` — campo Armazém no form + coluna na lista + carregar `armazemOptions`.
- `src/pages/MotivosOcorrenciaPage.tsx` — sem mudança no form (lista volta automática após ajuste no hook). Opcional: adicionar campo Armazém opcional.
- `src/pages/ZonasAtividadePage.tsx` — campo Armazém no form + toolbar com filtro de armazém + `filters` no `useCrud`.

## Validação
Após a alteração, testar com usuário **sem armazém ativo no contexto** e com usuário trocando entre empresas/armazéns; confirmar que listas exibem registros e cadastros funcionam sem erro 23502/22P02.