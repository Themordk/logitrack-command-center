## Objetivo
Aprimorar `src/pages/VolumesPage.tsx` (Volumes de Expedição) com filtros avançados, colunas adicionais, impressão de etiquetas 100×40 mm e exclusão controlada com registro automático de ocorrência operacional.

## 1. Backend — View e RPC (migração Supabase)

### 1.1 `public.vw_volume_expedicao_lista` (nova view, `security_invoker=true`)
Consolida `volume_expedicao` + `movimento_saida` (via `vw_movimento_saida_lista`) para evitar N+1 e habilitar filtros/ordenação server-side.

Colunas expostas:
- `id`, `codigo_volume`, `status`, `peso_bruto`, `m3`, `created_at`
- `tenant_id`, `empresa_id`
- `movimento_saida_id`, `numero_onda`, `parceiro_nome`, `destino_carga`, `rota_id`, `motorista`
- `documento_saida_id`
- `total_volumes_movimento` (COUNT window por `movimento_saida_id`) — para a impressão "03 / 12"

`GRANT SELECT` para `authenticated`.

### 1.2 RPC `public.fn_excluir_volume_expedicao(p_volume_id, p_usuario_id, p_observacao)`
- Valida que `status = 'ABERTO'`; caso contrário, retorna erro amigável.
- Conta volumes do movimento antes (`v_total_antes`).
- `DELETE FROM volume_expedicao WHERE id = p_volume_id`.
- Conta depois (`v_total_depois = v_total_antes - 1`).
- Chama `registrar_ocorrencia_operacional` com:
  - `p_tipo_ocorrencia = 'EXCLUSAO_VOLUME'` (categoria: `EXPEDICAO`, etapa: `EXPEDICAO`)
  - `p_observacao` = "Volume {codigo_volume} excluído. Movimento tinha {total_antes} volume(s), passa a ter {total_depois}." + observação livre do usuário
  - `p_documento_origem_id = movimento_saida_id`, `p_tipo_documento_origem = 'MOVIMENTO_SAIDA'`, `p_usuario_causador_id`, `p_usuario_criador_id`.
- Retorna `{ ok, total_antes, total_depois, ocorrencia_id }`.

## 2. `src/pages/VolumesPage.tsx` — reescrita da tela

### 2.1 Migração para a view
- `useCrud({ table: "vw_volume_expedicao_lista", ... })` (leitura). Ajuste dos campos de busca textual em `useCrud.ts` para incluir `codigo_volume`, `numero_onda`, `parceiro_nome`.
- Escrita (exclusão) via RPC dedicada — não usa `crud.remove`.

### 2.2 Filtros (barra inline, padrão `EnderecosPage`)
- **Código do volume** (texto, aplicado no `search`)
- **Status**: select com `ABERTO | FECHADO | CONFERIDO | EXPEDIDO`
- **Nº da onda** (input numérico)
- **Data de criação**: dois inputs `date` (de/até) aplicados sobre `created_at`
Filtros injetados via `filters` do `useCrud`; debounce 400 ms nos campos texto.

### 2.3 Grid — colunas novas
Mantém `codigo_volume`, `peso_bruto`, `m3`, `status`, `created_at` e adiciona:
- **Nº Onda** (`numero_onda`)
- **Parceiro / Razão social** (`parceiro_nome`)
- **Destino** (`destino_carga`)
- **Vol/Total** (`— / total_volumes_movimento`, exibindo `n / total` calculado por índice dentro do movimento — ou apenas `total_volumes_movimento` se a numeração não estiver disponível).

### 2.4 Seleção múltipla + impressão em lote
- Coluna checkbox no `CrudTable` (mesmo padrão de `EnderecosPage`) com "selecionar todos".
- Botão **"Imprimir Etiquetas"** habilitado quando ≥1 volume selecionado, abre `PrintEtiquetaVolumeModal`.

### 2.5 Exclusão
- Botão excluir habilitado somente quando `status === 'ABERTO'` (demais linhas desabilitam a ação).
- `DeleteConfirmDialog` customizado com aviso: "Será registrada uma ocorrência operacional documentando a exclusão." + textarea opcional para observação adicional.
- Confirmação chama `supabase.rpc('fn_excluir_volume_expedicao', ...)`; usa `parseError` para erros e `toast.success` no fim, refazendo `crud.refetch()`.

## 3. Etiqueta de Volume 100×40 mm

### 3.1 Novos arquivos
- `src/components/etiqueta/EtiquetaVolumePreview.tsx` — reproduz o layout do anexo:
  - Cabeçalho preto: logo CORE LogiTrack + título "VOLUME DE EXPEDIÇÃO" + data/hora + usuário.
  - Lado esquerdo: Razão Social (parceiro), Destino (destino_carga), Data/Hora, "Volume / Total".
  - Lado direito: "CÓDIGO DO VOLUME" em caixa preta, código grande + `BarcodeRenderer` (Code128) + QR opcional.
  - Rodapé: aviso "ATENÇÃO" + URL corelogitrack.
  - Estritamente B/W, 800×320 px @ 203 DPI (reutiliza `thermalEngine`).
- `src/components/etiqueta/PrintEtiquetaVolumeModal.tsx` — clone enxuto de `PrintEtiquetaEnderecoModal` (apenas tamanho 100×40 mm horizontal, sem seletor de orientação/campos opcionais).

### 3.2 Registro no `thermalEngine`
Adicionar `TemplateId = "volume-100x40"` (800×320 px) — reaproveita geometria de `100x40`.

## 4. Ajustes auxiliares

- `src/hooks/useCrud.ts`: adicionar tratamento textual da nova view (`vw_volume_expedicao_lista`) — igual ao já feito para `vw_endereco_listagem`.
- Cache de opções: nenhuma dependência nova (dados já vêm da view).

## Fora do escopo
- Não altera o fluxo do coletor que gera volumes.
- Não altera `MovimentoSaidaPage` nem relatórios.
- Não implementa impressão em outros tamanhos (mantido apenas 100×40 conforme padrão solicitado).

## Detalhes técnicos

```text
Fluxo de exclusão
─────────────────
UI (status=ABERTO) → confirm dialog → rpc fn_excluir_volume_expedicao
   ├── COUNT antes
   ├── DELETE volume_expedicao
   ├── COUNT depois
   └── registrar_ocorrencia_operacional (categoria EXPEDICAO)
```

Etiqueta reutiliza `BarcodeRenderer` (Code128, `codigo_volume`) e `QRCodeRenderer` (opcional). Preview e impressão seguem o mesmo mecanismo já utilizado em `PrintEtiquetaEnderecoModal`.

## Validação
- Build TypeScript.
- Filtros combinados (status + data + onda + código) retornam apenas volumes do tenant.
- Exclusão em status ≠ ABERTO é bloqueada com mensagem clara.
- Ocorrência criada aparece em `/ocorrencias` com descrição contendo `codigo_volume`, `total_antes` e `total_depois`.
- Preview da etiqueta renderiza layout do anexo com código de barras Code128 legível.
