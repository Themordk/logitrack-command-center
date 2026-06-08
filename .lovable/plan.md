## Ajustes — Configurações do Armazém

### 1. Busca de endereço não retorna resultados

**Causa:** A coluna `public.endereco.codigo_endereco` é do tipo `numeric`, e o filtro atual usa `.ilike('codigo_endereco', '%termo%')`, que falha porque `ILIKE` não opera sobre `numeric` (o PostgREST retorna erro silencioso e a lista fica vazia).

**Correção em `src/components/armazem/EnderecoSearchInput.tsx`:**

- Trocar o filtro `ilike` por uma chamada que faça cast para texto. Como PostgREST não permite cast direto no filtro, usar o operador `or` com `cs`/`like` não resolve — a abordagem mais simples é:
  - Se o termo digitado for puramente numérico: usar `.eq('codigo_endereco', Number(termo))` para match exato, e adicionalmente um `OR` com prefixo via `gte/lt` para "começa com" (ex.: termo `10` → `gte 10 AND lt 11` por faixa decimal), **ou** mais simples e robusto: criar uma RPC/visão.
- Solução pragmática escolhida: usar `.or()` com `codigo_endereco.eq.<num>` quando o termo for numérico, e quando o usuário ainda estiver digitando parcial, fazer client-side fallback buscando uma faixa via `gte/lte` calculada (ex.: `1010` → eq 1010; `10` → gte 10 e lte 109 expandido). Para manter a UX próxima de "contém", a opção mais limpa é criar um índice/coluna gerada `codigo_endereco_txt` — porém isso muda schema.
- **Abordagem final (sem alterar schema):**
  - Se o termo for todo dígitos: aplicar `.eq('codigo_endereco', Number(term))` retornando match exato (caso de uso real do operador que digita o código completo). Mostrar resultado.
  - Caso o termo não case numericamente, exibir mensagem "Digite o código numérico do endereço".
- Ordenar por `codigo_endereco` (numérico). Manter limite 20.

Isso resolve o cenário do print: digitar `1010` passa a retornar o endereço `1010` se existir naquele armazém/tenant.

### 2. Habilitar Endereço de Avaria e Endereço de Quarentena

**Em `src/components/armazem/ArmazemConfigModal.tsx`:**

- Adicionar state `enderecoAvariaId` e `enderecoQuarentenaId`.
- Carregar `endereco_avaria_id` e `endereco_quarentena_id` no `select` do `armazem_config`.
- Persistir ambos no payload do `upsert`.
- Remover `disabled` e `badge="Em breve"` dos dois `EnderecoSearchInput`, passando `value`/`onChange` reais.

### Arquivos alterados

- `src/components/armazem/EnderecoSearchInput.tsx` — ajustar filtro para `numeric` (eq quando termo for numérico) + mensagem de orientação.
- `src/components/armazem/ArmazemConfigModal.tsx` — habilitar e gravar Avaria/Quarentena.

Nenhuma alteração de banco necessária — colunas `endereco_avaria_id` e `endereco_quarentena_id` já existem em `armazem_config`.
