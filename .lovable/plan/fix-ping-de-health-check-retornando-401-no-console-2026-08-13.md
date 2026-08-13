# FIX: Ping de health check retornando 401 no console

## Problema

O `useOnlineStatus.ts` faz um `HEAD` para `https://dcpmykhxysvxnpgmlyli.supabase.co/auth/v1/health` com `mode: "no-cors"`. O endpoint `/auth/v1/health` do Supabase exige o header `apikey`; sem ele retorna 401. Embora o hook ainda considere a resposta como prova de conectividade (opaque response), o navegador loga erros 401 a cada 15 segundos, poluindo o console.

## Correção

Trocar o alvo do ping para um asset público da própria aplicação — `favicon.ico` com cache-busting. Isso prova que a rede funciona sem depender de autenticação e sem gerar erros no console.

## Implementação

1. Em `src/hooks/useOnlineStatus.ts`:
   - Manter `PING_TIMEOUT_MS`, `INTERVAL_ONLINE_MS`, `INTERVAL_OFFLINE_MS` e `RECOVERY_THRESHOLD`.
   - Substituir `pingNetwork()` para fazer `HEAD` em `${window.location.origin}/favicon.ico?_t=${Date.now()}` com `cache: "no-store"` e `AbortController` de 3s.
   - Considerar online quando `response.ok` ou status `304`.
   - Remover `SUPABASE_URL`, `HEALTH_URL` e qualquer `import.meta.env` do arquivo.
2. Não alterar nenhum outro arquivo.

## Critério de aceite

- Console do navegador sem erros 401 periódicos.
- Indicador ONLINE/OFFLINE continua funcionando corretamente.
- Nenhum outro arquivo alterado.
