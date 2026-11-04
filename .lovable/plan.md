# Mudança de Picking: bloqueio resumido

- Exibir um único cartão quando a origem estiver bloqueada, com os motivos recebidos e até cinco pendências.
- Manter os SKUs recolhidos inicialmente e permitir abrir a lista em duas colunas com rolagem.
- Oferecer “Ir para Transferência”, quando sugerido, e “Escanear outra origem”, limpando a sessão.
- Ocultar saldo, cartões de produtos e confirmação no bloqueio; preservar a tela atual quando liberada.
- Mostrar o aviso específico para `ORIGEM_COM_SKUS_SEM_PICKING` na tela de destino.

## Detalhes técnicos
- Acrescentar campos opcionais ao contrato e helper puro com fallback para `bloqueios` antigos.
- Testar os três formatos de motivos e executar os testes do coletor.
- Alterar somente frontend, sem dependências novas ou mudanças no banco.