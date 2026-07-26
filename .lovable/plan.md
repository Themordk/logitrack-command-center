
## Escopo

Backend já expõe 3 novos campos. Este plano ajusta apenas o frontend para refleti-los:
- `tipo_saida.reserva_separacao_movimento` (bool, default true)
- `tipo_saida.reserva_conferencia_movimento` (bool, default true)
- `usuario.zona_atividade_separacao` (uuid nullable → `zona_atividade.id`)

## 1) `src/pages/TiposSaidaPage.tsx`

- Grid: adicionar 2 colunas (`Reserva Sep. Movimento`, `Reserva Conf. Movimento`) usando o `boolBadge` já existente, imediatamente antes da coluna `ativo`.
- Sheet de edição/criação: nova seção "Reserva de tarefas" entre "Separação e volume" e "Automação", com 2 `Switch`:
  - `reserva_separacao_movimento` — descrição dinâmica ("Apenas 1 operador…" vs "Múltiplos operadores…").
  - `reserva_conferencia_movimento` — mesmo padrão, **desabilitado** e visualmente esmaecido quando `realiza_conferencia = false`.
- Defaults em novo registro: ambos `true` (compatível com registros existentes).
- `handleSave`: quando `realiza_conferencia = false`, forçar `reserva_conferencia_movimento = true` (reset ao default) além dos resets já existentes de `conferencia_checkout` e `conferencia_cega`.

## 2) `src/pages/UsuariosPage.tsx`

- Novo state `zonaOptions` carregado no `useEffect` existente: consulta `zona_atividade` filtrando `tenant_id`, `tipo_grupo = 'PICKING'`, `Ativo = true`, ordenando por `descricao`; se houver `armazemId` ativo, filtrar também por `armazem_id`.
- Grid: nova coluna "Zona Separação" antes de `ativo`, exibindo badge ciano com a descrição da zona ou "—" quando nulo.
- Sheet de edição/criação: novo `select` "Zona de Atividade (Separação)" antes de `permite_checkout`, com primeira opção `""` rotulada "Todas as zonas (sem restrição)".
- Como `fields` hoje é `const` estática, converter para `useMemo` com dependências `[empresaOptions, armazemOptions, turnoOptions, perfilOptions, zonaOptions]` para reagir ao carregamento assíncrono das zonas.
- `onSave`: normalizar `zona_atividade_separacao` para `null` quando vazio/undefined, tanto no update quanto no body da edge function `create-usuario`.

## 3) `src/integrations/supabase/types.ts`

Adicionar os novos campos nos blocos `Row`/`Insert`/`Update`:
- `tipo_saida`: `reserva_separacao_movimento: boolean` e `reserva_conferencia_movimento: boolean` (opcionais em Insert/Update).
- `usuario`: `zona_atividade_separacao: string | null` (opcional em Insert/Update).

## Detalhes técnicos

- Nenhum arquivo novo, nenhuma migration (backend já pronto).
- Comportamento retrocompatível: registros sem zona veem todas as ondas; `tipo_saida` existentes ficam com reservas `true` (comportamento atual).
- Sem alterações no coletor — filtro por zona já é aplicado no backend.
- RBAC/rotas inalteradas.
