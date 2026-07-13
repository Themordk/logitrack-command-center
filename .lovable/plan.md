## Melhoria UX: Directed Picking with Preview

Alterações **apenas** em `src/pages/coletor/SeparacaoEnderecoPage.tsx`. Nenhuma outra tela, RPC, edge function ou tabela é tocada. Toda a lógica atual de scan, validação, pular endereço, outros endereços, controle de lote e modais permanece intacta.

### Novos imports
- `Package` e `Navigation` de `lucide-react`
- `formatDate` de `@/utils/dateTime`
- Helper local `fmtDate` (trata `null`, `"1900-01-01"` e datas curtas)

### Derivações a partir do estado atual (`tarefa`, `tarefas`, `currentIdx`)
- `restante = quantidade_requerida - (separado || 0)` (clamp em 0)
- `countSameEndereco` — conta tarefas consecutivas a partir de `currentIdx` que compartilham `endereco_id || endereco`
- `proximosEnderecos` — próximos até 2 endereços distintos após o atual
- `showLote` — verdadeiro quando `tipo_controle` ∈ {`LOTE`, `VALIDADE`, `LOTE_SERIE`}

### Nova ordem do layout
1. Progresso textual "Endereço X/Y" + badge de ordem (existente)
2. **Barra de progresso** fina (`h-1.5`, azul `hsl(217,91%,60%)`, transition 500ms), largura = `((currentIdx+1)/tarefas.length)*100%`
3. Card de endereço existente + badge verde "N itens neste endereço" quando `countSameEndereco > 1`
4. **Card de prévia do produto** (`opacity-90`, mesmo fundo/borda dos demais cards):
   - Header com ícone `Package` + "Produto a coletar"
   - SKU / Referência (fallback "—") / Descrição
   - Grid 3 colunas: Requerida (branco), Separada (verde), Restante (vermelho, mostra 0 se ≤ 0)
   - Bloco condicional Lote / Validade / Fabricação quando `showLote`
5. `ScanField` de confirmação (inalterado)
6. **Prévia "Próximos"** — linha compacta com ícone `Navigation`, pills mono dos próximos 2 endereços separados por `→`
7. Botão "Pular Endereço" sticky (inalterado)

### Estilo
Todas as cores em HSL literal conforme o prompt (`hsl(222,40%,12%)`, `hsl(222,35%,22%)`, `hsl(217,91%,60%)`, `hsl(142,71%,45%)`, `hsl(0,84%,60%)`, etc.), `rounded-2xl`/`rounded-xl`, sem novas dependências.

### Fora de escopo
- `SeparacaoIniciarPage`, `SeparacaoProdutoPage`, `SeparacaoLotePage`, `SeparacaoOcorrenciasPage`
- Qualquer RPC/edge function/tabela
- Qualquer nova ação/botão dentro do card de prévia (é somente informativo)
