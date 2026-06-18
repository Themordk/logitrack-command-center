## Objetivo

Migrar o frontend para o novo contrato genérico de integração ERP do backend: schema `integracao` via RPCs `integracao_*`, edge functions consolidadas (`sync-entidade`, `erp-conexao`, `webhook-receber`) e padronização da coluna `codigo_erp` em todas as tabelas de domínio. UI, layout e UX permanecem idênticos — só a camada de dados muda.

---

## 1. Arquivos a alterar

### 1.1 Núcleo da integração (`src/pages/integracao/`)
| Arquivo | Mudança |
|---|---|
| `entidades.ts` | Trocar `fn: string \| null` por `sincronizavel: boolean` em cada `EntidadeDef`. Remover export `mw` (schema middleware). MODULOS/INTERVALOS mantidos. Entidades marcadas `sincronizavel: true`: `produtos`, `parceiros`, `grupo_produto`, `notas_entrada`, `pedidos_saida`, `nf_devolucoes` (renomear de `nf_saida`). Demais: `false`. |
| `useErpProvedor.ts` | `mw.from('erp_provedor')` → `supabase.rpc('integracao_listar_provedores')` + `.find(p => p.id === erpId)`. |
| `useErpGallery.ts` | Substituir as 3 queries por: `integracao_listar_provedores()` + `integracao_get_credenciais({ p_tenant_id, p_empresa_id, p_erp_provedor_id: null })`. Remover lógica `legadoOmie`/`omie_config`. |
| `IntegracaoErpDetalhePage.tsx` | Buscar nome/disponível via `integracao_listar_provedores`. Remover import `mw`. Trocar texto "middleware de integração" por "integração". Remover gate `isOmie` da aba Sincronização — passa a valer para todos os provedores disponíveis. |
| `CredenciaisDinamicasTab.tsx` | Carregar via `integracao_get_credenciais({ p_erp_provedor_id: erpId })`. Salvar via `supabase.functions.invoke('erp-conexao', { body: { acao: 'save', empresa_id, erp_id, credenciais, config_extra, tipo_integracao: 'polling', ativo } })`. Testar via `erp-conexao { acao: 'testar', empresa_id, erp_id }` (genérico, não mais só Omie; botão desabilitado até salvar). Remover fallback `omie-config-get`. |
| `CredenciaisTab.tsx` | **Excluir** — arquivo legado sem referências externas. |
| `SincronizacaoTab.tsx` | Leitura: `integracao_get_sync_configs({ p_modulo: null, p_entidade: null, p_tenant_id, p_empresa_id })` (passar `null` em módulo/entidade carrega tudo de uma vez) + `integracao_listar_logs({ p_tenant_id, p_empresa_id, p_limite: 500 })` para `lastLogs`. <br>Escrita: `integracao_upsert_sync_config({ p_modulo, p_entidade, p_ativo, p_intervalo_minutos, ... })` para ativar/pausar/intervalo. Reset cursor: `integracao_resetar_cursor({ p_entidade })`. <br>Execução: `supabase.functions.invoke('sync-entidade', { body: { entidade, modulo, tenant_id, empresa_id, ...(modulo==='movimentos' && { data_inicio, data_fim }) } })`. <br>Mapear campos do novo schema: `last_sync_at` → `ultimo_sync_em`, `last_omie_id/page` → `cursor_state` (jsonb). Datas `data_inicio`/`data_fim` continuam por `cursor_state` ou param dedicado se aceito pela RPC; caso não, manter local-only no body do `sync-entidade`. |
| `StatusBar.tsx` | Substituir as 4 queries por: `integracao_get_credenciais({ p_erp_provedor_id: null })` (deriva `ativo` = existe conexão ativa) + `integracao_resumo_sync_hoje({ p_tenant_id, p_empresa_id })` (fornece `ultimo_sync_em`, `total_erro`, `registros_inseridos_hoje + registros_atualizados_hoje`) + `integracao_get_sync_configs(...)` para contar `activeCount` de entidades ativas. Trocar rótulo "Omie" fixo para nome do provedor da conexão ativa (prop opcional `nomeProvedor`). |
| `LogsPanel.tsx` | `mw.from('sync_log')` → `supabase.rpc('integracao_listar_logs', { p_tenant_id, p_empresa_id, p_entidade, p_status, p_erp_provedor_id: sistemaOrigem ?? null, p_limite: PAGE_SIZE, p_offset: (page-1)*PAGE_SIZE })`. Para contagem total, fazer chamada extra com `p_limite: 1, p_offset: 0` e contar via segunda chamada com `p_limite: 10000` **ou** assumir paginação "se vier `PAGE_SIZE`, há próxima" (simpler). Renomear campos exibidos: `executed_at`→`criado_em`, `records_*`→`registros_*`, `error_message`→`mensagem_erro`, `duration_ms`→`duracao_ms`. Filtros `from`/`to` ficam client-side em cima dos resultados (RPC não expõe). |
| `FilasPanel.tsx` | `mw.from(table)` → `supabase.rpc('integracao_listar_fila', { p_tenant_id, p_empresa_id, p_direcao: tab==='sync_queue' ? 'entrada' : 'retorno', p_status: null, p_limite: 100 })`. Contagens por status: 4 chamadas em paralelo com `p_status` específico. Remover ações de "Reprocessar"/"Descartar" (sem RPC de escrita exposta) — manter botões apenas se confirmar; por ora, deixar visíveis e desabilitados com tooltip "Ação indisponível". Mapear campos: `retry_count`→`tentativas`, `error_message`→`mensagem_erro`, `created_at`→`criado_em`. Tabela passa a mostrar `id_externo` em vez de `omie_id`/`omie_numero`. |

### 1.2 Modal de importação ad-hoc (`src/components/erp/`)
| Arquivo | Mudança |
|---|---|
| `ImportarDoERPModal.tsx` | • Remover `pollProcessar` e as RPCs `middleware_*`. <br>• `produto`: `invoke('sync-entidade', { body: { entidade:'produtos', modulo:'cadastros', tenant_id, empresa_id, filtro: isNumeric(valor) ? { codigo_produto: Number(valor) } : { codigo: valor.trim() } } })`. Resposta unitária: usa `data.id_interno`, `data.descricao`, `data.inserido` para preencher `registro`. <br>• `parceiro`: idem com `entidade:'parceiros'`, `filtro: { codigo_cliente_omie: Number(valor) }`. <br>• `nota_entrada`: agora **1 chamada só** `entidade:'notas_entrada'`, `filtro: chave.length===44 ? { chave_nfe: v } : { numero_nota: v }`. Remover lógica de fallback `sync-recebimentos` → `sync-notas-entrada`. <br>• `pedido_saida`: `entidade:'pedidos_saida'`, `filtro: { numero_pedido: v }`. <br>• `grupo_produto`: `entidade:'grupo_produto'`, `filtro: { codigo: String(v) }`. Já usa `codigo_erp` (ok). <br>• Trocar literais "ERP Omie" por "ERP". |
| `ImportarNfeChaveModal.tsx` | `sync-recebimentos` → `sync-entidade { entidade:'notas_entrada', modulo:'cadastros', filtro:{ chave_nfe } }`. |
| `ImportarPedidoSaidaModal.tsx` | `sync-pedidos-saida` → `sync-entidade { entidade:'pedidos_saida', modulo:'cadastros', filtro:{ numero_pedido } }`. |

### 1.3 Colunas renomeadas (`*erp` → `codigo_erp`)
| Arquivo | Mudança |
|---|---|
| `src/pages/TiposEntradaPage.tsx` | `coderp` → `codigo_erp` (coluna e form). |
| `src/pages/TiposSaidaPage.tsx` | `caderp` → `codigo_erp`. |
| `src/pages/UsuariosPage.tsx` | `cod_erp` → `codigo_erp`. |
| `src/hooks/useCrud.ts` | linha 130: `"coderp"` → `"codigo_erp"`. |
| `src/integrations/supabase/types.ts` | Renomear `coderp`/`caderp`/`cod_erp`/`codigo_erp_omie`/`codigo_erp_produto` → `codigo_erp`. Remover tipos das tabelas/RPCs apagadas (schema `middleware`, `omie_config`, RPCs `middleware_*`). Remover colunas removidas de `documento_saida` (`id_externo`, `sistema_origem`, `status_integracao`, `sincronizado_em`, `erro_integracao`, `tentativas_processamento`, `prioridade_externa`) e `documento_saida_item` (`sistema_origem`, `status_mapeamento`). Edição manual (será sobrescrita na próxima regeneração). |

### 1.4 Edge functions deste repo (`supabase/functions/`)
| Arquivo | Mudança |
|---|---|
| `create-usuario/index.ts` | `cod_erp` → `codigo_erp` (linhas 70 e 162). |
| `support-create-usuario/index.ts` | `cod_erp` → `codigo_erp` (linhas 23 e 76). |
| `omie-config-get/` | **Excluir** (`rm -rf` + `supabase--delete_edge_functions`). |
| `omie-config-save/` | **Excluir**. |
| `omie-test-connection/` | **Excluir**. |
| `salvar-erp-credenciais/` | **Excluir**. |

As funções `sync-*`, `webhook-receber-pedido-saida`, `erp-conexao`, `sync-entidade` e `webhook-receber` vivem no backend remoto e não estão neste repositório — nada a fazer localmente para elas.

---

## 2. Detalhes técnicos

### 2.1 Tipo da nova `EntidadeDef`
```ts
interface EntidadeDef {
  id: string;
  label: string;
  sincronizavel: boolean; // controla disponibilidade do botão "Executar"
}
```

### 2.2 Padrão de execução
```ts
supabase.functions.invoke('sync-entidade', {
  body: { entidade, modulo, tenant_id, empresa_id, ...(filtro && { filtro }) }
})
```
- Sem `filtro` → modo lote (paginado).
- Com `filtro` → modo unitário (resposta síncrona com `id_interno`, `descricao`, `inserido`).

### 2.3 Mapeamento de cursor e datas
- `last_omie_id`/`last_omie_page` → `cursor_state` (jsonb retornado por `integracao_get_sync_configs`).
- Reset → `integracao_resetar_cursor({ p_entidade })`.
- Datas `data_inicio`/`data_fim` da aba Movimentos: passar no body da execução `sync-entidade`. O CRUD desses filtros segue persistindo via `integracao_upsert_sync_config` se aceito; caso a RPC não tenha esses params, mantemos somente no estado local.

### 2.4 LogsPanel — paginação
A RPC `integracao_listar_logs` aceita `p_limite`/`p_offset`. Como não há `count`, vamos:
- Pedir `PAGE_SIZE + 1` por página; se vierem `PAGE_SIZE+1`, há próxima.
- Remover o "total de registros" do rodapé (substituir por "Página N").

---

## 3. Validação

1. Build TypeScript limpo após renomeações.
2. `/config/integracao` — galeria carrega cards sem erro.
3. `/config/integracao/omie` — abas Credenciais (salvar/testar), Sincronização (executar/ativar/pausar/intervalo/reset), Logs (filtros + paginação), Filas (entrada/retorno + contadores) funcionais.
4. Páginas Tipos de Entrada/Saída/Usuários — coluna `codigo_erp` funciona em listagem, busca e formulário.
5. Modais "Importar do ERP" — busca pontual + confirmação para Produtos, Parceiros, Doc. Entrada, Doc. Saída e Grupos.

---

## 4. Riscos
- `types.ts` editado à mão fica fora de sincronia até nova regeneração (combinado com o usuário).
- O LogsPanel perde o totalizador exato (mostrará "Página N" apenas) — ajuste consciente, sem perda funcional.
