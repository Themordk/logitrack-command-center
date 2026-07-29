## Diagnóstico (confirmado no código)

Em `src/pages/EtiquetaTemplatesPage.tsx`:

- Linhas 250-267: ao selecionar um template, `setZplCode(selected.corpo_zpl || "")` e `setModoManualZpl(false)`.
- Linhas 271-279: um efeito de auto-geração roda sempre que `modoManualZpl === false` e faz `setZplCode(gerarZplTemplate(tipo, draft))`.

Como o modo manual sempre inicia em `false`, o ZPL vindo do banco é imediatamente sobrescrito pelo ZPL gerado a partir das configurações. Por isso a tela mostra o layout padrão (barcode + campos) em vez do `corpo_zpl` customizado gravado no registro `397bc010…`. Ao salvar nesse estado, o ZPL gerado ainda pode sobrescrever o customizado no banco.

## Correção

Arquivo único: `src/pages/EtiquetaTemplatesPage.tsx`

1. **Detectar ZPL customizado no carregamento**
   - Ao selecionar um template, comparar `selected.corpo_zpl` (normalizado: trim) com `gerarZplTemplate(tipo, selected)`.
   - Se houver `corpo_zpl` e ele for diferente do gerado, iniciar com `modoManualZpl = true` e `zplCode = selected.corpo_zpl`, preservando o conteúdo do banco.
   - Se for igual (ou vazio), manter o comportamento atual (modo automático).

2. **Proteger a auto-geração**
   - Manter a saída antecipada quando `modoManualZpl` for verdadeiro, de modo que o efeito nunca substitua um ZPL customizado carregado do banco.

3. **Comportamento resultante**
   - Abrir a tela mostra exatamente o ZPL registrado, com o toggle "Edição manual" já marcado.
   - Desmarcar "Edição manual" continua regenerando o ZPL a partir das configurações (ação explícita do usuário).
   - Salvar persiste o que está visível no textarea.

## Notas técnicas

- Sem mudanças de banco, sem novas dependências, sem alteração em `src/lib/zplGenerator.ts`.
- A comparação usa apenas trim/normalização de espaços nas pontas, para evitar falso positivo de "customizado" por quebra de linha final.
