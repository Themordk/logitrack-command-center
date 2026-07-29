## Diagnóstico

O `handleSave` envia `corpo_zpl: zplCode` e as políticas RLS de `etiqueta_template` permitem UPDATE do próprio tenant — o gravar em si funciona. O problema está no ciclo de estado da tela `src/pages/EtiquetaTemplatesPage.tsx`:

1. Você marca "Edição manual", altera o textarea (`zplCode`) e clica em Salvar.
2. `handleSave` grava e chama `reload()`.
3. O recarregamento cria um novo array `templates`, disparando o efeito de sincronização (`[selectedTemplateId, templates]`), que faz `setModoManualZpl(false)` e `setDraft(clone)`.
4. Com `modoManualZpl` de volta em `false`, o efeito de auto-geração roda e **sobrescreve** `zplCode` com o ZPL gerado das configurações.

Resultado: a tela volta a mostrar o ZPL automático (parece que não salvou) e, no próximo Salvar, o ZPL automático realmente sobrescreve a edição manual no banco.

## Correção

Arquivo único: `src/pages/EtiquetaTemplatesPage.tsx`

1. **Reset de modo apenas na troca real de template**
   - Guardar o id carregado em um `useRef`. No efeito de sincronização, só executar `setModoManualZpl(false)` e `setZplCode(...)` quando o `selectedTemplateId` for diferente do id já carregado (ou quando a seleção for limpa).
   - Em um refetch do mesmo template (após salvar), manter `modoManualZpl` e `zplCode` como estão.

2. **Guarda na auto-geração**
   - Manter a saída antecipada com `modoManualZpl`, e evitar `setZplCode` quando o ZPL gerado for idêntico ao atual (evita renders desnecessários).

3. **Confirmação visual do salvamento**
   - Após salvar com sucesso, manter o modo manual ativo e o texto exatamente como enviado, garantindo que o que aparece na aba é o que está no banco.

## Notas técnicas

- Sem mudanças de banco, sem novas dependências, sem alteração em `src/lib/zplGenerator.ts`.
- Comportamento do modo automático permanece: desmarcar "Edição manual" regenera o ZPL a partir das configurações.
- Ordem das abas e demais campos do payload inalterados.
