# Integration Gateway v1.23 (pendente de publicação)

Fonte: `integration-gateway` publicada no branch-qa (versão 11 / gateway 1.22) + ajuste da v1.23:
parceiro aceita `contato` (opcional) no POST/batch e no PATCH de `/master-data/parceiros`.
`telefone` e `email` já eram aceitos e continuam opcionais.

Fica fora de `supabase/functions` de propósito, para não ser publicada automaticamente em outro ambiente.
Para publicar no branch-qa:

```bash
mkdir -p /tmp/gw/supabase/functions/integration-gateway
cp docs/integration-gateway/index.ts /tmp/gw/supabase/functions/integration-gateway/index.ts
cd /tmp/gw && supabase functions deploy integration-gateway --project-ref pwynobnbftqcqygjtrdk --no-verify-jwt
```

Antes de publicar em produção, compare com a versão de produção (pode haver diferenças em relação ao QA).
