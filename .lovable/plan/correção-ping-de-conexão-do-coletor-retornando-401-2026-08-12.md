# Correção — Ping de conexão do coletor retornando 401

## Problema

O detector de conexão (`src/hooks/useOnlineStatus.ts`) faz um `HEAD` em `https://<projeto>.supabase.co/rest/v1/` sem enviar a chave pública. O PostgREST responde **401 Unauthorized** e, como a requisição usa `mode: "no-cors"`, o navegador aborta (`ERR_ABORTED`), o `fetch` lança e o hook conclui "offline" mesmo com internet perfeita — além de poluir o console a cada 5–15 segundos.

## Correção

Ajustar apenas o `pingNetwork` do hook:

- Trocar o alvo por um endpoint que aceita a chave: `GET` em `/rest/v1/?apikey=<publishable key>` com header `apikey` e `Authorization: Bearer <publishable key>`, `mode: "cors"` (o Supabase envia CORS liberado, então a resposta é legível).
- Considerar online qualquer resposta HTTP recebida (`res.ok` ou não). O objetivo é medir alcance de rede, não autorização — assim um eventual 401/404 futuro não derruba o coletor para offline.
- Só considerar offline quando o `fetch` rejeitar (falha de rede) ou estourar o timeout de 3s (`AbortController` já existente).
- Reaproveitar a URL e a chave a partir do client Supabase já existente, em vez da URL escrita à mão no hook.

Nada mais muda: intervalos (15s online / 5s offline), `RECOVERY_THRESHOLD` de 2 pings, `checkNow` manual, fila offline e banner permanecem exatamente como estão.

## Resultado esperado

Console limpo, indicador ONLINE estável no coletor e sincronização da fila disparando apenas em transições reais de conectividade.
