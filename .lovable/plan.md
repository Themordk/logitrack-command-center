
## Objetivo

Integrar as RPCs `rpc_sugerir_endereco_picking` e `rpc_validar_endereco_picking` na tela existente `ArmazenagemExecucaoPage`, oferecendo até 3 sugestões clicáveis de endereço e validação das regras de armazenagem antes de finalizar. Remover a tela órfã de sugestão de picking.

## Passos

### 1. Remover tela órfã
- Deletar `src/pages/coletor/ColetorSugestaoPickingPage.tsx`.
- Em `src/App.tsx`: remover import e case `/coletor/sugestao-picking`.

### 2. Editar `src/pages/coletor/ArmazenagemExecucaoPage.tsx`

**Imports**: adicionar `Star` do `lucide-react`.

**Novos estados**:
- `sugestoes: any[]` e `loadingSugestao: boolean`
- `enderecoTipo: string` (para distinguir PICKING de PULMÃO)

**Fetch de sugestões (novo `useEffect`)**: dispara ao montar, chamando `rpc_sugerir_endereco_picking` com tenant/armazém/produto/lote/validade (ignora validade `1900-01-01`) e `p_limite: 3`.

**UI (dentro do card de produto, abaixo do bloco "Picking sugerido")**:
- Loader "Buscando endereço ideal…" enquanto carrega.
- Lista de até 3 sugestões como botões: estrela na primeira, descrição do endereço, badge de curva quando existir, e label do `tipo_sugestao` (Consolidar / Curva OK / Livre). Sugestão selecionada ganha borda verde.

**`handleSelecionarSugestao(sug)`**: preenche `enderecoId`, `enderecoDesc`, `enderecoScan`, define `enderecoTipo = "PICKING"` e mostra overlay de sucesso.

**`handleScanEndereco`**: incluir `tipo_endereco` no `select` e salvar em `enderecoTipo`.

**`handleConfirm`**: antes de chamar `finalizar_armazenagem`, se `enderecoTipo === "PICKING"`, chamar `rpc_validar_endereco_picking`. Se `valido === false`, exibir erros concatenados em overlay e abortar. Endereços de pulmão seguem direto (não quebrar fluxo).

**Log (não crítico)**: após sucesso da finalização e antes do `setTimeout` de navegação, inserir em `log_sugestao_armazenagem` com sugestão top vs endereço escolhido, `aceita`, `motivo`, `score`, `tipo_sugestao`, lote, quantidade, usuário. Envolto em try/catch silencioso.

### Detalhes técnicos
- Usar `as any` nas RPCs novas e no insert de log (não estão nos types gerados).
- Manter design system atual (mesmas cores hsl, ScanField, ActionButton, StatusOverlay).
- Não alterar `finalizar_armazenagem`, modal de capacidade, nem fluxo de pulmão.
- Modal de capacidade excedida e ocorrências permanecem intactos.

## Resultado esperado
Operador vê até 3 sugestões clicáveis do motor no card do produto (melhor com estrela). Pode tocar numa sugestão OU escanear manualmente. Ao confirmar em endereço de picking, as regras são validadas; em pulmão, segue direto. Log de decisão registrado quando possível.
