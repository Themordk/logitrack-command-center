# Filtro de intervalo de datas — Ocorrências Operacionais

Adicionar um filtro de período (data inicial e data final) baseado na data de criação (`criado_em`) na rota `/atividades/ocorrencias`.

## Escopo

Arquivo único: `src/pages/OcorrenciasOperacionaisPage.tsx`.

## Mudanças

1. **UI (barra de filtros)**
   - Adicionar dois inputs de data (`type="date"`) rotulados "De" e "Até", ao lado dos filtros existentes (status/tipo/etapa/busca).
   - Botão "Limpar" para resetar o intervalo.
   - Padrão: vazio (sem filtro de data aplicado).

2. **Estado + debounce**
   - Novos estados `dataIni` e `dataFim` seguindo o padrão dos demais filtros (aplicar `useDebounce` como já é feito).
   - Incluir ambos na `queryKey` do `useQuery` para refetch automático.

3. **Consulta**
   - Repassar os valores para a RPC atual de listagem de ocorrências (ex.: `p_data_ini` / `p_data_fim`), enviando `null` quando vazios, mantendo compatibilidade retroativa.
   - Se a RPC não aceitar esses parâmetros, aplicar o filtro client-side sobre `criado_em` do resultado (fallback), preservando a paginação server-side existente sem regressão.

4. **Reset de página**
   - Ao alterar o intervalo, voltar para a página 1 (mesmo comportamento dos outros filtros).

## Fora do escopo

- Nenhuma alteração de backend/RPC/migração.
- Sem mudanças em outras telas de Atividades.
