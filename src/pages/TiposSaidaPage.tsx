import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PADRAO_EXIBICAO_COLETOR } from "@/lib/exibicaoColetor";
import { MOMENTO_CONFERENCIA_LABEL, MOMENTO_CONFERENCIA_OPCOES, type MomentoConferencia } from "@/lib/momentoConferencia";
import { Save, Loader2 } from "lucide-react";

const ETAPA_CONCLUSAO_LABEL = { SEPARACAO: "Separação", CONFERENCIA: "Conferência", EMBARQUE: "Embarque" } as const;

/** Espelha a regra do banco (tg_tipo_saida_etapa_conclusao) só para exibir antes de salvar. */
function etapaConclusao(t: { realiza_embarque?: boolean | null; realiza_conferencia?: boolean | null }): keyof typeof ETAPA_CONCLUSAO_LABEL {
  if (t.realiza_embarque) return "EMBARQUE";
  if (t.realiza_conferencia) return "CONFERENCIA";
  return "SEPARACAO";
}

export function TiposSaidaPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({ table: "tipo_saida", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const boolBadge = (val: any) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${val ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
      {val ? "Sim" : "Não"}
    </span>
  );

  const prioridadeBadge = (val: string) => {
    const colors: Record<string, string> = {
      BAIXA: "bg-muted text-muted-foreground",
      NORMAL: "bg-blue-500/10 text-blue-500",
      ALTA: "bg-orange-500/10 text-orange-500",
      URGENTE: "bg-red-500/10 text-red-500",
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[val] || colors.NORMAL}`}>{val || "NORMAL"}</span>;
  };

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição" },
    { key: "codigo_erp", label: "Código ERP" },
    { key: "realiza_conferencia", label: "Realiza Conferência", type: "custom", render: (row) => boolBadge(row.realiza_conferencia) },
    { key: "realiza_embarque", label: "Realiza Embarque", type: "custom", render: (row) => boolBadge(row.realiza_embarque) },
    { key: "etapa_conclusao", label: "Conclui em", type: "custom", render: (row) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-500">
        {ETAPA_CONCLUSAO_LABEL[etapaConclusao(row)]}
      </span>
    ) },
    { key: "momento_conferencia", label: "Modo Conferência", type: "custom", render: (row) => (
      row.realiza_conferencia
        ? <span className="text-xs text-foreground">{MOMENTO_CONFERENCIA_LABEL[row.momento_conferencia as MomentoConferencia] ?? MOMENTO_CONFERENCIA_LABEL.PRE_FATURAMENTO}</span>
        : <span className="text-xs text-muted-foreground">—</span>
    ) },
    { key: "conferencia_checkout", label: "Conferência Checkout", type: "custom", render: (row) => boolBadge(row.conferencia_checkout) },
    { key: "separa_pulmao", label: "Separa Pulmão", type: "custom", render: (row) => boolBadge(row.separa_pulmao) },
    { key: "libera_sem_saldo_picking", label: "Libera s/ Saldo Pick.", type: "custom", render: (row) => boolBadge(row.libera_sem_saldo_picking) },
    { key: "exibe_parceiro_separacao", label: "Coletor", type: "custom", render: (row) => {
      const opcoes = [
        { ativo: row.exibe_parceiro_separacao, label: "Parc. Sep." },
        { ativo: row.exibe_vendedor_separacao, label: "Vend. Sep." },
        { ativo: row.exibe_parceiro_conferencia, label: "Parc. Conf." },
        { ativo: row.exibe_vendedor_conferencia, label: "Vend. Conf." },
      ].filter(({ ativo }) => ativo === true);
      return opcoes.length ? <div className="flex flex-wrap gap-1">
        {opcoes.map(({ label }) => <Badge key={label} variant="outline" className="text-[10px] bg-secondary text-foreground">{label}</Badge>)}
      </div> : "—";
    } },
    { key: "gera_mov_automatico", label: "Gera Mov. Automático", type: "custom", render: (row) => boolBadge(row.gera_mov_automatico) },
    { key: "libera_mov_automatico", label: "Libera Mov. Automático", type: "custom", render: (row) => boolBadge(row.libera_mov_automatico) },
    { key: "conferencia_cega", label: "Conf. Cega", type: "custom", render: (row) => boolBadge(row.conferencia_cega) },
    { key: "gera_volume_etapa", label: "Gera Volume Em", type: "custom", render: (row) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-500">
        {row.gera_volume_etapa || "CONFERÊNCIA"}
      </span>
    ) },
    { key: "gera_abastecimento_automatico", label: "Abast. Automático", type: "custom", render: (row) => boolBadge(row.gera_abastecimento_automatico) },
    { key: "prioridade", label: "Prioridade", type: "custom", render: (row) => prioridadeBadge(row.prioridade) },
    { key: "reserva_separacao_movimento", label: "Reserva Sep. Movimento", type: "custom", render: (row) => boolBadge(row.reserva_separacao_movimento) },
    { key: "reserva_conferencia_movimento", label: "Reserva Conf. Movimento", type: "custom", render: (row) => boolBadge(row.reserva_conferencia_movimento) },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const openModal = (item: any | null) => {
    setEditItem(item);
    setForm(item ? { libera_sem_saldo_picking: false, ...PADRAO_EXIBICAO_COLETOR, ...item } : {
      descricao: "", codigo_erp: "", prioridade: "NORMAL",
      realiza_conferencia: true, conferencia_checkout: false, conferencia_cega: false, realiza_embarque: false, exige_confirmacao_veiculo: false, reserva_embarque_carga: false, permite_mesmo_operador_conf_emb: true, libera_embarque_automatico: false,
      momento_conferencia: "PRE_FATURAMENTO",
      separa_pulmao: false, ...PADRAO_EXIBICAO_COLETOR, gera_volume_etapa: "CONFERÊNCIA",
      gera_mov_automatico: false, libera_mov_automatico: false,
      gera_abastecimento_automatico: false,
      libera_sem_saldo_picking: false,
      reserva_separacao_movimento: true, reserva_conferencia_movimento: true,
      permite_mesmo_operador_sep_conf: true,
      ativo: true,
    });
    setModalOpen(true);
  };

  const set = (name: string, value: any) => setForm((p) => ({ ...p, [name]: value }));

  const handleSave = async () => {
    if (!form.descricao) return;
    setSaving(true);
    const payload: any = { ...PADRAO_EXIBICAO_COLETOR, ...form, empresa_id: empresaId };
    delete payload.etapa_conclusao; // calculada no banco (gatilho) a partir das etapas ligadas
    if (!payload.realiza_conferencia) {
      payload.conferencia_checkout = false;
      payload.conferencia_cega = false;
      payload.reserva_conferencia_movimento = true;
      payload.permite_mesmo_operador_sep_conf = true;
      payload.permite_mesmo_operador_conf_emb = true;
      payload.momento_conferencia = "PRE_FATURAMENTO";
    }
    if (!payload.realiza_embarque) {
      payload.exige_confirmacao_veiculo = false;
      payload.reserva_embarque_carga = false;
      payload.permite_mesmo_operador_conf_emb = true;
      payload.libera_embarque_automatico = false;
    }
    if (payload.momento_conferencia !== "POS_FATURAMENTO") {
      payload.momento_conferencia = "PRE_FATURAMENTO";
    }
    const ok = editItem
      ? await crud.update(editItem.id, payload)
      : await crud.create(payload);
    setSaving(false);
    if (ok) setModalOpen(false);
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";
  const sectionClass = "space-y-3 p-4 rounded-lg border border-border/50 bg-secondary/20";
  const sectionTitleClass = "text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3";

  return (
    <>
      <CrudTable
        title="Tipos de Saída"
        columns={columns}
        data={crud.data}
        loading={crud.loading}
        search={crud.search}
        onSearchChange={crud.setSearch}
        page={crud.page}
        totalPages={crud.totalPages}
        total={crud.total}
        pageSize={crud.pageSize}
        onPageChange={crud.setPage}
        onNew={() => openModal(null)}
        onEdit={(row) => openModal(row)}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Novo Tipo de Saída"
      />

      <Sheet open={modalOpen} onOpenChange={(v) => !v && setModalOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl !p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
            <SheetTitle>{editItem ? "Editar Tipo de Saída" : "Novo Tipo de Saída"}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-5">
            {/* ── Dados gerais ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Dados gerais</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Descrição *</label>
                  <input value={form.descricao || ""} onChange={(e) => set("descricao", e.target.value)} placeholder="Tipo de saída" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Código ERP</label>
                  <input value={form.codigo_erp || ""} onChange={(e) => set("codigo_erp", e.target.value)} placeholder="Código no ERP" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Prioridade *</label>
                  <select value={form.prioridade || "NORMAL"} onChange={(e) => set("prioridade", e.target.value)} className={inputClass}>
                    {["BAIXA", "NORMAL", "ALTA", "URGENTE"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-border bg-background/40 px-3 py-2">
                <p className="text-sm text-foreground">
                  Este tipo conclui ao fim da: <b>{ETAPA_CONCLUSAO_LABEL[etapaConclusao(form)]}</b>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  A onda fica concluída na última etapa ligada (separação → conferência → embarque). Ondas já liberadas mantêm a regra da liberação.
                </p>
              </div>
            </div>

            {/* ── Informações exibidas no coletor ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Informações exibidas no coletor</p>
              <p className="text-xs text-muted-foreground">Escolha o que o operador vê ao escolher a onda no coletor.</p>
              <div className="grid grid-cols-3 items-center gap-x-2 gap-y-3">
                <div />
                <span className="text-xs text-muted-foreground uppercase text-center">Separação</span>
                <span className={`text-xs text-muted-foreground uppercase text-center ${!form.realiza_conferencia ? "opacity-50" : ""}`}>Conferência</span>
                {([
                  ["Parceiro", "exibe_parceiro_separacao", "exibe_parceiro_conferencia"],
                  ["Vendedor", "exibe_vendedor_separacao", "exibe_vendedor_conferencia"],
                ] as const).map(([label, separacao, conferencia]) => (
                  <div key={label} className="contents">
                    <span className="text-sm text-foreground">{label}</span>
                    <div className="flex justify-center">
                      <Switch aria-label={`Exibir ${label.toLowerCase()} na separação`} checked={!!form[separacao]} onCheckedChange={(v) => set(separacao, v)} />
                    </div>
                    <div className={`flex justify-center ${!form.realiza_conferencia ? "opacity-50" : ""}`}>
                      <Switch aria-label={`Exibir ${label.toLowerCase()} na conferência`} checked={!!form[conferencia]} onCheckedChange={(v) => set(conferencia, v)} disabled={!form.realiza_conferencia} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Em ondas com pedidos de tipos diferentes, a informação só aparece se todos os tipos permitirem.</p>
            </div>

            {/* ── Separação ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Separação e volume</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.separa_pulmao} onCheckedChange={(v) => set("separa_pulmao", v)} />
                  <label className="text-sm text-foreground">Separa pulmão</label>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Switch id="libera-sem-saldo-picking" checked={!!form.libera_sem_saldo_picking} onCheckedChange={(v) => set("libera_sem_saldo_picking", v)} />
                    <label htmlFor="libera-sem-saldo-picking" className="text-sm text-foreground">Libera sem saldo no picking</label>
                  </div>
                  <p className="text-xs text-muted-foreground">Libera a onda mesmo com item zerado no picking ou sem picking mapeado. O item aparece no coletor com aviso e só pode ser coletado após abastecimento/mapeamento, ou cortado.</p>
                  {form.libera_sem_saldo_picking && form.gera_abastecimento_automatico && <p className="text-xs text-muted-foreground">O abastecimento do pulmão para o picking será gerado automaticamente na liberação.</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Gera volume na etapa</label>
                  <select value={form.gera_volume_etapa || "CONFERÊNCIA"} onChange={(e) => set("gera_volume_etapa", e.target.value)} className={inputClass}>
                    {["NENHUMA", "SEPARAÇÃO", "CONFERÊNCIA", "CARREGAMENTO"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Conferência ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Conferência</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.realiza_conferencia} onCheckedChange={(v) => set("realiza_conferencia", v)} />
                  <label className="text-sm text-foreground">Realiza conferência</label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={!!form.conferencia_checkout}
                    onCheckedChange={(v) => set("conferencia_checkout", v)}
                    disabled={!form.realiza_conferencia}
                    className={!form.realiza_conferencia ? "opacity-50" : ""}
                  />
                  <label className={`text-sm ${!form.realiza_conferencia ? "text-muted-foreground opacity-50" : "text-foreground"}`}>Conferência checkout</label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={!!form.conferencia_cega}
                    onCheckedChange={(v) => set("conferencia_cega", v)}
                    disabled={!form.realiza_conferencia}
                    className={!form.realiza_conferencia ? "opacity-50" : ""}
                  />
                  <label className={`text-sm ${!form.realiza_conferencia ? "text-muted-foreground opacity-50" : "text-foreground"}`}>Conferência cega</label>
                </div>
                <div className={`pt-1 ${!form.realiza_conferencia ? "opacity-50" : ""}`}>
                  <label htmlFor="momento-conferencia" className="text-xs text-muted-foreground mb-1 block">Modo de conferência</label>
                  <select
                    id="momento-conferencia"
                    value={form.realiza_conferencia ? (form.momento_conferencia || "PRE_FATURAMENTO") : "PRE_FATURAMENTO"}
                    onChange={(e) => set("momento_conferencia", e.target.value)}
                    disabled={!form.realiza_conferencia}
                    className={inputClass}
                  >
                    {MOMENTO_CONFERENCIA_OPCOES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.momento_conferencia === "POS_FATURAMENTO" && form.realiza_conferencia
                      ? "A onda só aparece na conferência do coletor depois que todos os pedidos tiverem NF autorizada vinculada (enviada pelo ERP)."
                      : "A onda aparece na conferência assim que a separação termina, antes da emissão da NF."}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="permite-mesmo-operador"
                    checked={form.permite_mesmo_operador_sep_conf !== false}
                    onCheckedChange={(v) => set("permite_mesmo_operador_sep_conf", v)}
                    disabled={!form.realiza_conferencia}
                    className={!form.realiza_conferencia ? "opacity-50" : ""}
                  />
                  <div>
                    <label htmlFor="permite-mesmo-operador" className={`text-sm ${!form.realiza_conferencia ? "text-muted-foreground opacity-50" : "text-foreground"}`}>
                      Permite o mesmo operador separar e conferir
                    </label>
                    <p className={`text-xs ${!form.realiza_conferencia ? "text-muted-foreground opacity-30" : "text-muted-foreground"}`}>
                      {form.permite_mesmo_operador_sep_conf !== false
                        ? "Quem separou a onda também pode conferi-la"
                        : "Quem separou a onda não pode conferi-la"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Embarque e conclusão ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Embarque e conclusão</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch id="realiza-embarque" checked={!!form.realiza_embarque} onCheckedChange={(v) => set("realiza_embarque", v)} />
                  <label htmlFor="realiza-embarque" className="text-sm text-foreground">Realiza embarque (montagem de carga e bip no veículo)</label>
                </div>
                <div className="flex items-start gap-3 pl-1">
                  <Switch id="exige-confirmacao-veiculo" checked={!!form.exige_confirmacao_veiculo} disabled={!form.realiza_embarque}
                    onCheckedChange={(v) => set("exige_confirmacao_veiculo", v)} />
                  <div>
                    <label htmlFor="exige-confirmacao-veiculo" className="text-sm text-foreground">Exige confirmação do veículo no embarque</label>
                    <p className="text-xs text-muted-foreground">
                      Em carga de veículo próprio, o operador bipa o QR da etiqueta do veículo antes de conferir os volumes. A etiqueta é impressa no cadastro de veículos.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="permite-mesmo-operador-conf-emb"
                    checked={form.permite_mesmo_operador_conf_emb !== false}
                    onCheckedChange={(v) => set("permite_mesmo_operador_conf_emb", v)}
                    disabled={!form.realiza_embarque || !form.realiza_conferencia}
                    className={!form.realiza_embarque || !form.realiza_conferencia ? "opacity-50" : ""}
                  />
                  <div>
                    <label htmlFor="permite-mesmo-operador-conf-emb" className={`text-sm ${!form.realiza_embarque || !form.realiza_conferencia ? "text-muted-foreground opacity-50" : "text-foreground"}`}>
                      Permite o mesmo operador conferir e embarcar
                    </label>
                    <p className={`text-xs ${!form.realiza_embarque || !form.realiza_conferencia ? "text-muted-foreground opacity-30" : "text-muted-foreground"}`}>
                      {!form.realiza_embarque || !form.realiza_conferencia
                        ? "Disponível quando o tipo realiza conferência e embarque"
                        : form.permite_mesmo_operador_conf_emb !== false
                        ? "Quem conferiu a onda também pode embarcá-la"
                        : "Quem conferiu a onda não pode embarcar a carga dela"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Reserva de tarefas ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Reserva de tarefas</p>
              <p className="text-xs text-muted-foreground mb-3">
                Define se a onda (ou a carga, no embarque) inteira é reservada para 1 operador ou se múltiplos operadores podem trabalhar simultaneamente.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={!!form.reserva_separacao_movimento}
                    onCheckedChange={(v) => set("reserva_separacao_movimento", v)}
                  />
                  <div>
                    <label className="text-sm text-foreground">Reserva todo o movimento na separação</label>
                    <p className="text-xs text-muted-foreground">
                      {form.reserva_separacao_movimento
                        ? "Apenas 1 operador pode separar a onda"
                        : "Múltiplos operadores podem separar a mesma onda"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={!!form.reserva_conferencia_movimento}
                    onCheckedChange={(v) => set("reserva_conferencia_movimento", v)}
                    disabled={!form.realiza_conferencia}
                    className={!form.realiza_conferencia ? "opacity-50" : ""}
                  />
                  <div>
                    <label className={`text-sm ${!form.realiza_conferencia ? "text-muted-foreground opacity-50" : "text-foreground"}`}>
                      Reserva todo o movimento na conferência
                    </label>
                    <p className={`text-xs ${!form.realiza_conferencia ? "text-muted-foreground opacity-30" : "text-muted-foreground"}`}>
                      {form.reserva_conferencia_movimento
                        ? "Apenas 1 operador pode conferir a onda"
                        : "Múltiplos operadores podem conferir a mesma onda"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="reserva-embarque-carga"
                    checked={!!form.reserva_embarque_carga}
                    onCheckedChange={(v) => set("reserva_embarque_carga", v)}
                    disabled={!form.realiza_embarque}
                    className={!form.realiza_embarque ? "opacity-50" : ""}
                  />
                  <div>
                    <label htmlFor="reserva-embarque-carga" className={`text-sm ${!form.realiza_embarque ? "text-muted-foreground opacity-50" : "text-foreground"}`}>
                      Reserva toda a carga no embarque
                    </label>
                    <p className={`text-xs ${!form.realiza_embarque ? "text-muted-foreground opacity-30" : "text-muted-foreground"}`}>
                      {!form.realiza_embarque
                        ? "Disponível quando o tipo realiza embarque"
                        : form.reserva_embarque_carga
                        ? "Apenas 1 operador embarca a carga: ela fica com quem iniciar o embarque"
                        : "Múltiplos operadores podem embarcar a mesma carga"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Automação ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Automação</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.gera_mov_automatico} onCheckedChange={(v) => set("gera_mov_automatico", v)} />
                  <label className="text-sm text-foreground">Gera movimento automático</label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.libera_mov_automatico} onCheckedChange={(v) => set("libera_mov_automatico", v)} />
                  <label className="text-sm text-foreground">Libera movimento automático</label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="libera-embarque-automatico"
                    checked={!!form.libera_embarque_automatico}
                    onCheckedChange={(v) => set("libera_embarque_automatico", v)}
                    disabled={!form.realiza_embarque}
                    className={!form.realiza_embarque ? "opacity-50" : ""}
                  />
                  <div>
                    <label htmlFor="libera-embarque-automatico" className={`text-sm ${!form.realiza_embarque ? "text-muted-foreground opacity-50" : "text-foreground"}`}>
                      Libera embarque automático
                    </label>
                    <p className={`text-xs ${!form.realiza_embarque ? "text-muted-foreground opacity-30" : "text-muted-foreground"}`}>
                      {!form.realiza_embarque
                        ? "Disponível quando o tipo realiza embarque"
                        : "A carga montada com veículo (ou transportadora) é liberada para o coletor pelo job das saídas, 2 minutos após a última alteração"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.gera_abastecimento_automatico} onCheckedChange={(v) => set("gera_abastecimento_automatico", v)} />
                  <label className="text-sm text-foreground">Gera abastecimento automático</label>
                </div>
              </div>
            </div>

            {/* ── Status ── */}
            <div className="flex items-center gap-3 px-4">
              <Switch checked={form.ativo !== false} onCheckedChange={(v) => set("ativo", v)} />
              <label className="text-sm text-foreground font-medium">Ativo</label>
            </div>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border shrink-0 flex-row justify-end gap-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>


      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
    </>
  );
}
