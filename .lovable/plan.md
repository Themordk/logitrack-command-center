## Objetivo

Adicionar à página de detalhe da ocorrência (`/atividades/ocorrencias/:id`, componente `OcorrenciaDetalhePage.tsx`) um botão **"Registrar histórico"** que abre um modal de cadastro completo dos campos da tabela `ocorrencia_historico`. O modal incluirá uma opção para, no mesmo ato, **concluir a ocorrência operacional** (mudar status para `RESOLVIDA`).

## Onde

- `src/pages/OcorrenciaDetalhePage.tsx` — adicionar botão + modal + handler.
- Não cria novos arquivos. Padrão visual igual aos demais `Dialog`/cards já existentes na página (mesma tipografia, badges de status, `card-surface`, botões `ActionBtn`).

## Estrutura do modal "Registrar histórico"

Campos (todos da tabela `ocorrencia_historico`, escopo já injetado):

| Campo | UI | Obrigatório | Observações |
|---|---|---|---|
| `status_novo` | Select com os 4 enums (Aberta, Em investigação, Resolvida, Cancelada) | Sim | Default = status atual da ocorrência |
| `status_anterior` | Read-only (preenchido automaticamente com `ocorrencia.status`) | — | Enviado no insert |
| `observacao` | Textarea | Não (Sim quando `status_novo = RESOLVIDA`) | |
| `usuario_id` | Automático (`usuarioId` do contexto) | — | |
| `tenant_id`, `ocorrencia_id`, `criado_em` | Automáticos | — | |

Abaixo dos campos, um **checkbox / switch** "Concluir ocorrência operacional":
- Visível somente se a ocorrência ainda estiver ativa (`status != RESOLVIDA && != CANCELADA`).
- Quando marcado, força `status_novo = RESOLVIDA`, torna `observacao` obrigatória e, ao salvar, também atualiza `ocorrencia_operacional` com `status='RESOLVIDA'`, `resolvido_por=usuarioId`, `resolvido_em=now()`, `resolucao=observacao`.
- Quando desmarcado, apenas registra o histórico sem mexer no status mestre (a não ser que o usuário escolha manualmente outro `status_novo` — nesse caso também sincroniza `ocorrencia_operacional.status`).

## Botão de acesso

- Novo botão **"Registrar histórico"** (ícone `MessageSquare` + `Plus`) no header do card de **Histórico** (lado direito), sempre visível.
- Mantém os botões existentes ("Iniciar investigação", "Resolver", "Cancelar") inalterados — eles continuam como atalhos rápidos.

## Comportamento de salvamento

1. Validar `status_novo` e (quando aplicável) `observacao`.
2. `INSERT` em `ocorrencia_historico` com `status_anterior = ocorrencia.status`, `status_novo`, `observacao`, `usuario_id`, `tenant_id`, `ocorrencia_id`.
3. Se `status_novo !== ocorrencia.status` **ou** checkbox "concluir" marcado:
   - `UPDATE ocorrencia_operacional SET status = status_novo, updated_by = usuarioId` (+ campos de resolução quando `RESOLVIDA`).
4. Toast de sucesso, fechar modal, chamar `load()` para refresh do card e da timeline.
5. Tratamento de erro com toast padrão.

## Detalhes visuais (alinhados ao restante da tela)

- `Dialog` shadcn, `max-w-md`.
- Labels `text-[10px] uppercase font-medium text-muted-foreground`.
- Select/textarea com `bg-secondary/40 border-border focus:border-primary`.
- Botão primário "Salvar" com `Loader2` durante submit; botão secundário "Cancelar".
- Switch "Concluir ocorrência" com nota auxiliar em `text-[11px] text-muted-foreground` explicando o efeito.

## Fora do escopo

- Sem migrações de banco (tabela já existe e suporta os campos).
- Sem alterações na listagem `/atividades/ocorrencias`.
- Sem novas RPCs.
