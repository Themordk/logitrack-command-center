# Portal do desenvolvedor (developers.corelogitrack.com.br)

Site estático da API de integração, servido pelo mesmo projeto da Vercel do WMS.

- Arquivos: `public/developers/` (`index.html`, `openapi.json`, `portal-dados.json`).
- `vercel.json` reescreve só o host `developers.corelogitrack.com.br` para `/developers/`. Os subdomínios de tenant não mudam.
- O service worker do PWA ignora `/developers` (`vite.config.ts`: `globIgnores` e `navigateFallbackDenylist`).
- `openapi.json` fica público em `https://developers.corelogitrack.com.br/openapi.json`.

Os três arquivos são gerados a partir do catálogo de documentação (`integracao.api_doc*`). Para atualizar, gere de novo e substitua os arquivos desta pasta.
