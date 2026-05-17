## Objetivo

Substituir o modal "Importar do ERP" usado em **Atividades → Gerar Saídas** (`SaidasPage`) por um fluxo dedicado de importação **unitária por número de pedido**, consumindo a edge `sync-pedidos-saida` no novo modo (`numero_pedido`).

Os demais usos do `ImportarDoERPModal` e a aba **Sincronização** em Configurações → Integração ERP **não serão alterados**.

## Mudanças

### 1. Novo componente — `src/components/erp/ImportarPedidoSaidaModal.tsx`

Modal dedicado, isolado do `ImportarDoERPModal` genérico para não impactar outras telas.

Props:
```ts
{ isOpen: boolean; onClose: () => void; onSuccess: () => void; }
```

Estados internos: `IDLE | BUSCANDO | SUCESSO | JA_IMPORTADA | NAO_ENCONTRADO | ERRO`.

Campo único:
- Label: "Número do pedido de venda"
- Placeholder: "Ex: 42"
- Tipo: `number` (input type="number", min="1")
- Validação inline ao submeter: exibe erro se vazio ou `<= 0`

Botão "Buscar e Importar":
- Desabilita quando valor inválido ou estado = BUSCANDO
- Chama:
  ```ts
  supabase.functions.invoke("sync-pedidos-saida", {
    body: { tenant_id, empresa_id, numero_pedido: parseInt(valor) }
  })
  ```
- `tenant_id` / `empresa_id` vêm de `useTenant()`

Renderização por estado:
- **BUSCANDO**: spinner + "Consultando pedido no ERP Omie..."
- **SUCESSO** (`status === "success"`): ícone CheckCircle2 verde, "Pedido nº [numero_pedido] importado com sucesso!", linha com cliente, valor formatado em R$, [itens_importados] item(s). Se `etapa !== "30"`: aviso azul informativo. Se `itens_nao_resolvidos > 0`: bloco amarelo com AlertTriangle. Botões: "Ver documento de saída" → `window.location.hash = "#/atividades/saidas?documento_id=" + documento_id` + `onSuccess()` + `onClose()`; "Importar outro pedido" → reset.
- **JA_IMPORTADA** (`status === "already_imported"`): ícone Info azul, exibe `message`, botão "Ver documento" usando `documento_id`.
- **NÃO ENCONTRADO** (`status === "not_found"`): ícone AlertTriangle amarelo, exibe `message`, botão "Tentar novamente" → limpa e foca campo.
- **ERRO** (`status === "error"` ou exceção de rede): ícone XCircle vermelho, exibe `message`, botão "Tentar novamente" volta para IDLE mantendo o valor.

Visual: reutiliza Dialog/DialogContent (`max-w-md`), Input, Label, Button, classes `bg-secondary/40`, `border-border`, padrões já usados em `ImportarNfeChaveModal`.

### 2. `src/pages/SaidasPage.tsx`

Substituir o bloco `<ImportarDoERPModal ... entidade="pedido_saida" ... />` (linhas 278–300) por:

```tsx
<ImportarPedidoSaidaModal
  isOpen={importOpen}
  onClose={() => setImportOpen(false)}
  onSuccess={() => fetchDocs()}
/>
```

Trocar o import correspondente no topo (`ImportarDoERPModal` → `ImportarPedidoSaidaModal`). Manter `BotaoImportarERP` para abrir o modal.

## Fora de escopo

- `ImportarDoERPModal` genérico (mantido como está, ainda usado por Produtos, Parceiros, Grupos, Subgrupos, Rotas, Saídas nas outras telas...)
- Edge function `sync-pedidos-saida` (já suporta o novo modo).
- Aba Sincronização, demais telas e rotas.
- Layout/tema global.