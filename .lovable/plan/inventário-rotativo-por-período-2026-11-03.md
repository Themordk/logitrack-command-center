# Inventário rotativo por período

- Oferecer Saídas, Cortes, Cancelamentos e Devoluções do período, com descrição e período obrigatório.
- Remover a seleção de curva somente da criação e manter os nomes legados nas listas.
- Mostrar critério e datas no resumo; bloquear criação quando a prévia não encontrar endereços elegíveis.
- Exibir mensagens amigáveis e manter os campos preenchidos quando a criação falhar.
- Preservar layout, demais tipos, geração de tarefas e banco.

## Detalhes técnicos
- Centralizar opções e labels em `src/modules/inventario/criterios.ts`.
- Enviar `p_curva: null` e as datas resolvidas nas duas RPCs existentes para todos os critérios rotativos.
- Conferir os tipos existentes e testar os parâmetros e o bloqueio de criação, sem modificar Supabase.