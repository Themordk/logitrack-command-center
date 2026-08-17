# Correção: Provider ausente no ColetorLayout

## Problema
`ColetorLayout.tsx` renderiza `<OcorrenciaFAB />`, mas não envolve o layout com `<OcorrenciaColetorProvider>`. Como `OcorrenciaFAB` (e várias páginas do coletor) chamam `useOcorrenciaColetorContext()`, ocorre crash em runtime com a mensagem:

> "useOcorrenciaColetorContext deve ser usado dentro de OcorrenciaColetorProvider"

## Correção
Ajustar `src/components/coletor/ColetorLayout.tsx`:

1. Importar `OcorrenciaColetorProvider` de `@/contexts/OcorrenciaColetorContext`.
2. Envolver todo o conteúdo do `return` com `<OcorrenciaColetorProvider>`.
3. Manter `<OcorrenciaFAB />` no mesmo local (fora do `<main>`, dentro do provider).

```text
ANTES:
  return (
    <div className="h-screen ...">
      ...
      <OcorrenciaFAB />
    </div>
  );

DEPOIS:
  return (
    <OcorrenciaColetorProvider>
      <div className="h-screen ...">
        ...
        <OcorrenciaFAB />
      </div>
    </OcorrenciaColetorProvider>
  );
```

## Verificação
- Rodar typecheck/build para garantir que não há erros de importação ou de JSX.
- Validar que nenhuma página do coletor dispara o erro de contexto ausente.
