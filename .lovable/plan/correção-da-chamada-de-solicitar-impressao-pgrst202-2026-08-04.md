# Correção da chamada de `solicitar_impressao` (PGRST202)

## Diagnóstico (confirmado no banco)

A função no banco tem exatamente 11 parâmetros e **nenhum deles possui valor padrão**:

```text
solicitar_impressao(
  p_armazem_id uuid, p_tipo_etiqueta text, p_dados jsonb, p_origem text,
  p_documento_origem_id uuid, p_impressora_id uuid, p_prioridade integer,
  p_quantidade_copias integer, p_setor_uso text, p_tipo_documento_origem text,
  p_template_id uuid
)
```

Como não há defaults, o PostgREST só resolve a chamada quando **todos os 11 nomes** são enviados. A UI hoje envia apenas 8 (faltam `p_impressora_id`, `p_quantidade_copias`, `p_setor_uso`) — daí o erro `PGRST202`. O hook do coletor tem o mesmo defeito (faltam `p_impressora_id`, `p_setor_uso`, `p_template_id`).

## Correção

Enviar sempre os 11 parâmetros nomeados, usando `null` para os opcionais não informados.

Arquivos e pontos de chamada:

- `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx` — `handleEnviar` e `handleReimprimirAtual`
- `src/components/etiqueta/PrintEtiquetaHUModal.tsx` — idem
- `src/components/etiqueta/PrintEtiquetaVolumeModal.tsx` — idem
- `src/components/etiqueta/PrintEtiquetaProdutoModal.tsx` — idem
- `src/hooks/useSolicitarImpressao.ts` — chamada única do coletor (passa a aceitar `templateId` opcional, default `null`)

Padrão aplicado em cada chamada:

```ts
p_impressora_id: null,
p_setor_uso: null,
p_quantidade_copias: 1,
p_template_id: selectedConfig?.id ?? null,
p_documento_origem_id: <id> ?? null,
p_tipo_documento_origem: <tipo> ?? null,
```

Também troca `?? undefined` por `?? null` (chaves com `undefined` são omitidas do JSON e reproduzem o erro).

## Notas técnicas

- Sem migração de banco; a assinatura atual é respeitada tal como está.
- Nenhuma mudança de UI, layout ou lógica de negócio — apenas a montagem dos argumentos da RPC.
- Validação: typecheck e disparo de uma impressão pela tela de Endereços para confirmar o enfileiramento.
