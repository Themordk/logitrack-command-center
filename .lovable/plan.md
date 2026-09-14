# Contagem Livre — Inverter Exibição no Contêiner do Endereço

## Problema
Na tela `/coletor/inventario/livre/produto` (InventarioLivreProdutoPage), o contêiner do endereço mostra a **descrição** (ENDERECO.DESCRICAO) em fonte pequena no topo e o **código** (ENDERECO.CODIGO_ENDERECO) em destaque, grande, no centro. As demais telas do coletor seguem o padrão inverso: descrição em destaque no centro, código em fonte menor.

## Correção (arquivo único)

`src/pages/coletor/inventario/InventarioLivreProdutoPage.tsx` — bloco do card "Endereço" (~linhas 202–214):

1. O rótulo pequeno do topo passa a exibir o **código do endereço**: `Código: {enderecoCodigo}` (fonte pequena atual, `text-xs`).
2. O bloco central destacado (fundo azul, `text-2xl font-black font-mono`) passa a exibir a **descrição**: `{enderecoDescricao}`.
3. Fallbacks "—" mantidos para ambos os campos; nada mais na tela é alterado.

## Não alterar
- Sessão `sessionStorage` (leitura de `coletor_inventario_livre_endereco_codigo/descricao`) permanece igual — só a apresentação troca.
- Demais telas do coletor, RPCs e estilos globais.

## Validação
- Typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`) e build.
- Conferência visual no preview da tela de contagem livre.
