# Motor de Retorno ao ERP — contrato do backend para o frontend

> Fonte da verdade para as telas do Motor de Retorno. O backend já está em produção (Fases 0 e 1).
> **Não crie, altere ou remova nada no banco, nas migrations ou nas Edge Functions.** O frontend só consome o que está aqui.

## 1. Regras gerais

- Todas as chamadas são RPCs `public.integracao_retorno_*` ou a Edge Function `retorno-dispatcher`.
- O schema `integracao` **não** é acessível pelo app: nunca use `supabase.from(...)` nessas tabelas.
- As RPCs ainda **não estão** em `src/integrations/supabase/types.ts`. Use um único helper com cast em
  `src/pages/integracao/retornos/retornosService.ts` (mesmo padrão de `produtoPadroesService.ts`).
- Toda RPC que recebe `p_tenant_id`/`p_empresa_id` usa `useTenant()`; nunca hardcode ids.
- Permissão: módulo **`web.config.integracao`** — `READ` para ver, `UPDATE` para editar/testar/publicar/reprocessar.
  O backend revalida e devolve `RETORNO_SEM_PERMISSAO` / `RETORNO_ACESSO_NEGADO`.
- Retornos são `jsonb`: objetos/arrays já prontos para tipar.
- Datas chegam em ISO UTC; exiba com `src/utils/dateTime.ts` (`formatDateTime`) e `relativeTime()` de `pages/integracao/StatusBar.tsx`.

## 2. RPCs

### Configuração e catálogo
| RPC | Parâmetros | Retorno |
|---|---|---|
| `integracao_retorno_catalogo` | — | `Catalogo` (§3.1) |
| `integracao_retorno_config` | `p_tenant_id, p_empresa_id` | `{ motor: 'legado'\|'fluxos', fluxos_ativos, execucoes_24h: Record<StatusExecucao, number>, pendentes, erros_abertos, destinos_pausados, eventos_com_erro_24h, ultima_execucao_em }` |
| `integracao_retorno_definir_motor` | `p_tenant_id, p_empresa_id, p_motor` | o mesmo objeto de `config` |
| `integracao_retorno_pode_editar` | `p_tenant_id, p_empresa_id` | `boolean` |

### Destinos
| RPC | Parâmetros | Retorno |
|---|---|---|
| `integracao_retorno_listar_destinos` | `p_tenant_id, p_empresa_id` | `Destino[]` (§3.2) |
| `integracao_retorno_salvar_destino` | `p_tenant_id, p_empresa_id, p_destino jsonb, p_segredo text\|null, p_remover_segredo boolean` | `{ id, tem_segredo }` |

`p_destino`: `{ id?, nome, modo: 'http'|'webhook', metodo, url_base, auth_tipo, auth_config, headers, timeout_ms, max_tentativas, limite_falhas, ativo, erp_provedor_id?, reativar? }`.
- Sem exclusão: "remover" = `ativo:false`.
- `modo: 'webhook'` sempre grava `metodo = 'POST'`, porque o envelope assinado precisa de corpo. Esconda o campo Método nesse modo.
- `modo: 'webhook'` exige `auth_tipo: 'hmac'` (o envelope é sempre assinado). Outro tipo → `RETORNO_DESTINO_WEBHOOK_HMAC`. No formulário, trave a autenticação em HMAC nesse modo.
- `p_segredo` vazio/null **mantém** o segredo atual. `p_remover_segredo:true` apaga.
- Salvar um destino pausado o reativa (zera falhas), a não ser que `reativar:false`.
- Regras do backend: `url_base` https e host público; headers não podem conter `Authorization`, `X-API-Key`, `Cookie`, `Proxy-Authorization`; `auth_tipo` ≠ `nenhuma` exige segredo.
- `auth_config` por tipo: `api_key` → `{ header: "X-API-Key" }` **ou** `{ query: "chave" }`; `basic` → `{ usuario }`; `bearer`/`hmac`/`nenhuma` → `{}`.

### De-para
| RPC | Parâmetros | Retorno |
|---|---|---|
| `integracao_retorno_listar_mapa` | `p_tenant_id, p_empresa_id, p_fluxo_id uuid\|null` | `{ id, fluxo_id, dominio, valor_wms, valor_erp }[]` — `fluxo_id null` = da empresa; com `p_fluxo_id` vêm os da empresa **e** os do fluxo |
| `integracao_retorno_salvar_mapa` | `p_tenant_id, p_empresa_id, p_fluxo_id\|null, p_dominio, p_itens [{valor_wms, valor_erp}]` | lista atualizada |

`salvar_mapa` recebe a **lista inteira** do domínio; itens que saem da lista são inativados. Na execução, o item do fluxo vence o da empresa; sem correspondência, o valor original passa sem tradução.

### Fluxos
| RPC | Parâmetros | Retorno |
|---|---|---|
| `integracao_retorno_listar_fluxos` | `p_tenant_id, p_empresa_id, p_incluir_arquivados` | `FluxoResumo[]` (§3.3) |
| `integracao_retorno_obter_fluxo` | `p_fluxo_id` | `FluxoCompleto` |
| `integracao_retorno_salvar_fluxo` | `p_tenant_id, p_empresa_id, p_fluxo { id?, nome, descricao?, erp_provedor_id?, definicao, updated_at_esperado? }` | `FluxoCompleto` (cria se sem `id`; grava só o **rascunho**). **Sempre envie `nome` e `definicao` completos**: sem `definicao` o rascunho vira vazio. Com `updated_at_esperado` (o `updated_at` da última resposta), recusa com `RETORNO_FLUXO_CONFLITO` se o fluxo mudou em outro lugar. |
| `integracao_retorno_validar_fluxo` | `p_tenant_id, p_empresa_id, p_definicao` | `Validacao` (§3.4) |
| `integracao_retorno_publicar_fluxo` | `p_fluxo_id, p_ativar boolean` | `FluxoCompleto & { validacao }` — valida, cria nova versão e copia rascunho → publicado |
| `integracao_retorno_ativar_fluxo` | `p_fluxo_id, p_ativo` | `FluxoResumo` (exige versão publicada) |
| `integracao_retorno_arquivar_fluxo` | `p_fluxo_id, p_arquivar` | `FluxoResumo` (arquivar desativa; desarquivar não reativa) |
| `integracao_retorno_versoes_fluxo` | `p_fluxo_id` | `{ versao, publicado_em, publicado_por (nome), definicao, atual }[]` (mais nova primeiro) |
| `integracao_retorno_restaurar_versao` | `p_fluxo_id, p_versao` | `FluxoCompleto` (copia a versão para o **rascunho**; não publica) |

### Documentos (dados de teste e contexto)
| RPC | Parâmetros | Retorno |
|---|---|---|
| `integracao_retorno_documentos_recentes` | `p_tenant_id, p_empresa_id, p_evento, p_filtros jsonb, p_combinador 'e'\|'ou', p_limite, p_busca text\|null` | `{ documento_id, movimento_id, entidade, numero, tipo, codigo_erp, sistema_origem, quando, passa_filtro, barrado_por, contexto }[]` |
| `integracao_retorno_contexto_documento` | `p_tenant_id, p_empresa_id, p_entidade, p_documento_id, p_evento\|null` | `Contexto` (§3.6) |

- `barrado_por` é uma **string**: o `campo` da primeira regra que o documento não atende (ex.: `"documento.codigo_erp"`), ou `null`. Mostre-o só quando `passa_filtro === false`. Com combinador `ou`, o documento pode passar e ainda trazer `barrado_por`.
- Sem `p_filtros` (null), `passa_filtro` vem `null`, e não `true`.
- `p_busca` é **igualdade exata** com o número do documento (pedido ou nota) ou com o `codigo_erp`. Não é busca parcial.
- `p_limite` vai até 50.
- Os eventos `manual.*` listam qualquer documento da empresa (exceto excluídos), do mais recente para o mais antigo.

### Execuções
| RPC | Parâmetros | Retorno |
|---|---|---|
| `integracao_retorno_listar_execucoes` | `p_tenant_id, p_empresa_id, p_filtros, p_limite (≤200), p_offset` | `{ total, itens: ExecucaoResumo[] }` |
| `integracao_retorno_obter_execucao` | `p_execucao_id` | `ExecucaoDetalhe` (§3.5) |
| `integracao_retorno_execucoes_documento` | `p_tenant_id, p_empresa_id, p_entidade, p_documento_id` | `ExecucaoResumo[]` (inclui lotes que contêm o documento) |
| `integracao_retorno_executar` | `p_fluxo_id, p_documento_id, p_modo 'manual'\|'teste'\|'simulacao', p_usar_rascunho` | `{ execucao_id, status: 'pendente'\|'filtrado', modo, evento }` |
| `integracao_retorno_reprocessar` | `p_execucao_id, p_a_partir_no text\|null` | `ExecucaoResumo` |
| `integracao_retorno_descartar` | `p_execucao_id, p_motivo` | `ExecucaoResumo` |

- `p_filtros` de `listar_execucoes`: `{ fluxo_id?, status?: string | string[], documento_id?, modo?, de?, ate?, busca? }`. `de`/`ate` são ISO e `busca` procura no número do documento.
- `executar`:
  - `manual` usa a versão publicada e entra na fila normal.
  - `teste` **envia de verdade** ao ERP, mas não altera o documento nem cria notificação.
  - `simulacao` não envia nada.
  - `usar_rascunho:true` só vale para `teste` e `simulacao`.
- `reprocessar` sem nó recomeça do nó que falhou. Para execuções em `sucesso` ou `filtrado`, o nó é obrigatório.
- `descartar` só vale para status `pendente`, `aguardando_retry`, `erro` e `agrupando`.

### Edge Function `retorno-dispatcher` (JWT do usuário, via `supabase.functions.invoke`)
| body | Resposta |
|---|---|
| `{ acao: "executar", execucao_id }` | `{ execucao_id, executado: boolean, status?, passos?, erro?, motivo?, detalhe?: ExecucaoDetalhe }` — roda na hora uma execução `pendente` (sem esperar o agendador de 10 s) |
| `{ acao: "testar_destino", destino_id }` | `{ ok, http_status?, duracao_ms, resposta?, erro?, request? }` — envia um ping assinado ao destino |

Sem a chamada à Edge Function, o agendador processa a fila em até ~10 s. Depois de `executar`/`reprocessar`, chame `acao:"executar"` para resposta imediata e, se `executado:false`, faça polling de `obter_execucao` a cada 2 s (máx. 30 s).

## 3. Tipos

### 3.1 Catálogo
```ts
type Catalogo = {
  eventos: { codigo: string; entidade: 'documento_entrada'|'documento_saida'; nome: string; descricao: string|null; manual: boolean }[];
  nos: { tipo: TipoNo; grupo: 'gatilho'|'logica'|'dados'|'acao'; nome: string; descricao: string; saidas: string[]; config_exemplo: object; disponivel: boolean }[];
  operadores: { codigo: Operador; nome: string }[];
  operacoes_provedor: { provedor: 'omie'; operacao: string; entidade: string; nome: string; parametros: Record<string,string> }[];
  auth_tipos: ('nenhuma'|'api_key'|'bearer'|'basic'|'hmac')[];
  limites: { max_nos: 20; timeout_ms_max: 60000; max_tentativas: 10 };
};
type TipoNo = 'gatilho.evento'|'gatilho.manual'|'logica.condicao'|'logica.aguardar'|'logica.dividir_itens'
  |'dados.payload'|'acao.http'|'acao.webhook'|'acao.provedor'|'acao.atualizar_documento'|'acao.notificar';
type Operador = 'igual'|'diferente'|'contem'|'em'|'nao_em'|'maior'|'maior_igual'|'menor'|'menor_igual'|'existe'|'nao_existe';
```

Eventos:
- **Entrada:** `entrada.recebimento_liberado`, `conferencia_iniciada`, `conferencia_finalizada`, `divergencia`, `armazenagem_finalizada`, `movimento_cancelado`, `documento_cancelado`.
- **Saída:** `saida.onda_liberada`, `separacao_iniciada`, `separacao_finalizada`, `conferencia_finalizada`, `carregamento_iniciado`, `expedido`, `onda_cancelada`, `documento_cancelado`.
- **Manuais:** `manual.documento_entrada`, `manual.documento_saida`. São usados só pelo gatilho Manual.

`logica.dividir_itens` vem com `disponivel:false`: mostre na paleta como "Em breve", não arrastável.

### 3.2 Destino
```ts
type Destino = { id; nome; erp_provedor_id: string|null; modo: 'http'|'webhook'; metodo; url_base;
  auth_tipo; auth_config: object; tem_segredo: boolean; headers: Record<string,string>; timeout_ms; max_tentativas;
  limite_falhas; falhas_consecutivas; pausado_em: string|null; pausado_motivo: string|null;
  ultimo_sucesso_em: string|null; ultimo_erro_em: string|null; ativo: boolean; updated_at; fluxos_usando: number };
```
O segredo **nunca** volta para o frontend.

### 3.3 Fluxo
```ts
type FluxoResumo = { id; nome; descricao; erp_provedor_id; evento: string|null; evento_nome: string|null;
  modo_ativacao: 'imediato'|'agrupado'|'manual'|null; agrupamento: {intervalo_minutos?:number; max_documentos?:number}|null;
  versao_publicada: number|null; publicado_em; ativo: boolean; arquivado_em; updated_at; created_at;
  status: 'rascunho'|'publicado'|'pausado'|'arquivado'; alteracoes_nao_publicadas: boolean;
  execucoes_24h: Partial<Record<StatusExecucao, number>>; ultima_execucao_em: string|null };
// evento/evento_nome/modo_ativacao/agrupamento: da versão publicada; se o fluxo nunca foi publicado, lidos do gatilho do rascunho.
type FluxoCompleto = FluxoResumo & { definicao_rascunho: Definicao; definicao_publicada: Definicao|null; validacao_rascunho: Validacao };

type Definicao = { versao_schema: 1; nos: No[]; ligacoes: Ligacao[] };
type No = { id: string; tipo: TipoNo; nome?: string; posicao?: { x: number; y: number }; config: object };
type Ligacao = { de: string; para: string; saida?: string /* 'principal' por padrão */ };
```

**Saídas por tipo:**
- gatilhos, aguardar, payload, atualizar documento e notificar: `principal`
- condição: `verdadeiro` e `falso`
- http, webhook e provedor: `sucesso` e `erro`

**Regras do grafo** (o backend valida; o editor deve impedir antes):
- exatamente 1 gatilho;
- no máximo 20 nós;
- sem ciclos;
- nada liga de volta ao gatilho;
- cada saída de um nó liga a **no máximo um** destino;
- um nó pode receber várias entradas;
- ids únicos.

**`config` por tipo:**
| tipo | config |
|---|---|
| `gatilho.evento` | `{ evento, filtros: Regra[], combinador: 'e'\|'ou', modo: 'imediato'\|'agrupado', agrupamento?: { intervalo_minutos (1–1440), max_documentos (1–1000) } }` |
| `gatilho.manual` | `{ entidade: 'documento_entrada'\|'documento_saida', filtros: Regra[], combinador }` |
| `logica.condicao` | `{ regras: Regra[] (≥1), combinador }` |
| `logica.aguardar` | `{ minutos: 1–1440 }` |
| `dados.payload` | `{ modo: 'jsonata', expressao }` ou `{ modo: 'mapeamento', campos: CampoMapeado[] }` |
| `acao.http` | `{ destino_id, metodo?: GET\|POST\|PUT\|PATCH\|DELETE, caminho?: string, corpo_de?: id do nó payload, headers?: Record<string,string> }` |
| `acao.webhook` | `{ destino_id, caminho? }` — corpo = envelope `{id, evento, ocorrido_em, tentativa, dados}` assinado (`X-LogiTrack-Signature: sha256=HMAC(segredo, "<timestamp>.<corpo>")`, `X-LogiTrack-Timestamp`) |
| `acao.provedor` | `{ provedor: 'omie', operacao, parametros: { etapa? } }` — a operação deve combinar com a entidade do gatilho |
| `acao.atualizar_documento` | `{ status_integracao: string, marcar_exportado: boolean }` |
| `acao.notificar` | `{ titulo, mensagem, cor: 'red'\|'orange'\|'blue'\|'green' }` |

```ts
type Regra = { campo: string /* caminho no contexto, ex. documento.tipo.codigo_erp */; operador: Operador; valor?: string|number|boolean|string[] };
type CampoMapeado = { campo: string; tipo?: 'caminho'|'fixo'|'expressao'|'lista'|'objeto'; valor?: unknown;
  dominio?: string /* aplica de-para */; campos?: CampoMapeado[]; formato?: 'texto'|'numero'|'inteiro'|'booleano' };
```

**Templates `{{caminho}}`:**
- Funcionam em `caminho`, headers, `titulo`, `mensagem` e `status_integracao`.
- Exemplos: `{{documento.numero}}`, `{{documento.codigo_erp}}`.
- `erro.mensagem` e `erro.http_status` existem depois de um ramo `erro`.
- `saidas.<idDoNó>.corpo` traz a resposta de um nó HTTP anterior.

**Mapeamento:**
- Dentro de `lista`, os caminhos são relativos ao item; `$raiz.` volta à raiz.
- No JSONata, `$mapa(dominio, valor)` aplica o de-para, `$raiz` é o contexto, `$agora()` dá a data atual e `$formatar(valor, formato)` aplica o mesmo formato do mapeamento (use-o na conversão mapeamento → JSONata).
- `modo` ausente = JSONata.
- Formatos: `numero`/`inteiro` aceitam vírgula decimal; vazio ou inválido vira `null`. `booleano`: `true`, `1`, `sim`, `s` (sem diferenciar maiúsculas) = true; o resto = false. `texto` de objeto = JSON.
- De-para sem correspondência devolve o valor como veio (número continua número). De-para e formato não se aplicam a `lista`/`objeto`.
- Caminho com espaços nas pontas é aparado; `$raiz` sozinho devolve o contexto inteiro; `lista` sobre algo que não é lista vira `[]`; expressão vazia vira `null`.
- **Prévia no front:** `src/pages/integracao/retornos/editor/motorPrevia.ts` é cópia fiel do `motor.ts` do servidor e não se edita à mão. O teste `motorPrevia.paridade.test.ts` compara com resultados gerados pelo servidor.

### 3.4 Validação
```ts
type Validacao = { valido: boolean; erros: Aviso[]; avisos: Aviso[];
  gatilho: { id; tipo; evento; entidade; modo: 'imediato'|'agrupado'|'manual'; agrupamento } | null };
type Aviso = { codigo: string; mensagem: string /* pt-BR, exibir como veio */; no_id?: string };
```

- **Erros:**
  - estrutura: `FLUXO_VAZIO`, `LIMITE_NOS`, `NO_SEM_ID`, `NO_ID_DUPLICADO`, `NO_TIPO_INVALIDO`, `NO_INDISPONIVEL`;
  - gatilho: `GATILHO_UNICO`, `GATILHO_EVENTO_INVALIDO`, `GATILHO_MODO_INVALIDO`, `AGRUPAMENTO_INVALIDO`, `GATILHO_ENTIDADE_INVALIDA`;
  - configuração dos nós: `REGRA_INVALIDA`, `CONDICAO_SEM_REGRA`, `AGUARDAR_INVALIDO`, `PAYLOAD_INVALIDO`, `DESTINO_INVALIDO`, `METODO_INVALIDO`, `CORPO_DE_INVALIDO`, `PROVEDOR_OPERACAO_INVALIDA`, `PROVEDOR_ENTIDADE_INCOMPATIVEL`, `NOTIFICAR_SEM_TITULO`;
  - ligações: `LIGACAO_INVALIDA`, `LIGACAO_PARA_GATILHO`, `SAIDA_INVALIDA`, `SAIDA_DUPLICADA`, `CICLO`.
- **Avisos:** `NO_DESCONECTADO`, `GATILHO_SEM_SAIDA`, `PROVEDOR_SEM_CONEXAO`, `MOTOR_LEGADO_ATIVO`, `HTTP_SEM_PAYLOAD`.

### 3.5 Execução
```ts
type StatusExecucao = 'agrupando'|'agrupado'|'pendente'|'executando'|'aguardando_retry'|'sucesso'|'erro'|'filtrado'|'descartado';
type ModoExecucao = 'automatico'|'manual'|'teste'|'simulacao'|'lote';
type ExecucaoResumo = { id; fluxo_id; fluxo_nome; fluxo_versao: number|null; evento; entidade; documento_id: string|null;
  documento_numero: string /* num lote: "N documento(s)" */; modo: ModoExecucao; status: StatusExecucao; proximo_no;
  tentativas_no; processar_apos; iniciado_em; finalizado_em; erro: string|null; erro_http_status: number|null;
  disparado_por: string; lote_execucao_id: string|null; created_at; updated_at; duracao_ms: number|null;
  caminho: { no_id: string; status: StatusPasso; saida: string|null }[] };
type ExecucaoDetalhe = ExecucaoResumo & { contexto: Contexto; estado: object; definicao: Definicao;
  membros_lote: { id; documento_id; documento_numero }[]; passos: Passo[] };
type StatusPasso = 'sucesso'|'erro'|'retry'|'simulado'|'filtrado';
type Passo = { id; seq: number /* ORDENE POR seq */; no_id; no_tipo; tentativa; status: StatusPasso; saida: string|null;
  entrada; resultado; request: { metodo; url; headers: Record<string,string>; corpo: string|null } | null;
  response: { status: number; corpo: string|null; json: unknown } | null; http_status: number|null; duracao_ms: number|null; erro: string|null; created_at };
```

- Headers sensíveis já chegam como `***`.
- Um mesmo nó pode aparecer várias vezes, uma por tentativa.
- Um documento travado atrás de um erro do mesmo fluxo fica em `pendente` até o erro ser reprocessado ou descartado.

### 3.6 Contexto (o que os nós enxergam)

Campos comuns:
- `versao_contexto`, `evento`, `evento_nome`, `ocorrido_em` (horário de Fortaleza), `ocorrido_em_utc`
- `empresa { id, codigo, cnpj, razao_social }`, `operador { id, nome, login }`
- `documento { id, direcao, numero, codigo_erp, id_externo, sistema_origem, status_wms, status_integracao, data_emissao, valor, tipo { id, descricao, codigo_erp }, … }`
- `parceiro { id, codigo_erp, codigo_erp_omie, documento, razao_social, nome_fantasia, cidade, estado }`
- `movimento { id, numero, status, finalizado_em, … }`

Saída:
- `itens[] { id, codigo_erp, produto { id, sku, codigo_erp, codigo_erp_pedido, descricao }, unidade, quantidade_erp, qtd_solicitada, qtd_atendida, qtd_cortada, valor_unitario, lotes[] }`
- `volumes[]`, `totais { itens, qtd_solicitada, qtd_atendida, qtd_cortada, volumes }`, `tem_corte`

Entrada:
- `itens[] { …, qtd_esperada, qtd_conferida, qtd_divergente, qtd_armazenada }`
- `totais`, `tem_divergencia`

Lote (modo agrupado):
- `{ lote: true, quantidade, documentos: Contexto[] }`

## 4. Erros de negócio (adicionar em `BUSINESS_ERROR_MAP` de `src/lib/errorMapper.ts`)

O errorMapper casa **por substring** e na ordem do objeto. Por isso, declare os códigos mais longos antes dos que são prefixo deles: `RETORNO_DESTINO_NAO_ENCONTRADO` antes de `RETORNO_DESTINO_*`, e `RETORNO_FLUXO_NAO_PUBLICADO` antes de `RETORNO_FLUXO_*`.

| Código | Título | Instrução |
|---|---|---|
| RETORNO_SEM_PERMISSAO | Você não tem permissão para alterar os retornos ao ERP. | Peça acesso de edição em Integração ao administrador. |
| RETORNO_ACESSO_NEGADO | Acesso negado a esta empresa. | Confira a empresa selecionada. |
| RETORNO_NAO_AUTENTICADO | Sua sessão expirou. | Entre novamente. |
| RETORNO_EMPRESA_INVALIDA | Empresa inválida para este tenant. | Selecione outra empresa. |
| RETORNO_PARAMETROS | Empresa não selecionada. | Selecione uma empresa. |
| RETORNO_DESTINO_NAO_ENCONTRADO | Destino não encontrado. | Atualize a lista. |
| RETORNO_DESTINO_URL | URL inválida. | Use https:// e um endereço público. |
| RETORNO_DESTINO_HEADER_SECRETO | Credencial em header não é permitida. | Use o campo Autenticação. |
| RETORNO_DESTINO_SEM_SEGREDO | Falta o segredo da autenticação. | Informe o token, chave ou senha. |
| RETORNO_DESTINO_WEBHOOK_HMAC | O webhook LogiTrack precisa da autenticação HMAC. | Escolha HMAC e informe o segredo. |
| RETORNO_DESTINO_NOME | Informe o nome do destino. | — |
| RETORNO_DESTINO_JSON | Headers inválidos. | Revise os headers. |
| RETORNO_FLUXO_NAO_ENCONTRADO | Fluxo não encontrado. | Atualize a lista. |
| RETORNO_FLUXO_NAO_PUBLICADO | Este fluxo ainda não foi publicado. | Publique antes de ativar ou executar. |
| RETORNO_FLUXO_ARQUIVADO | Fluxo arquivado. | Desarquive para editar. |
| RETORNO_FLUXO_INVALIDO | O fluxo tem erros. | Corrija os itens marcados no canvas. |
| RETORNO_FLUXO_NOME | Informe o nome do fluxo. | — |
| RETORNO_FLUXO_GRANDE | Fluxo grande demais. | Reduza nós ou o payload. |
| RETORNO_FLUXO_CONFLITO | Este fluxo foi alterado em outra aba ou por outra pessoa. | Recarregue ou mantenha a sua versão. |
| RETORNO_FLUXO_DEFINICAO | Definição do fluxo inválida. | Recarregue o editor. |
| RETORNO_MANUAL_RASCUNHO | Execução manual usa a versão publicada. | Use Testar ou Simular para o rascunho. |
| RETORNO_DOCUMENTO_NAO_ENCONTRADO | Documento não encontrado nesta empresa. | Escolha outro documento. |
| RETORNO_EXECUCAO_NAO_ENCONTRADA | Execução não encontrada. | Atualize a lista. |
| RETORNO_EXECUCAO_EM_ANDAMENTO | A execução ainda está em andamento. | Aguarde terminar. |
| RETORNO_DESCARTE_INVALIDO | Esta execução não pode ser descartada. | Só pendentes ou com erro. |
| RETORNO_REPROCESSAR_NO | Escolha o nó de onde recomeçar. | — |
| RETORNO_NO_INEXISTENTE | Nó não existe nesta versão do fluxo. | Escolha outro nó. |
| RETORNO_VERSAO_NAO_ENCONTRADA | Versão não encontrada. | Atualize o histórico. |
| RETORNO_MAPA_INVALIDO | De-para inválido. | Revise o domínio e os valores. |
| RETORNO_MOTOR_INVALIDO | Motor inválido. | — |
| RETORNO_MODO_INVALIDO | Modo de execução inválido. | — |
| RETORNO_EVENTO_INVALIDO | Evento inválido. | Escolha um evento do catálogo. |
| RETORNO_ENTIDADE_INVALIDA | Tipo de documento inválido. | Use documento de entrada ou de saída. |

Erros da Edge Function (`supabase.functions.invoke`) chegam como `FunctionsHttpError` com mensagem genérica. Leia o corpo com `await error.context.json()` para obter `{ erro, codigo }` e mostre o campo `erro`. Os códigos possíveis são `JWT`, `SEM_PERMISSAO`, `SEM_ACESSO`, `DESTINO` e `INTERNO`.

## 5. Exemplo de definição (o fluxo Omie em produção)
```json
{ "versao_schema": 1,
  "nos": [
    { "id": "g", "tipo": "gatilho.evento", "nome": "Pedido expedido", "posicao": {"x":0,"y":120},
      "config": { "evento": "saida.expedido", "modo": "imediato", "combinador": "e",
                  "filtros": [{ "campo": "documento.codigo_erp", "operador": "existe" }] } },
    { "id": "c", "tipo": "logica.condicao", "nome": "Teve corte?", "posicao": {"x":280,"y":120},
      "config": { "combinador": "e", "regras": [{ "campo": "tem_corte", "operador": "igual", "valor": true }] } },
    { "id": "k", "tipo": "acao.provedor", "nome": "Omie: ajustar cortes", "posicao": {"x":540,"y":0},
      "config": { "provedor": "omie", "operacao": "ajustar_cortes_pedido", "parametros": {} } },
    { "id": "t", "tipo": "acao.provedor", "nome": "Omie: etapa 40", "posicao": {"x":800,"y":120},
      "config": { "provedor": "omie", "operacao": "trocar_etapa_pedido", "parametros": { "etapa": "40" } } },
    { "id": "u", "tipo": "acao.atualizar_documento", "nome": "Marcar retornado", "posicao": {"x":1060,"y":60},
      "config": { "status_integracao": "retornado_erp", "marcar_exportado": true } },
    { "id": "n", "tipo": "acao.notificar", "nome": "Avisar falha", "posicao": {"x":1060,"y":260},
      "config": { "titulo": "Falha no retorno ao Omie — pedido {{documento.numero}}", "mensagem": "{{erro.mensagem}}", "cor": "red" } }
  ],
  "ligacoes": [
    { "de": "g", "para": "c" }, { "de": "c", "para": "k", "saida": "verdadeiro" }, { "de": "c", "para": "t", "saida": "falso" },
    { "de": "k", "para": "t", "saida": "sucesso" }, { "de": "k", "para": "n", "saida": "erro" },
    { "de": "t", "para": "u", "saida": "sucesso" }, { "de": "t", "para": "n", "saida": "erro" } ] }
```

## 6. Presets de payload ("o ERP precisa de quê?")
- **Só status** (mapeamento):
  ```json
  [{"campo":"pedido","valor":"documento.numero"},
   {"campo":"codigo_erp","valor":"documento.codigo_erp"},
   {"campo":"status","tipo":"expressao","valor":"evento","dominio":"status"},
   {"campo":"data","valor":"ocorrido_em"}]
  ```
- **Status + itens** (mapeamento):
  - os campos de "Só status";
  - mais um campo do tipo `lista` sobre `itens`, com os subcampos `sku` (`produto.sku`), `codigo_erp` (`produto.codigo_erp`), `solicitado` (`qtd_solicitada`), `atendido` (`qtd_atendida`) e `cortado` (`qtd_cortada`).
  - Na entrada, os subcampos de quantidade passam a ser `qtd_esperada`, `qtd_conferida` e `qtd_divergente`.
- **Personalizado**: JSONata vazio, com o contexto do documento escolhido ao lado.
