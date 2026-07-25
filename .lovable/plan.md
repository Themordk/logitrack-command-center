Plano de correção cirúrgica em `src/modules/reports/produtividade/produtividade.service.ts`

Objetivo: Restaurar dois trechos que foram revertidos acidentalmente para a versão antiga, adicionando os campos LMS à interface `DetalheTipoTarefaRow` e ao select de `fetchDetalheTipoTarefa`, sem tocar em nenhum outro arquivo ou trecho.

Escopo: 2 substituições de texto no mesmo arquivo.

---

Alterações

1. Atualizar a interface `DetalheTipoTarefaRow`
   - Local: por volta da linha 49, dentro da propriedade `tipo_tarefa`.
   - Substituir:
     ```ts
       tipo_tarefa?: { codigo: string; descricao: string; tempo_estimado_segundos: number | null } | null;
     ```
   - Por:
     ```ts
       tipo_tarefa?: {
         codigo: string;
         descricao: string;
         tempo_estimado_segundos: number | null;
         categoria: string | null;
         meta_unidades_hora: number | null;
         meta_tarefas_hora: number | null;
         peso_produtividade: number | null;
         cor_interface: string | null;
         unidade_medida: string | null;
       } | null;
     ```

2. Atualizar o select de `fetchDetalheTipoTarefa`
   - Local: por volta da linha 85, dentro da função `fetchDetalheTipoTarefa`.
   - Substituir:
     ```ts
           tipo_tarefa:tipo_tarefa_id ( codigo, descricao, tempo_estimado_segundos )
     ```
   - Por:
     ```ts
           tipo_tarefa:tipo_tarefa_id ( codigo, descricao, tempo_estimado_segundos, categoria, meta_unidades_hora, meta_tarefas_hora, peso_produtividade, cor_interface, unidade_medida )
     ```

---

O que não será alterado

- Nenhum outro arquivo do projeto.
- Nenhum outro trecho dentro de `produtividade.service.ts`.
- Interfaces `TimelineEntry` e `TarefaColaboradorRow` (já corretas).
- Funções `fetchTimelineOperador`, `fetchTarefasColaborador`, `fetchProdutividadeDiaria`, `fetchOperadores` e `fetchTurnos`.
- Imports, formatação, nome de variáveis ou estrutura geral do arquivo.

---

Validação

- Após a edição, executar verificação de tipos (`tsgo` ou `bunx tsc --noEmit`) para garantir que a interface expandida continua compatível com os demais módulos.