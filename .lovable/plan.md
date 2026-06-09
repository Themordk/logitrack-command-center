
# Correções — Novo Inventário (`src/pages/NovoInventarioPage.tsx`)

## Diagnóstico

Investiguei as RPCs no banco. As duas causas são independentes:

### 1) Inventário criado sem itens (root cause)
`fn_criar_inventario_v2` e `fn_gerar_tarefas_inventario` retornam `json` no formato `{ sucesso: boolean, codigo?: string, ... }`. **Não lançam exceção** — o `supabase.rpc().error` continua `null` mesmo quando a operação falha.

No código atual:
- `handleSave` só verifica `error`; quando o JSON traz `sucesso:false` (ex.: `TIPO_TAREFA_NAO_CONFIGURADO`, `ESCOPO_*_OBRIGATORIO`, `INVENTARIO_STATUS_INVALIDO`), o campo `inventario_id` ainda existe na criação, então passa.
- No loop de geração, quando `fn_gerar_tarefas_inventario` retorna `{sucesso:false, codigo:'TIPO_TAREFA_NAO_CONFIGURADO'}`, `g.tarefas_geradas` é `undefined` → `Number(undefined)=NaN` e `g.finalizado=undefined→false`. O loop roda 1000x silenciosamente, sai pelo `safety`, dispara `toast.success` e navega para um inventário vazio.

Cenário muito provável no print do usuário: não há registro em `inventario_tipo_tarefa` para o `tipo_execucao` AUDITORIA daquele tenant, e o erro nunca é mostrado.

### 2) Resumo (Total Endereços / Total SKUs) sempre 0
O painel lateral está com valores **hardcoded em 0**. Não existe nenhum `useEffect`/query que calcule a prévia ao trocar tipo/escopo. Não há RPC de prévia no backend — precisa ser calculado no client a partir de `estoque_geral` + `endereco` (já há filtros equivalentes aos usados pela `fn_gerar_tarefas_inventario`).

---

## Mudanças

Edição única em `src/pages/NovoInventarioPage.tsx` (sem migrations, sem novos arquivos).

### A. Tratar `sucesso:false` nas RPCs
Helper local:
```ts
const unwrap = (data: any) => {
  const j = Array.isArray(data) ? data[0] : data;
  if (j && j.sucesso === false) {
    const code = j.codigo || "ERRO_DESCONHECIDO";
    throw new Error(code);
  }
  return j;
};
```
Aplicar em ambas chamadas:
- `const inv = unwrap(data);` após `fn_criar_inventario_v2`.
- `const g = unwrap(gen);` dentro do loop; sair se `g.sucesso===false`.

Expandir `ERROR_MAP` com `INVENTARIO_NAO_ENCONTRADO`, `INVENTARIO_STATUS_INVALIDO`, `ERRO_DESCONHECIDO`. `mapError` já cobre via `includes`.

Como `fn_gerar_tarefas_inventario` agora vai lançar, se a primeira chamada retornar `TIPO_TAREFA_NAO_CONFIGURADO` o usuário verá toast destrutivo e a navegação **não** acontece.

### B. Quebra de segurança extra no loop
Trocar `safety=1000` por `safety=500` e, se `g.tarefas_geradas === 0 && !g.finalizado`, abortar com `Error("LOOP_SEM_PROGRESSO")` — evita silenciar bugs futuros.

### C. Prévia de Endereços/SKUs no Resumo
Novo `useEffect` que dispara sempre que `tipo`, escopo selecionado ou `armazemId`/`empresaId` mudam. Estado:
```ts
const [resumo, setResumo] = useState({ enderecos: 0, skus: 0, loading: false });
```
Para cada tipo, montar query em `estoque_geral` filtrada por `tenant_id+empresa_id+armazem_id` (join com `endereco` quando necessário para `armazem_id` e situação ≠ `BLOQUEADO_INVENTARIO`):

| Tipo | Filtro adicional | Cálculo |
|---|---|---|
| `GERAL` | nenhum | distinct endereco_id, distinct produto_id |
| `ZONA` | `endereco_zona_atividade.zona_atividade_id = zonaId` | idem |
| `ENDERECO` | `endereco_id = enderecoId` | enderecos=1, distinct produto_id |
| `PRODUTO` | `produto_id = produtoId` | distinct endereco_id, skus=1 |
| `GRUPO_PRODUTO` | `produto.grupo_id = grupoId` (sub-select) | distinct endereco_id, distinct produto_id |
| `ROTATIVO` | curva/cortes/estornos espelhando a RPC | distinct endereco_id, distinct produto_id |

Estratégia simples e suficiente para o volume de prévia: buscar até 2000 linhas com `select('endereco_id, produto_id')` aplicando os filtros e calcular cardinalidade no JS via `new Set()`. Quando atingir 2000, exibir `2000+`. Para PRODUTO/ENDERECO (escopo já único), a query é trivial.

Debounce de 250ms no efeito; cancelar com flag `cancelled` no cleanup. Mostrar `Loader2` no número enquanto carrega.

Substituir os `<span>0</span>` do painel pelos valores de `resumo`.

### D. (Opcional defensivo) Pré-checar `inventario_tipo_tarefa`
Antes de chamar `fn_criar_inventario_v2`, fazer `select('id').from('inventario_tipo_tarefa').eq('tenant_id', tenantId).eq('tipo_execucao', tipoExecucao).maybeSingle()` — se vazio, toast com mensagem amigável e abortar. Evita criar um inventário "CRIADO" que nunca sai do status por falta de configuração.

---

## Validação após implementar

1. Selecionar **Por Produto** + produto válido → Resumo mostra `Total Endereços: N` (contagem real em `estoque_geral`) e `Total SKUs: 1`.
2. Selecionar **Geral** → Resumo carrega contagem (com `+` se >2000).
3. Clicar **Criar Inventário** sem `inventario_tipo_tarefa` configurado → toast destrutivo "Tipo de execução não configurado…", **não navega**, não cria inventário órfão.
4. Com configuração ok → inventário criado com itens, loop progride, navega para detalhe.

## Arquivos afetados
- `src/pages/NovoInventarioPage.tsx` (única edição)

Sem alterações em backend, migrations, outros serviços ou rotas.
