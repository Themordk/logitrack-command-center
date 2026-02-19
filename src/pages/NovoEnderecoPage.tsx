import { useState, useMemo } from "react";
import { mockArmazens, mockSetores, mockTiposEstoque, mockEstruturas, mockEnderecos } from "@/data/mockData";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Building2, MapPin, Layers, Tag, ArrowLeft, Save, X,
  LayoutGrid, Weight, Ruler, ChevronDown, AlertCircle,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────── */
interface FormData {
  armazemId: string;
  setorId: string;
  tipoEstoqueId: string;
  tipoEstruturaId: string;
  rua: string;
  predio: string;
  nivel: string;
  apto: string;
  descricao: string;
  altura: string;
  largura: string;
  comprimento: string;
  m3: string;
  pesoTotal: string;
  tipoEndereco: string;
  totalPallet: string;
  curvaAcesso: string;
  lado: string;
  situacao: string;
  ativo: boolean;
}

interface FormErrors {
  [key: string]: string;
}

/* ─── SearchSelect component ─────────────────────────── */
function SearchSelect({
  label, required, value, onChange, options, placeholder, error, disabled,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((p) => !p); }}
        className={cn(
          "w-full flex items-center justify-between h-10 px-3 rounded-lg border text-sm transition-colors",
          "bg-secondary/40 text-foreground",
          error ? "border-destructive" : "border-border",
          open && !error ? "border-primary ring-1 ring-primary/30" : "",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-primary/60 cursor-pointer",
        )}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.label : (placeholder ?? "Selecionar...")}
        </span>
        <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-secondary/50 rounded px-3 py-1.5 text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground text-center">Nenhum resultado</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setQ(""); }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors",
                    value === o.value ? "text-primary font-medium bg-primary/5" : "text-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 mt-1 text-xs text-destructive">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

/* ─── Field wrappers ─────────────────────────────────── */
function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, error, type = "text", step,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; error?: string; type?: string; step?: string;
}) {
  return (
    <div>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-10 px-3 rounded-lg border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
          error ? "border-destructive" : "border-border",
          "focus:border-primary focus:ring-1 focus:ring-primary/30",
        )}
      />
      {error && (
        <p className="flex items-center gap-1 mt-1 text-xs text-destructive">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

/* ─── Section wrapper ────────────────────────────────── */
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-surface p-6">
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-primary/15 flex items-center justify-center text-primary">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* ─── Situação badge ─────────────────────────────────── */
const situacaoBadge: Record<string, { label: string; cls: string }> = {
  "0": { label: "Livre", cls: "bg-green-500/15 text-green-400 border-green-500/25" },
  "1": { label: "Ocupado", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
  "2": { label: "Bloqueado", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
};

/* ─── Auto-generate description ──────────────────────── */
function buildDescricao(rua: string, predio: string, nivel: string, apto: string) {
  const pad = (v: string) => v.padStart(2, "0");
  if (rua && predio && nivel && apto) {
    return `R${pad(rua)}-P${pad(predio)}-N${pad(nivel)}-A${pad(apto)}`;
  }
  return "";
}

/* ─── Main Page ──────────────────────────────────────── */
interface NovoEnderecoPageProps {
  onBack: () => void;
  onSave?: (data: FormData) => void;
}

const EMPTY_FORM: FormData = {
  armazemId: "", setorId: "", tipoEstoqueId: "", tipoEstruturaId: "",
  rua: "", predio: "", nivel: "", apto: "", descricao: "",
  altura: "", largura: "", comprimento: "", m3: "", pesoTotal: "",
  tipoEndereco: "", totalPallet: "", curvaAcesso: "", lado: "", situacao: "0",
  ativo: true,
};

export function NovoEnderecoPage({ onBack, onSave }: NovoEnderecoPageProps) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);

  /* Filtered sectors by armazém */
  const setoresFiltrados = useMemo(() =>
    mockSetores.filter((s) => {
      if (!form.armazemId) return true;
      const arm = mockArmazens.find((a) => String(a.id) === form.armazemId);
      return arm ? s.armazem === arm.codigo : true;
    }),
    [form.armazemId]
  );

  /* Auto-build description when coords change */
  const set = (field: keyof FormData, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-generate description from coordinates
      if (["rua", "predio", "nivel", "apto"].includes(field as string)) {
        const r = field === "rua" ? String(value) : prev.rua;
        const p = field === "predio" ? String(value) : prev.predio;
        const n = field === "nivel" ? String(value) : prev.nivel;
        const a = field === "apto" ? String(value) : prev.apto;
        next.descricao = buildDescricao(r, p, n, a);
      }
      return next;
    });
    // Clear error on change
    setErrors((e) => { const ne = { ...e }; delete ne[field]; return ne; });
  };

  /* Validation */
  const validate = () => {
    const e: FormErrors = {};
    if (!form.armazemId) e.armazemId = "Armazém é obrigatório";
    if (!form.setorId) e.setorId = "Setor é obrigatório";
    if (!form.tipoEstoqueId) e.tipoEstoqueId = "Tipo de Estoque é obrigatório";
    if (!form.tipoEstruturaId) e.tipoEstruturaId = "Tipo de Estrutura é obrigatório";
    if (!form.rua) e.rua = "Obrigatório";
    if (!form.predio) e.predio = "Obrigatório";
    if (!form.nivel) e.nivel = "Obrigatório";
    if (!form.apto) e.apto = "Obrigatório";
    if (!form.descricao) e.descricao = "Descrição é obrigatória";
    else {
      const exists = mockEnderecos.some(
        (en) => en.codigo.toLowerCase() === form.descricao.toLowerCase()
      );
      if (exists) e.descricao = "Este endereço já existe no sistema";
    }
    if (!form.tipoEndereco) e.tipoEndereco = "Tipo de Endereço é obrigatório";
    if (form.tipoEndereco === "0" && !form.totalPallet) e.totalPallet = "Total de pallets é obrigatório para Pulmão";
    if (!form.lado) e.lado = "Lado é obrigatório";
    if (!form.situacao) e.situacao = "Situação é obrigatória";
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaved(true);
    setTimeout(() => {
      onSave?.(form);
      onBack();
    }, 1200);
  };

  const handleReset = () => {
    setForm(EMPTY_FORM);
    setErrors({});
  };

  /* Options helpers */
  const armazemOptions = mockArmazens
    .filter((a) => a.status === "ativo")
    .map((a) => ({ value: String(a.id), label: `${a.codigo} – ${a.descricao}` }));

  const setorOptions = setoresFiltrados
    .filter((s) => s.status === "ativo")
    .map((s) => ({ value: String(s.id), label: `${s.codigo} – ${s.descricao}` }));

  const tipoEstoqueOptions = mockTiposEstoque
    .filter((t) => t.status === "ativo")
    .map((t) => ({ value: String(t.id), label: `${t.sigla} – ${t.descricao}` }));

  const tipoEstruturaOptions = mockEstruturas
    .filter((t) => t.status === "ativo")
    .map((t) => ({ value: String(t.id), label: `${t.codigo} – ${t.descricao}` }));

  const badge = situacaoBadge[form.situacao];
  const isPulmao = form.tipoEndereco === "0";

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Novo Endereço / Localização</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Armazém → Localizações → Novo Endereço</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={14} /> Limpar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saved}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              saved
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Save size={14} />
            {saved ? "Salvo!" : "Salvar Endereço"}
          </button>
        </div>
      </div>

      {/* Description preview badge */}
      {form.descricao && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
          <MapPin size={16} className="text-primary shrink-0" />
          <span className="text-xs text-muted-foreground">Código gerado:</span>
          <span className="font-mono font-bold text-primary text-sm">{form.descricao}</span>
          {badge && (
            <span className={cn("ml-auto text-xs px-2 py-0.5 rounded-full border font-medium", badge.cls)}>
              {badge.label}
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* ── Seção 1: Vínculos Estruturais ── */}
        <Section title="Seção 1 — Vínculos Estruturais" icon={<Building2 size={14} />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Armazém" required />
              <SearchSelect
                label="Armazém"
                required
                value={form.armazemId}
                onChange={(v) => {
                  set("armazemId", v);
                  set("setorId", ""); // reset setor when armazém changes
                }}
                options={armazemOptions}
                placeholder="Selecionar Armazém..."
                error={errors.armazemId}
              />
            </div>
            <div>
              <FieldLabel label="Setor" required />
              <SearchSelect
                label="Setor"
                required
                value={form.setorId}
                onChange={(v) => set("setorId", v)}
                options={setorOptions}
                placeholder={form.armazemId ? "Selecionar Setor..." : "Selecione um armazém primeiro"}
                error={errors.setorId}
                disabled={!form.armazemId}
              />
            </div>
            <div>
              <FieldLabel label="Tipo de Estoque" required />
              <SearchSelect
                label="Tipo de Estoque"
                required
                value={form.tipoEstoqueId}
                onChange={(v) => set("tipoEstoqueId", v)}
                options={tipoEstoqueOptions}
                placeholder="Selecionar Tipo..."
                error={errors.tipoEstoqueId}
              />
            </div>
            <div>
              <FieldLabel label="Tipo de Estrutura" required />
              <SearchSelect
                label="Tipo de Estrutura"
                required
                value={form.tipoEstruturaId}
                onChange={(v) => set("tipoEstruturaId", v)}
                options={tipoEstruturaOptions}
                placeholder="Selecionar Estrutura..."
                error={errors.tipoEstruturaId}
              />
            </div>
          </div>
        </Section>

        {/* ── Seção 2: Estrutura Física ── */}
        <Section title="Seção 2 — Estrutura Física da Localização" icon={<LayoutGrid size={14} />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { field: "rua" as keyof FormData, label: "Rua (Corredor)", placeholder: "Ex: 1" },
              { field: "predio" as keyof FormData, label: "Prédio (Módulo)", placeholder: "Ex: 2" },
              { field: "nivel" as keyof FormData, label: "Nível", placeholder: "Ex: 3" },
              { field: "apto" as keyof FormData, label: "Apto (Posição)", placeholder: "Ex: 4" },
            ].map(({ field, label, placeholder }) => (
              <div key={field}>
                <FieldLabel label={label} required />
                <TextInput
                  value={String(form[field])}
                  onChange={(v) => set(field, v.replace(/\D/g, ""))}
                  placeholder={placeholder}
                  error={errors[field]}
                  type="number"
                />
              </div>
            ))}
          </div>

          <div>
            <FieldLabel label="Descrição da Localização" required />
            <div className="relative">
              <input
                value={form.descricao}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="R01-P02-N03-A04 (preenchido automaticamente)"
                className={cn(
                  "w-full h-10 px-3 rounded-lg border bg-secondary/40 font-mono text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
                  errors.descricao ? "border-destructive" : "border-border",
                  "focus:border-primary focus:ring-1 focus:ring-primary/30",
                )}
              />
              {errors.descricao && (
                <p className="flex items-center gap-1 mt-1 text-xs text-destructive">
                  <AlertCircle size={11} /> {errors.descricao}
                </p>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Preenchido automaticamente a partir das coordenadas. Deve ser único no sistema.
            </p>
          </div>
        </Section>

        {/* ── Seção 3: Dimensões e Capacidade ── */}
        <Section title="Seção 3 — Dimensões e Capacidade" icon={<Ruler size={14} />}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { field: "altura" as keyof FormData, label: "Altura (cm)", placeholder: "Ex: 180.0" },
              { field: "largura" as keyof FormData, label: "Largura (cm)", placeholder: "Ex: 270.0" },
              { field: "comprimento" as keyof FormData, label: "Comprimento (cm)", placeholder: "Ex: 110.0" },
              { field: "m3" as keyof FormData, label: "Capacidade em m³", placeholder: "Ex: 2.4" },
              { field: "pesoTotal" as keyof FormData, label: "Peso Suportado (kg)", placeholder: "Ex: 1500" },
            ].map(({ field, label, placeholder }) => (
              <div key={field}>
                <FieldLabel label={label} />
                <TextInput
                  value={String(form[field])}
                  onChange={(v) => set(field, v)}
                  placeholder={placeholder}
                  error={errors[field]}
                  type="number"
                  step="0.01"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
            <Weight size={11} /> Campos opcionais. Utilizados para cálculo de ocupação e sugestão de endereçamento.
          </p>
        </Section>

        {/* ── Seção 4: Configuração Operacional ── */}
        <Section title="Seção 4 — Configuração Operacional" icon={<Tag size={14} />}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Tipo de Endereço */}
            <div>
              <FieldLabel label="Tipo de Endereço" required />
              <SearchSelect
                label="Tipo de Endereço"
                required
                value={form.tipoEndereco}
                onChange={(v) => {
                  set("tipoEndereco", v);
                  if (v !== "0") set("totalPallet", "");
                }}
                options={[
                  { value: "0", label: "🔵 Pulmão" },
                  { value: "1", label: "🟣 Picking" },
                ]}
                placeholder="Selecionar Tipo..."
                error={errors.tipoEndereco}
              />
            </div>

            {/* Total de Pallets – only for Pulmão */}
            {isPulmao && (
              <div>
                <FieldLabel label="Total de Pallets Suportados" required />
                <TextInput
                  value={form.totalPallet}
                  onChange={(v) => set("totalPallet", v.replace(/\D/g, ""))}
                  placeholder="Ex: 3"
                  error={errors.totalPallet}
                  type="number"
                />
              </div>
            )}

            {/* Curva de Acesso */}
            <div>
              <FieldLabel label="Curva de Acesso" />
              <SearchSelect
                label="Curva"
                value={form.curvaAcesso}
                onChange={(v) => set("curvaAcesso", v)}
                options={["A", "B", "C", "D"].map((c) => ({ value: c, label: `Curva ${c}` }))}
                placeholder="Selecionar Curva..."
              />
            </div>

            {/* Lado */}
            <div>
              <FieldLabel label="Lado" required />
              <SearchSelect
                label="Lado"
                required
                value={form.lado}
                onChange={(v) => set("lado", v)}
                options={[
                  { value: "par", label: "Par" },
                  { value: "impar", label: "Ímpar" },
                ]}
                placeholder="Selecionar Lado..."
                error={errors.lado}
              />
            </div>

            {/* Situação */}
            <div>
              <FieldLabel label="Situação" required />
              <SearchSelect
                label="Situação"
                required
                value={form.situacao}
                onChange={(v) => set("situacao", v)}
                options={[
                  { value: "0", label: "🟢 Livre" },
                  { value: "1", label: "🟡 Ocupado" },
                  { value: "2", label: "🔴 Bloqueado" },
                ]}
                placeholder="Selecionar Situação..."
                error={errors.situacao}
              />
              {badge && (
                <span className={cn("inline-flex mt-2 text-xs px-2 py-0.5 rounded-full border font-medium", badge.cls)}>
                  {badge.label}
                </span>
              )}
            </div>

            {/* Ativo */}
            <div className="flex flex-col justify-center">
              <FieldLabel label="Ativo" required />
              <div className="flex items-center gap-3 h-10">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => set("ativo", v)}
                />
                <span className="text-sm text-foreground">
                  {form.ativo ? "Sim – Endereço ativo" : "Não – Endereço inativo"}
                </span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Footer actions ── */}
        <div className="flex items-center justify-between pt-2 pb-6">
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Campos obrigatórios
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X size={14} /> Cancelar
            </button>
            <button
              type="submit"
              disabled={saved}
              className={cn(
                "flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-all",
                saved
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              <Save size={14} />
              {saved ? "Endereço Salvo!" : "Salvar Endereço"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
