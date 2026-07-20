## Objetivo

Na rota `#/atividades/volumes`, remover a coluna **M³** e adicionar no lugar a coluna **Nº Volume** (`volume_expedicao.numero_volume`), que representa a posição unitária da etiqueta em relação ao total gerado (ex.: 1/N).

## Alterações

### 1. Banco — expor `numero_volume` na view
Recriar `public.vw_volume_expedicao_lista` incluindo `ve.numero_volume` (mantendo todas as demais colunas atuais). Migração via `CREATE OR REPLACE VIEW`.

### 2. Frontend — `src/pages/VolumesPage.tsx`
- Remover a coluna `{ key: "m3", label: "M³", type: "number" }`.
- Adicionar no mesmo lugar:
  ```
  { key: "numero_volume", label: "Nº Volume", render: (row) => (
      <span className="text-sm font-semibold text-foreground">
        {row.numero_volume ?? "—"}
        {row.total_volumes_movimento ? ` / ${row.total_volumes_movimento}` : ""}
      </span>
  )}
  ```
  Exibindo `numero_volume / total_volumes_movimento` para deixar claro "1 de N".

## Fora de escopo
Nenhuma alteração na impressão de etiquetas, filtros ou fluxo de exclusão.
