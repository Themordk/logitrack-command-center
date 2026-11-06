# Ajustes de destino da armazenagem

## Armazenagem de cancelamentos
- [ ] Compartilhar origem, serviços e prazo; adicionar escolha e lista de cancelamentos.
- [ ] Adaptar início, execução online, erros de saldo e conclusão sem alterar entradas.
- [ ] Bloquear transferência, adicionar parâmetros e conferir notificações.
- [ ] Executar testes de regras e regressões; conferir telas no celular.
- [ ] Validar operação com dados reais: Supabase externo sem sessão autenticada disponível.

## Mudança de Picking: bloqueio resumido
- [x] Adaptar contrato e motivos com compatibilidade com prévias antigas.
- [x] Exibir cartão único de bloqueio, SKUs recolhidos e ações de navegação; preservar fluxo liberado.
- [x] Tratar ORIGEM_COM_SKUS_SEM_PICKING no destino; 34 testes do coletor passaram e build OK.
- [x] Conferir cartão e expansão em 360px com dados simulados, navegação à Transferência e limpeza da sessão.
- [ ] Validar origem 1010 real no QA: Supabase externo sem sessão autenticada disponível.

## Mudança de Picking v2 (RPCs)
- [x] Serviço com tipos do contrato, preview/executar via RPC e sessão (mudpick_*).
- [x] Telas 1–4: preview na origem, decisões de picking na lista, execução atômica no destino, resumo na conclusão.
- [x] TransferenciaDestinoPage sem ID fixo de tipo de tarefa (busca TRANF do tenant).
- [x] Testes do serviço (6) + coletor (22) passaram; typecheck/build OK; sem inserts diretos nem migrations.
- [ ] Validar com usuário conectado: sessão indisponível no Supabase externo.

## Inventário rotativo por período
- [x] Compartilhar os quatro critérios e os labels legados nas listas web/coletor; leitura complementar em lote, pois as views não possuem o campo.
- [x] Atualizar criação, período, resumo, bloqueio sem elegíveis e mensagens amigáveis.
- [x] Testar as regras: 10 testes passaram; build OK; sem alterações no banco.
- [ ] Regenerar tipos Supabase: arquivo protegido e nenhuma ferramenta de regeneração disponível; valores novos tipados localmente, sem editar o arquivo gerado.
- [ ] Validar com usuário conectado: Supabase externo sem sessão disponível.

## Picking na transferência do coletor
- [x] Consultar RPC exclusiva e mostrar orientação nos detalhes e destino, sem alterar validações.
- [x] Limpar orientação ao reiniciar e concluir o fluxo.
- [x] Testar conversão, prioridade, excesso informativo, ausência de picking e erro: 9 testes aprovados; build OK.
- [ ] Validar com usuário conectado: Supabase externo sem sessão disponível.

## Revisão de Produtos
- [x] Abrir impressão no clique e fechar a aba em erro ou lista vazia; aba reservada e PDF conferidos no Chrome.
- [x] Grupos vinculados pela RPC, opções únicas e filtro desabilitado quando vazio.
- [x] Evitar consulta duplicada ao mudar filtros e desabilitar exportação durante carregamento.
- [x] Executar testes dos ajustes: 9 passaram; build OK.
- [ ] Validar com usuário conectado: sessão indisponível no Supabase externo.

## Recebimento do coletor (RPC + filtro)
- [x] Trocar fonte para RPC recebimento_buscar_movimentos (sem N+1), cache v2.
- [x] Card enriquecido: tipo, chips de prioridade/devolução/crossdocking, NF, itens, placa, conferente.
- [x] Filtro local (tipo/movimento/NF/parceiro sem acento) com persistência em sessão; 4 testes passaram.
- [ ] Validar com usuário conectado: sessão indisponível no Supabase externo.

## Liberação sem saldo no picking
- [x] Configuração, avisos e abastecimento/mapeamento nas ondas.
- [x] Orientação de pendências e retorno do mapeamento no coletor.
- [x] Contratos locais e testes de regras/fluxo (20 passaram); compilação conferida.
- [ ] Validar com usuário conectado: sessão indisponível no Supabase externo.

- [x] Atualizar o contrato de destino e a opção Pulmão com memória offline.
- [x] Tratar ausência de destino, quantidade parcial e registro de ocorrência.
- [x] Validar regras (9 testes) e conferir o texto de destino na execução, que já distingue Picking de Pulmão.
- [ ] Conferir o fluxo com usuário conectado: sessão de teste indisponível neste Supabase externo.
## Parceiro e vendedor no coletor
- [x] Adicionar grade de opções no Tipo de Saída.
- [x] Aplicar opções nas listas de Separação e Conferência.
- [ ] Atualizar tipos gerados: arquivo protegido pela plataforma; não alterar banco.
- [x] Executar testes: 7 passaram; build OK.
- [ ] Validar telas com usuário conectado: Supabase externo sem sessão de teste disponível.
## Editor de fluxos: limite 40 nós / 80 ligações
- [x] Limites só do catálogo (max_nos, max_ligacoes com fallback max_nos*2; sem catálogo = 0, adição bloqueada).
- [x] indexarGrafo memoizado (adjacência, ordem, caches de alcance); sem teto de profundidade; O(N+E).
- [x] Contextos do editor separados (estático/dinâmico); canvas só renderiza nós visíveis; minimapa acima de 20 nós.
- [x] Autosave: arraste salva só no fim, posições com espera de 3s.
- [x] Contadores de nós/ligações na paleta e na barra; códigos LIMITE_NOS/LIMITE_LIGACOES/CICLO reconhecidos.
- [x] Testes: cadeia de 40 nós, diamante de 42 nós (<20 ms), limites na paleta; 75 passaram; tipos e build OK.
- [ ] esperado.json dos grafos de estresse: aguarda JSON da nova validação do servidor (equipe de backend).
- [ ] Validar com usuário conectado: sessão indisponível no Supabase externo.
