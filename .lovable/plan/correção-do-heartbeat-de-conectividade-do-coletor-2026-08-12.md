# Correção do heartbeat de conectividade do coletor

## Objetivo

Corrigir a detecção online/offline sem usar nem expor a chave `service_role`. O erro foi confirmado na URL atual: a raiz de `rest/v1` rejeita a chave publicável, enquanto `auth/v1/health` responde `200` com essa mesma chave.

## Implementação

1. Atualizar `src/hooks/useOnlineStatus.ts` para consultar `https://<projeto>.supabase.co/auth/v1/health` em vez de `/rest/v1/`.
2. Enviar a chave publicável somente no header `apikey`, removendo-a da query string e removendo o header `Authorization`, que não é necessário para esse health check.
3. Considerar online apenas respostas HTTP bem-sucedidas (`response.ok`), evitando que respostas `401`, `403` ou `5xx` sejam interpretadas como conectividade válida.
4. Preservar o timeout de 3 segundos, os intervalos de verificação e o limiar de dois sucessos para recuperação automática.

## Validação

- Verificar no navegador que o heartbeat retorna `200` sem erros `401` no console/rede.
- Confirmar que o coletor permanece online com internet disponível.
- Confirmar que falha de rede/timeout ainda ativa o modo offline e que a recuperação continua exigindo dois pings automáticos bem-sucedidos.

## Segurança

A correção usa somente a chave publicável já destinada ao frontend. A chave `service_role` não será usada, armazenada nem enviada pelo navegador.
