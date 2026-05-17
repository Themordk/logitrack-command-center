## Objetivo

Substituir o modal "Importar do ERP" usado em **Atividades → Gerar Entradas** (`EntradasPage`) por um fluxo dedicado de importação **unitária por chave de acesso NF-e**, consumindo a edge `sync-recebimentos` no novo modo (`chave_nfe`).

Os demais usos do `ImportarDoERPModal` (Produtos, Parceiros, Grupos, Subgrupos, Rotas, Saídas) e a aba **Sincronização** em Configurações → Integração ERP **não serão alterados**.

## Mudanças

### 1. Novo componente — `src/components/erp/ImportarNfeChaveModal.tsx`

Modal dedicado, isolado do `ImportarDoERPModal` genérico para não impactar outras telas.

Props:
```ts
{ isOpen: boolean; onClose: () => void; onSuccess: () => void; }
```

Estados internos: `IDLE | BUSCANDO | SUCESSO | JA_IMPORTADA | ERRO`.

Campo único:
- Label: "Chave de acesso da NF-e"
- Placeholder: "44 dígitos — ex: 23260506199813..."
- Máscara: `onChange` filtra `replace(/\D/g, "").slice(0, 44)`
- Contador "X/44" à direita; erro inline se `length < 44` ao submeter

Botão "Buscar e Importar":
- Desabilita quando `length !== 44` ou estado = BUSCANDO
- Chama:
  ```ts
  supabase.functions.invoke("sync-recebimentos", {
    body: { tenant_id, empresa_id, chave_nfe: valor }
  })
  ```
- `tenant_id` / `empresa_id` vêm de `useTenant()` (mesmo padrão do modal atual)

Renderização por estado:
- **BUSCANDO**: spinner + "Consultando NF-e no ERP Omie..."
- **SUCESSO** (`status === "success"`): ícone CheckCircle2 verde, "NF-e nº {numero_nota} importada com sucesso!", "{itens_importados} item(ns) importado(s)". Se `itens_nao_resolvidos > 0`: bloco amarelo com AlertTriangle. Botões: "Ver documento de entrada" → `window.location.hash = "#/atividades/entradas?documento_id=" + documento_id` + `onSuccess()` + `onClose()`; "Importar outra NF-e" → reset.
- **JA_IMPORTADA** (`status === "already_imported"`): ícone Info azul, exibe `message`, botão "Ver documento" usando `documento_id`.
- **ERRO** (`status === "error"` OU erro de rede/exception): ícone XCircle vermelho, exibe `message` (ou `error.message`), botão "Tentar novamente" volta para IDLE mantendo o valor digitado.

Em SUCESSO e JA_IMPORTADA, chama `onSuccess()` para recarregar a lista quando o modal fecha (ou ao clicar "Ver documento").

Visual: reutiliza Dialog/DialogContent (`max-w-md`), Input, Label, Button, classes `bg-secondary/40`, `border-border`, padrões já usados em `ImportarDoERPModal`.

### 2. `src/pages/EntradasPage.tsx`

Substituir o bloco `<ImportarDoERPModal ... entidade="nota_entrada" ... />` (linhas 442–463) por:

```tsx
<ImportarNfeChaveModal
  isOpen={importOpen}
  onClose={() => setImportOpen(false)}
  onSuccess={() => fetchDocs()}
/>
```

Trocar o import correspondente no topo (`ImportarDoERPModal` → `ImportarNfeChaveModal`). Manter `BotaoImportarERP` se ainda for usado para abrir o modal (verificar; provavelmente sim).

## Fora de escopo

- `ImportarDoERPModal` genérico, branch `nota_entrada` interno (mantido como está, ainda que não seja mais chamado por `EntradasPage`).
- Edge function `sync-recebimentos` (já suporta o novo modo).
- Aba Sincronização, demais telas e rotas.
- Layout/tema global.