Plano para corrigir as telas do menu Armazém ao trocar empresa no TopNav

## Diagnóstico

As telas citadas não estão inconsistentes por falta de `empresaVersion` no `useCrud`; elas falham principalmente porque várias tabelas de Armazém não têm `empresa_id` direto e dependem de `armazem_id`:

- `tipo_estoque`, `setor`, `endereco`, `box`, `turnos`, `motivo_ocorrencia`, `zona_atividade` são filtradas por `armazem_id`.
- O `armazemId` atual fica persistido em `localStorage.core_armazem_id` e não está sendo recalculado quando o ADMIN troca a empresa no TopNav.
- Resultado: a empresa ativa muda, mas o armazém ativo pode continuar sendo o armazém da empresa anterior; as telas do menu Armazém continuam filtrando/criando dados nesse armazém antigo.
- `veiculos` possui `empresa_id`, mas ainda não está na whitelist `TABLES_WITH_EMPRESA`, então não recebe filtro nem injeção automática da empresa ativa.
- `fetchOptions()` também só filtra por `tenant_id`/`ativo` e, quando usado em selects como Armazém, Setor e Tipo de Estoque, pode listar opções de outras empresas.

## Objetivo da correção

Garantir que, ao alternar a empresa no TopNav:

1. O armazém ativo seja compatível com a nova empresa.
2. Todas as telas do menu Armazém exibam somente dados da empresa selecionada.
3. Novos registros sejam criados vinculados à empresa/armazém corretos.
4. Não haja opções de select apontando para registros da empresa anterior.
5. O banco bloqueie gravações inconsistentes onde for possível validar.

## Implementação proposta

### 1. Recalcular o armazém ativo ao trocar empresa

Atualizar `TenantContext.changeEmpresa()` para também ajustar `core_armazem_id`:

- Ao selecionar uma nova empresa, buscar o primeiro armazém ativo dessa empresa dentro do tenant.
- Persistir esse armazém em `localStorage.core_armazem_id`.
- Atualizar `setArmazemId()` no contexto.
- Incrementar `empresaVersion` somente após empresa/armazém estarem coerentes.
- Se a empresa não tiver armazém ativo, limpar `armazemId` e fazer as telas retornarem lista vazia ou exigirem criação/seleção de armazém.

Fluxo esperado:

```text
ADMIN troca empresa no TopNav
  -> changeEmpresa(novaEmpresa)
  -> salva empresa ativa
  -> busca armazém ativo da nova empresa
  -> salva armazém ativo compatível
  -> limpa caches dependentes
  -> incrementa empresaVersion
  -> telas refazem fetch com empresa/armazém corretos
```

### 2. Evoluir `useCrud` para tabelas dependentes de armazém

Manter a whitelist `TABLES_WITH_EMPRESA` e adicionar uma segunda estratégia para tabelas que não possuem `empresa_id`, mas possuem `armazem_id`:

- Criar `TABLES_WITH_ARMAZEM_CONTEXT`, incluindo:
  - `tipo_estoque`
  - `setor`
  - `endereco`
  - `box`
  - `turnos`
  - `motivo_ocorrencia`
  - `zona_atividade`
  - `tipo_box` se usado como cadastro por armazém
  - `picking_produto` se aparecer em rotas administrativas relacionadas
- Para essas tabelas, aplicar automaticamente `.eq("armazem_id", armazemId)` quando houver armazém ativo.
- Se não houver armazém ativo, retornar `[]` para evitar vazamento de dados do tenant inteiro.
- No `create()`, injetar `armazem_id` automaticamente quando a tabela exigir contexto de armazém e o payload não vier preenchido.
- Continuar aceitando `filters` explícitos, mas evitar que filtros vazios removam a proteção de contexto.

### 3. Incluir `veiculos` na filtragem por empresa

Atualizar `TABLES_WITH_EMPRESA` em `useCrud.ts` para incluir:

- `veiculos`
- `produto_embalagem`, se necessário para telas relacionadas
- `estoque_geral`, `estoque_movimento` e `volume_expedicao` para consistência futura em CRUDs/listagens que usem o hook

Para `VeiculosPage`, remover dependência de seleção manual de empresa no formulário ou forçar `empresa_id = empresaId` no `handleSave`, garantindo criação sempre na empresa ativa.

### 4. Corrigir selects/opções para respeitar empresa ativa

Substituir chamadas genéricas como:

```ts
fetchOptions("armazem", tenantId)
fetchOptions("setor", tenantId)
fetchOptions("tipo_estoque", tenantId)
```

por chamadas filtradas pelo contexto correto:

- `armazem`: filtrar por `empresa_id = empresaId`
- `setor`: filtrar por `armazem_id = armazemId`
- `tipo_estoque`: filtrar por `armazem_id = armazemId`
- `tipo_box`: filtrar por `armazem_id = armazemId`
- `veiculos`: filtrar por `empresa_id = empresaId`

Também ajustar `fetchOptions()` para aceitar uma opção de segurança contextual ou criar helper dedicado, por exemplo:

```ts
fetchContextOptions(table, { tenantId, empresaId, armazemId })
```

Isso reduz o risco de novas telas repetirem o mesmo erro.

### 5. Ajustar telas impactadas

Aplicar os filtros e criação contextual nas seguintes telas:

- `TiposEstoquePage.tsx`
  - Filtrar lista por armazém ativo.
  - Filtrar select de Armazém por empresa ativa ou, preferencialmente, usar armazém ativo automaticamente.

- `SetoresPage.tsx`
  - Filtrar lista por armazém ativo.
  - Filtrar select de Armazém por empresa ativa.

- `EnderecosPage.tsx`
  - Filtrar lista por armazém ativo.
  - Filtrar selects: Armazém por empresa, Setor/Tipo Estoque por armazém.
  - Limpar seleção de impressão ao trocar empresa para evitar etiquetas de endereços antigos.

- `EnderecosBatchPage.tsx`
  - Carregar opções somente do contexto ativo.
  - Ao trocar empresa, resetar `armazemId`, `setorId`, `tipoEstoqueId` locais para evitar geração em contexto antigo.

- `BoxPage.tsx`
  - Já usa `armazemId`, mas ficará protegido também pelo novo `useCrud`.
  - Garantir `tipo_box` filtrado pelo armazém ativo.

- `TurnosPage.tsx`
  - Já usa `armazemId`, mas ficará protegido contra armazém antigo após a troca.

- `MotivosOcorrenciaPage.tsx`
  - Já usa `armazemId`, mas ficará protegido contra armazém antigo após a troca.

- `VeiculosPage.tsx`
  - Filtrar por `empresaId` via `useCrud`.
  - Criar/editar sempre na empresa ativa.

- `ZonasAtividadePage.tsx`
  - Filtrar lista por armazém ativo.
  - Filtrar select de Armazém por empresa ativa.
  - Em vínculos, carregar somente endereços do armazém ativo.
  - Limpar modal/vínculos abertos ao trocar empresa.

### 6. Reforçar segurança no banco

Criar uma nova migration para ampliar a validação server-side.

#### Para tabelas com `empresa_id`

Adicionar `trg_validar_empresa_usuario` também em:

- `veiculos`
- `produto_embalagem`
- `hu`
- `estoque_geral`
- `estoque_movimento`
- `volume_expedicao`

#### Para tabelas que dependem de `armazem_id`

Criar uma função/trigger específica, por exemplo `fn_validar_armazem_empresa_usuario()`, que:

- Obtém o `usuario.empresa_id` pelo `auth.uid()`.
- Permite ADMINISTRADOR.
- Verifica se `NEW.armazem_id` pertence à empresa do usuário em `public.armazem`.
- Bloqueia inserts/updates em armazém de outra empresa para usuários não-admin.

Aplicar em:

- `tipo_estoque`
- `setor`
- `endereco`
- `box`
- `turnos`
- `motivo_ocorrencia`
- `zona_atividade`
- `tipo_box`
- `rotas`
- `integracao_config` / `integracao_objetos`, se mantiverem isolamento por armazém

Para `endereco_zona_atividade`, validar por relação indireta:

- O endereço vinculado deve pertencer ao mesmo armazém/tenant da zona.
- A zona deve pertencer ao armazém ativo/permitido.

### 7. UX e prevenção de inconsistência visual

- Manter overlay “Atualizando dados…” durante a troca.
- Fechar modais abertos ou resetar estados locais sensíveis quando `empresaVersion` mudar.
- Em telas de Armazém, se a empresa ativa não tiver armazém, exibir estado vazio claro: “Nenhum armazém ativo encontrado para esta empresa”.

## Arquivos impactados

Frontend:

- `src/contexts/TenantContext.tsx`
- `src/hooks/useCrud.ts`
- `src/pages/TiposEstoquePage.tsx`
- `src/pages/SetoresPage.tsx`
- `src/pages/EnderecosPage.tsx`
- `src/pages/EnderecosBatchPage.tsx`
- `src/pages/BoxPage.tsx`
- `src/pages/TurnosPage.tsx`
- `src/pages/MotivosOcorrenciaPage.tsx`
- `src/pages/VeiculosPage.tsx`
- `src/pages/ZonasAtividadePage.tsx`
- Possivelmente `src/pages/RotasPage.tsx` por usar `armazem_id` e estar em Dados Mestres, mas depende da mesma raiz do problema.

Banco:

- Nova migration em `supabase/migrations/` com triggers de validação por `empresa_id` e por `armazem_id`.

## Critérios de aceite

- Ao trocar empresa no TopNav, `empresaId` e `armazemId` ficam compatíveis.
- Tipo de Estoque, Setores, Endereços, Box, Turnos, Motivos, Veículos e Zonas exibem somente dados da empresa ativa.
- Selects dessas telas não oferecem Armazéns/Setores/Tipos de Estoque de outra empresa.
- Criar registro nessas telas grava no armazém/empresa ativa correta.
- Se tentar manipular manualmente payload com empresa/armazém de outra empresa, o banco bloqueia para usuários não-admin.
- Não há reload completo da página.
- Build TypeScript passa sem erros.