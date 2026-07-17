# Geração de volumes de expedição no coletor

Interceptar a finalização da última tarefa da onda (separação e conferência) e, quando o `tipo_saida.gera_volume_etapa` corresponder à etapa atual, exibir um dialog pedindo a quantidade de volumes e chamar a RPC `gerar_volumes_expedicao` antes de voltar à tela inicial.

## Arquivos alterados (apenas 2)

### 1) `src/pages/coletor/SeparacaoProdutoPage.tsx`

- Novos estados: `showVolumeDialog`, `volumeQtd`, `volumeSaving`, `geraVolumeEtapa` (default `"NENHUMA"`).
- No `useEffect` de inicialização, buscar `movimento_saida.tipo_saida.gera_volume_etapa` usando `coletor_separacao_movimento_id` do sessionStorage e popular `geraVolumeEtapa`.
- Em `advanceToNext`, quando `nextIdx >= tarefas.length`: se `geraVolumeEtapa === "SEPARAÇÃO"`, abrir o dialog e retornar; caso contrário, comportamento atual (toast + navegar para `/coletor/separacao/iniciar`).
- Nova função `handleSalvarVolumes`: valida qtd > 0, chama `supabase.rpc("gerar_volumes_expedicao", { p_tenant_id, p_empresa_id, p_movimento_saida_id, p_quantidade_volumes, p_etapa_origem: "SEPARAÇÃO" })`, trata `{ sucesso, mensagem }` e navega para `/coletor/separacao/iniciar` no sucesso.
- Novo JSX de dialog (dark theme, ícone `Package`, input numérico grande, `ActionButton` "Confirmar Volumes") adicionado antes do fechamento do `ColetorLayout`, no mesmo nível dos demais dialogs.

### 2) `src/pages/coletor/ConferenciaProdutoPage.tsx`

- Mesmos novos estados.
- Expandir o `select` existente do tipo_saida para incluir `gera_volume_etapa` e setar `geraVolumeEtapa` logo após `setModoCego(...)`.
- Em `executarConfirmacaoFor`, no ramo de "todas as tarefas concluídas": após o overlay de sucesso, se `geraVolumeEtapa === "CONFERÊNCIA"` abrir o dialog; caso contrário, manter o `setResultDialog` atual com `ondaConcluida: true`.
- `handleSalvarVolumes` análogo, com `p_etapa_origem: "CONFERÊNCIA"`, navegando para `/coletor/conferencia/iniciar` no sucesso.
- JSX do dialog inserido antes do bloco do EAN Error Dialog. `Package` já está importado.

## Regras de comportamento

- Só interrompe o fluxo quando `gera_volume_etapa` casa exatamente com a etapa (`SEPARAÇÃO` na separação, `CONFERÊNCIA` na conferência). Valores `NENHUMA` e `CARREGAMENTO` não disparam nada.
- Fechar o dialog sem confirmar não bloqueia nada (o dialog é modal simples; sem callback de fechar além do próprio botão de confirmar — comportamento igual aos outros dialogs do coletor).
- Nenhuma alteração em `components/ui/`, `App.tsx`, RPCs, ou outros arquivos. Sem novos arquivos e sem novas dependências.

## Validação

- Build TS deve passar.
- Fluxo separação: com `gera_volume_etapa='SEPARAÇÃO'`, ao concluir a última tarefa, aparece o dialog; ao confirmar, RPC é chamada e volta para `/coletor/separacao/iniciar`.
- Fluxo conferência: idem com `'CONFERÊNCIA'` retornando para `/coletor/conferencia/iniciar`.
- Com `NENHUMA`/`CARREGAMENTO`: fluxo antigo inalterado.
