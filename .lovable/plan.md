
# Revisão de Multi-Empresa nas telas de Cadastro (Web)

## 1. Auditoria — situação atual de cada tela

| # | Tela | Tabela | Filtra lista por empresa ativa? | Cria registro vinculado à empresa ativa? | Status |
|---|------|--------|--------------------------------|------------------------------------------|--------|
| 1 | Empresas | `empresa` | N/A (é a própria base) | OK (apenas tenant) | ✅ |
| 2 | Armazéns | `armazem` | OK (whitelist) | ❌ Usa select manual de empresa no formulário | ⚠️ |
| 3 | Usuários | `usuario` | ❌ não usa empresa | ❌ Usa select manual de empresa | ⚠️ |
| 4 | Perfis de Acesso | `perfil` | OK (escopo tenant) | OK | ✅ |
| 5 | Integração | `integracao_config` | OK (depende de armazem) | OK | ✅ (já corrigido) |
| 6 | Tipos Estoque | `tipo_estoque` | OK (armazém) | OK (armazém vem do contexto) | ✅ |
| 7 | Setores | `setor` | OK (armazém) | OK | ✅ |
| 8 | Endereços | `endereco` | OK (armazém) | OK | ✅ |
| 9 | Endereços em Lote | `endereco` | ❌ select manual de armazém | ❌ usa select manual | ⚠️ |
| 10 | Box | `box` | OK | OK | ✅ |
| 11 | Turnos | `turnos` | OK | OK | ✅ |
| 12 | Motivos Ocorrência | `motivo_ocorrencia` | OK | OK | ✅ |
| 13 | Zonas de Atividade | `zona_atividade` | OK | OK | ✅ |
| 14 | Roteiro de Separação | `agrupamento_*`, `ordem_expedicao` | OK | OK | ✅ |
| 15 | **Produtos** | `produto` | OK (whitelist) | OK (injeta empresa_id) | ✅ |
| 16 | **Parceiros** | `parceiro` | ❌ não usa filtro de empresa | ❌ select manual de empresa | 🔴 |
| 17 | **Grupos de Produto** | `grupo_produto` | OK (whitelist) | ❌ select manual de empresa | ⚠️ |
| 18 | **Subgrupos de Produto** | `subgrupo_produto` | OK | OK (injeta) | ✅ |
| 19 | Tipos de Entrada | `tipo_entrada` | OK | OK | ✅ |
| 20 | Tipos de Saída | `tipo_saida` | ❌ falta filter no useCrud | OK | ⚠️ |
| 21 | Rotas | `rotas` | OK (whitelist) | ❌ usa select manual de armazém, não injeta empresa | ⚠️ |
| 22 | Veículos | `veiculos` | OK | OK | ✅ |
| 23 | HUs | `hu` | OK | OK | ✅ |
| 24 | Volumes Expedição | `volume_expedicao` | OK | N/A (somente leitura) | ✅ |
| 25 | Cadastro Doc Entrada | `documento_entrada` | N/A (página é cadastro) | OK (injeta empresa_id), mas selects de Parceiro/Tipo Entrada/Produto/Armazém **não filtram por empresa** | ⚠️ |
| 26 | Cadastro Doc Saída | `documento_saida` | N/A | Idem (selects sem filtro de empresa) | ⚠️ |
| 27 | Movimento Entrada (criar) | `movimento_entrada` | OK (lista) | OK (criação injeta empresa) | ✅ |
| 28 | Movimento Saída (criar) | `movimento_saida` | OK (lista) | OK | ✅ |
| 29 | Inventário (Novo) | `inventario` | OK | OK | ✅ |
| 30 | Abastecimento Geração | `abastecimento` (RPC) | OK (recebe empresaId) | OK | ✅ |

### Problemas identificados (resumo)

- 🔴 **Parceiros**: lista todos os parceiros do tenant — vaza dados entre empresas. Cadastro pede empresa via select.
- ⚠️ **Grupos de Produto / Armazéns**: lista já filtra (whitelist), mas o formulário ainda mostra select manual de empresa, redundante e suscetível a engano.
- ⚠️ **Usuários**: lista todos os usuários do tenant, sem filtrar pela empresa ativa do TopNav.
- ⚠️ **Tipos de Saída**: o `useCrud` não recebe `filters: { empresa_id }`, embora a tabela esteja na whitelist (já filtra automaticamente). Apenas falta consistência.
- ⚠️ **Rotas**: select manual de armazém no formulário; deveria assumir o armazém ativo do contexto e empresa ativa.
- ⚠️ **Endereços em Lote**: select manual de armazém + setor + tipo_estoque sem filtro pelo armazém ativo.
- ⚠️ **Cadastro Doc Entrada/Saída**: dropdowns de Parceiro, Tipo Entrada/Saída, Produto, Rota e Armazém não filtram por `empresa_id` ativo.

---

## 2. Plano de correção

### 2.1 Hook `useCrud.ts`
- Adicionar `parceiro` à `TABLES_WITH_EMPRESA` (já tem coluna `empresa_id` direta) — passa a filtrar e injetar automaticamente.
- Adicionar `usuario` à `TABLES_WITH_EMPRESA` para filtrar a lista de usuários pela empresa ativa (admin pode trocar de empresa para gerenciar).
- (Whitelist de `armazem` já existe — apenas trocar UI.)

### 2.2 Helper `fetchOptions`
- Estender assinatura para aceitar `empresaId` e `armazemId` opcionais e aplicar `.eq("empresa_id", x)` / `.eq("armazem_id", x)` quando informados, evitando ter que passar via `filters` em cada chamada.
- Manter retrocompat (parâmetros opcionais).

### 2.3 Telas a alterar

1. **`ParceirosPage.tsx`**
   - Remover campo `empresa_id` do formulário (vem do contexto via useCrud).
   - Remover busca de `empresaOptions`.
   - Filtrar `fetchOptions("rotas", tenantId, ...)` por `empresa_id` ativo.

2. **`GruposProdutoPage.tsx`**
   - Remover campo `empresa_id` do formulário (já está na whitelist do useCrud).
   - Remover `empresaOptions`.

3. **`ArmazensPage.tsx`**
   - **Decisão de produto**: armazém precisa de empresa explícita (admin pode criar armazéns para qualquer empresa). Manter o select de empresa, mas pré-selecionar a empresa ativa do TopNav e permitir trocar (apenas admin).
   - Para usuário não-admin (que vê só sua empresa), esconder o campo e injetar a empresa ativa.

4. **`UsuariosPage.tsx`**
   - Igual a Armazéns: admin precisa poder cadastrar usuários para outras empresas. Pré-selecionar a empresa ativa, mas manter o select. Filtrar a listagem pela empresa ativa.
   - Filtrar `fetchOptions("armazem", ...)` e `fetchOptions("turnos", ...)` pela empresa ativa.

5. **`RotasPage.tsx`**
   - Remover campo `armazem_id` do formulário; assumir `armazemId` ativo do contexto + injetar `empresa_id` ativo (`onSave`).
   - Adicionar `rotas` à `TABLES_WITH_ARMAZEM`? — **NÃO**, mantém só na empresa (tabela tem `armazem_id` e `empresa_id` direto). Injetar ambos no `onSave`.

6. **`TiposSaidaPage.tsx`**
   - Adicionar `filters: { empresa_id: empresaId }` no useCrud para consistência com `TiposEntradaPage`.
   - O `payload` já injeta empresa.

7. **`EnderecosBatchPage.tsx`**
   - Trocar select manual de armazém por `armazemId` do contexto (read-only/badge).
   - Filtrar selects de Setor e Tipo de Estoque por `armazem_id` ativo.
   - Resetar estado ao mudar `empresaVersion`.

8. **`CadastroDocEntradaPage.tsx`**
   - Adicionar `.eq("empresa_id", empresaId)` aos selects: `parceiro`, `tipo_entrada`, `produto`, `armazem`.
   - Recarregar opções quando `empresaVersion` mudar.

9. **`CadastroDocSaidaPage.tsx`**
   - Mesmo tratamento: filtrar `parceiro`, `tipo_saida`, `rotas`, `produto` por `empresa_id`.
   - Recarregar quando trocar empresa.

10. **`MotivosOcorrenciaPage.tsx`** (opcional)
    - Já está OK pelo armazém ativo. Sem mudança.

### 2.4 Backend (migration)
- **Estender `trg_validar_empresa_usuario`** para incluir `parceiro` e `usuario` (para garantia server-side caso a UI seja burlada).
- Atualizar memória `auth/empresa-switch-admin.md` com a lista atual de tabelas cobertas.

---

## 3. Componentes impactados

- `src/hooks/useCrud.ts` (whitelist + fetchOptions)
- `src/pages/ParceirosPage.tsx`
- `src/pages/GruposProdutoPage.tsx`
- `src/pages/ArmazensPage.tsx`
- `src/pages/UsuariosPage.tsx`
- `src/pages/RotasPage.tsx`
- `src/pages/TiposSaidaPage.tsx`
- `src/pages/EnderecosBatchPage.tsx`
- `src/pages/CadastroDocEntradaPage.tsx`
- `src/pages/CadastroDocSaidaPage.tsx`
- Migration SQL: estender `trg_validar_empresa_usuario` para `parceiro` e `usuario`.
- Memória: `mem://auth/empresa-switch-admin.md` (atualizar lista coberta).

---

## 4. Riscos e pontos de atenção

1. **Usuários e Armazéns são "objetos transversais"**: o admin precisa criar usuários/armazéns vinculados a empresas diferentes da que está ativa. Mantemos o select, mas pré-selecionado, em vez de remover.
2. **Parceiros**: hoje há histórico que pode estar com `empresa_id` antigo. Após o filtro automático, parceiros antigos da empresa “errada” deixarão de aparecer — comportamento desejado.
3. **Selects dependentes (Doc Entrada/Saída)**: ao trocar de empresa no meio do cadastro, o produto previamente selecionado pode sumir. Vamos resetar `selectedItems` quando `empresaVersion` mudar nessas duas páginas.
4. **Cadastro de Endereços em Lote**: mudança de `armazemId` no meio do preenchimento é destrutiva — manter o reset com `empresaVersion`.
5. **Trigger backend**: ao incluir `usuario` na validação, atenção para a edge function `create-usuario` (executa com service role e `auth.uid()` é nulo → trigger retorna `NEW` sem validar, OK).
6. **Migration idempotente**: padrão existente (`DROP TRIGGER IF EXISTS … CREATE TRIGGER …`) — sem risco.

---

## 5. Fluxo final esperado

1. Admin troca empresa no TopNav → `empresaVersion++` → overlay → `armazemId` é re-derivado → todos os hooks `useCrud` e telas com `empresaVersion` no useEffect reexecutam.
2. Toda criação em tabela com `empresa_id` recebe automaticamente o `empresa_id` ativo (via `useCrud.create` ou injeção no `onSave`).
3. Selects auxiliares (Parceiro, Produto, Tipo Entrada/Saída, Setor, Tipo Estoque) só listam itens da empresa/armazém ativo.
4. Backend triggers garantem que usuário não-admin não consiga gravar em tabela de outra empresa, mesmo via console/curl.

Após aprovação, executo as alterações (frontend + 1 migration de extensão de triggers).
