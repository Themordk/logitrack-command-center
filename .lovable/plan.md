## Plano — Exibir Saldo do Endereço na Separação

Ajustes pontuais em `src/pages/coletor/SeparacaoEnderecoPage.tsx`:

1. **Interface `Tarefa`**: adicionar `saldo_endereco?: number` (o campo `endereco_id?: string` já existe).

2. **Card "Produto a coletar"** — substituir os 3 boxes atuais (Requerida / Separada / Restante) por:
   - **SALDO** — `tarefa.saldo_endereco ?? 0`, valor em azul `hsl(217,91%,60%)`
   - **REQUERIDA** — `tarefa.quantidade_requerida`, valor branco
   - **SEPARADA** — `tarefa.separado || 0`, valor verde `hsl(142,71%,45%)`
   
   Mantém `grid grid-cols-3 gap-2` e o estilo dos boxes. A variável `restante` deixa de ser usada aqui (a informação continua na tela de produto).

Nenhuma outra alteração: scan, pular endereço, modais e demais componentes ficam intactos. Nenhuma nova chamada ao Supabase — `saldo_endereco` já vem no array de tarefas em `sessionStorage`.
