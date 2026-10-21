# Ajustes de destino da armazenagem

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
