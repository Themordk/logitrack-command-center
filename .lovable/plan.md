## Problema

Em `src/pages/RoteiroSeparacaoPage.tsx` (linhas 108–112), a consulta usa embed `setor!inner(armazem_id)` para descobrir as ruas do armazém selecionado. Como não existe foreign key entre `endereco` e `setor` (restrição documentada no memory `mem://constraints/database-schema-limitations`), o PostgREST devolve `PGRST200` e a tela não lista ruas.

## Correção

A tabela `endereco` já possui a coluna `armazem_id`. O join por `setor` é desnecessário — basta filtrar diretamente por `armazem_id`.

Trocar em `src/pages/RoteiroSeparacaoPage.tsx`:

```ts
.from("endereco")
.select("rua, setor!inner(armazem_id)")
.eq("tenant_id", tenantId)
.eq("setor.armazem_id", filtroArmazemId)
.not("rua", "is", null);
```

por:

```ts
.from("endereco")
.select("rua")
.eq("tenant_id", tenantId)
.eq("armazem_id", filtroArmazemId)
.not("rua", "is", null);
```

O restante do fluxo (dedupe + ordenação de `ruasDisponiveis`) permanece igual.

## Validação

- Abrir `/armazem/roteiro-separacao`, selecionar um armazém e confirmar que a lista de ruas é carregada sem erro no console/network.
- Nenhuma outra tela usa esse padrão de embed com `setor`.
