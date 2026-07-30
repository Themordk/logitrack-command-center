## Situação atual (verificada)

Existe um único ponto de configuração do PWA: `vite.config.ts` (plugin `VitePWA`). Não há `public/manifest.json` nem `manifest.webmanifest` no projeto. A linha 29 do `vite.config.ts` **já contém** `orientation: "portrait"`.

Ou seja, o manifesto já pede retrato — o Android só respeita esse campo quando o app é aberto pelo ícone instalado (modo standalone) e, mesmo assim, algumas versões/navegadores ignoram o campo. Por isso o app continua girando.

## O que fazer

1. **Manter/normalizar o manifesto**
   - Confirmar `orientation: "portrait"` em `vite.config.ts` (já presente, sem alteração necessária).

2. **Adicionar trava de orientação em runtime** (correção efetiva)
   - Criar um utilitário pequeno, ex. `src/lib/lockOrientation.ts`, que chama a Screen Orientation API:
     - `screen.orientation.lock("portrait")` dentro de try/catch (a API não existe/é bloqueada em iOS e em abas normais do navegador — falha silenciosa é esperada).
     - Reaplicar o lock quando o app volta a ficar visível (`visibilitychange`) e após entrar em fullscreen, pois o Android pode liberar o lock nesses momentos.
   - Chamar esse utilitário no bootstrap do app (`src/main.tsx`), apenas quando fizer sentido.

3. **Reforço em CSS para o coletor** (opcional, decidir com a pergunta abaixo)
   - Caso o lock não seja aceito pelo dispositivo, aplicar em `src/index.css` uma media query `@media (orientation: landscape) and (max-width: 900px)` mostrando um aviso "Gire o aparelho para o modo retrato" sobre as rotas do coletor, garantindo que a operação nunca fique em paisagem.

## Escopo de aplicação

Ponto a definir: aplicar a trava em **todo o sistema** (inclusive o portal administrativo em desktop/tablet, onde paisagem é útil para grids e relatórios) ou **somente nas rotas `#/coletor/*`**. A recomendação é travar apenas o coletor, já que o `start_url` do PWA é `/#/coletor/login` e o portal se beneficia de paisagem em telas maiores.

## Detalhes técnicos

- `screen.orientation.lock()` só funciona em contexto seguro (HTTPS) e, no Chrome Android, em geral apenas quando o app está em modo `standalone`/fullscreen; em aba comum retorna `NotSupportedError`/`SecurityError` — tratado no catch.
- Nenhuma alteração de service worker, cache ou registro é necessária.
- Mudanças no manifesto só têm efeito para quem reinstalar o app; a trava em runtime funciona imediatamente após o deploy.
