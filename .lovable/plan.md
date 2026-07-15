# Fase 2 — Ajustes de UI: Tipos de Saída, Roteiro e Conferência Cega

Escopo estrito: alterar apenas 3 arquivos existentes. Sem novas dependências, sem novos arquivos, sem tocar em `components/ui/` nem no `App.tsx`.

## 1. `src/pages/TiposSaidaPage.tsx` — formulário com seções

Substituir o `CrudModal` (grid plano) por um `Dialog` customizado com 4 seções visuais.

- Remover import de `CrudModal` e o array `fields`.
- Importar `Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter`, `Switch`, ícones `Save` e `Loader2`.
- Novos estados: `form` e `saving`. Função `openModal(item)` popula defaults (descricao, codigo_erp, prioridade=NORMAL, switches, `gera_volume_etapa=CONFERÊNCIA`, ativo=true).
- CrudTable passa a chamar `openModal(null)` no novo e `openModal(row)` no editar.
- `handleSave`: se `realiza_conferencia=false`, força `conferencia_checkout=false` e `conferencia_cega=false`; usa `crud.update` ou `crud.create` com `empresa_id`.
- Layout do Dialog com 4 blocos com borda/`bg-secondary/20`:
  1. **Dados gerais**: Descrição, Código ERP, Prioridade.
  2. **Conferência**: switches Realiza conferência / Checkout / Cega (os dois últimos desabilitados quando Realiza=off).
  3. **Separação e volume**: switch Separa pulmão + select "Gera volume na etapa".
  4. **Automação**: switches Gera/Libera movimento automático e Gera abastecimento automático.
  5. Toggle **Ativo** fora dos cards.
- Footer com botões Cancelar e Salvar (com spinner quando `saving`).
- **Não alterar** a `CrudTable`, colunas, `boolBadge`, `prioridadeBadge` nem o `DeleteConfirmDialog`.

## 2. `src/pages/RoteiroSeparacaoPage.tsx` — layout vertical

Alteração única de layout: trocar

```
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
```

por

```
<div className="flex flex-col gap-6 max-w-3xl">
```

Nada mais muda: mantém fetch, drag-and-drop, modais, `renderDragList`, ordem dos contêineres e `armazemId` vindo do contexto (sem hardcode).

## 3. `src/pages/coletor/ConferenciaProdutoPage.tsx` — conferência cega

Ler `conferencia_cega` do `tipo_saida` do movimento e ocultar quantidades esperadas.

- Novo estado `modoCego`.
- No `useEffect` que já busca `conferencia_checkout`, expandir o `select` do `movimento_saida` para `tipo_saida_rel:tipo_saida(conferencia_checkout, conferencia_cega)` e chamar `setModoCego(!!tipoSaidaData?.conferencia_cega)` (fallback `false` no catch).
- Card de quantidades:
  - Se `modoCego`: mostra somente **Conferida** (verde) + rótulo "Conferência cega ativa".
  - Caso contrário: mantém o grid atual de 3 colunas (Requerida / Conferida / Restante).
- `titleBadge`: se `modoCheckout` mostra badge **CHECKOUT** (amber); senão, se `modoCego`, mostra badge **CEGA** (purple); caso contrário `undefined`.
- **Não alterar**: scan de EAN, `executarConfirmacao(For)`, lógica de checkout, overlays, `ConferenciaIniciarPage`, `ConferenciaItensPage`. A confirmação segue funcionando normalmente em modo cego.

## Verificação

- Build/tsgo limpos.
- Abrir modal de Tipos de Saída: 4 seções visíveis, switches de checkout/cega desabilitam ao desligar "Realiza conferência", Salvar persiste corretamente.
- Roteiro de Separação renderiza os 3 blocos empilhados, largura limitada a `max-w-3xl`.
- Conferência no coletor com tipo de saída `conferencia_cega=true` esconde Requerida/Restante e exibe badge CEGA.

## Fora de escopo

Qualquer outra tela, componente, RPC ou migração de banco.
