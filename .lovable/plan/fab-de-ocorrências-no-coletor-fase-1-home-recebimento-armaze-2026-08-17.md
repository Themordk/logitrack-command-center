# FAB de Ocorrências no Coletor — Fase 1 (Home + Recebimento + Armazenagem)

## Verificações feitas
- `ColetorLayout.tsx` tem header `z-50`, `<main>` com scroll e nenhum provider extra — o FAB entra depois do `<main>`, dentro do novo provider.
- `RegistrarOcorrenciaColetorButton.tsx` (337 linhas) concentra hoje todo o formulário: states, carga de motivos por etapa, foto com `capture="environment"`, `uploadAnexoOcorrencia(origem: "COLETOR")` e RPC. É essa lógica que será extraída.
- A constante `TIPOS` do coletor ainda **não** tem `EXCLUSAO_DOCUMENTO` (só o modal administrativo tem) — será adicionada no componente extraído.
- `ArmazenagemExecucaoPage.tsx` já monta contexto rico (`produtoDesc`, `tarefaId`, `enderecoId`, `enderecoDesc`) para o botão inline — o mesmo objeto alimentará o FAB.
- As 13 páginas do escopo existem em `src/pages/coletor/`.

## 1. Novo contexto — `src/contexts/OcorrenciaColetorContext.tsx`
Provider com `contexto` (tipo `OcorrenciaContexto` reaproveitado de `RegistrarOcorrenciaModal`), `setContexto`, `clearContexto`, `fabVisivel`, `setFabVisivel`. Hook `useOcorrenciaColetorContext` lança erro fora do provider.

## 2. Novo componente — `src/components/ocorrencia/OcorrenciaBottomSheet.tsx`
Formulário standalone extraído do botão do coletor, mantendo estilos, animação `animate-slide-up`, overlay `bg-black/70`, `max-h-[92vh]` e input de câmera `accept="image/*" capture="environment"`.

Novidades:
- **Modo genérico** (sem `contexto.etapa`): chips de etapa (Recebimento, Armazenagem, Separação, Conferência, Expedição, Inventário, Auditoria, Outros) no topo; a etapa escolhida dispara a carga de motivos e habilita o submit junto com o motivo.
- **Modo com etapa fixa**: badge azul da etapa + card de contexto (produto/endereço) quando houver, sem chips.
- `TIPOS` passa a incluir `EXCLUSAO_DOCUMENTO`.
- Submit e upload de anexo idênticos ao fluxo atual (RPC → `uploadAnexoOcorrencia` com `origem: "COLETOR"`); falha de anexo não desfaz a ocorrência.

## 3. Novo componente — `src/components/ocorrencia/OcorrenciaFAB.tsx`
Botão 56×56 `rounded-2xl`, fundo `#F59E0B`, ícone `AlertTriangle` branco 24px, `fixed bottom-20 right-4`, `z-40`, `shadow-lg shadow-amber-500/30`, `active:scale-90`. Retorna `null` quando `fabVisivel` é falso. Abre o `OcorrenciaBottomSheet` com o contexto publicado.

## 4. Simplificar `RegistrarOcorrenciaColetorButton.tsx`
Vira um wrapper: `ActionButton variant="warning"` + `OcorrenciaBottomSheet`. Props inalteradas — nenhuma página consumidora (Conferência, Inventário, Abastecimento, Armazenagem Execução) é modificada.

## 5. `ColetorLayout.tsx`
Envolver todo o layout com `OcorrenciaColetorProvider` e renderizar `<OcorrenciaFAB />` após o `<main>`.

## 6. Ativação por página (13 páginas)
Em cada uma, `useEffect` no mount: `setFabVisivel(true)` + publicação de contexto, com cleanup `setFabVisivel(false)`.

| Página | Contexto publicado |
|---|---|
| ColetorHomePage | `clearContexto()` (modo genérico com chips) |
| RecebimentoMenu / Iniciar / Conferencia / Volumes / Concluido | `{ etapa: "RECEBIMENTO" }` |
| RecebimentoExecucaoPage | `{ etapa: "RECEBIMENTO" }` + produto/tarefa/movimento quando disponíveis (efeito dependente dos states carregados) |
| ArmazenagemDashboard / Movimentos / Itens / Iniciar / Concluido | `{ etapa: "ARMAZENAGEM" }` |
| ArmazenagemExecucaoPage | contexto rico (produto, endereço, tarefa), coexistindo com o botão inline atual |

Nenhuma outra rota do coletor recebe o FAB nesta fase.

## Detalhes técnicos
- O tipo `OcorrenciaContexto` continua exportado de `RegistrarOcorrenciaModal`, sem duplicação.
- `setFabVisivel`/`setContexto` vêm de `useCallback`, então podem entrar nas dependências dos efeitos sem loop.
- `useTenant()` é lido dentro do bottom-sheet; submit bloqueado se `tenantId` for nulo.

## Fora de escopo
Banco de dados, painel administrativo, demais rotas do coletor e remoção do botão inline.
