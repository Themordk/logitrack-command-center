import { useState, useEffect, useMemo } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { fetchOptions } from "@/hooks/useCrud";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Layers, Eye, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";

interface Props {
  onNavigate?: (path: string) => void;
}

const TIPO_ESTRUTURA_OPTIONS = [
  "PORTA PALLET", "BLOCADO", "PRATELEIRA", "FLOW RACK", "DRIVE IN", "MEZANINO", "DOCA",
];
const SITUACAO_OPTIONS = ["LIVRE", "OCUPADO", "BLOQUEADO"];
const CURVA_OPTIONS = ["A", "B", "C", "D"];
const TIPO_ENDERECO_OPTIONS = ["PULMAO", "PICKING"];
const LADO_OPTIONS = ["PAR", "IMPAR", "TODOS"];
const MAX_BATCH = 5000;
const CHUNK_SIZE = 500;

const pad = (v: number | string) => String(v).padStart(2, "0");
const buildDescricao = (rua: number, predio: number, nivel: number, apto: number) =>
  `R${pad(rua)}-P${pad(predio)}-N${pad(nivel)}-A${pad(apto)}`;

const range = (ini: number, fim: number) => {
  const out: number[] = [];
  for (let i = ini; i <= fim; i++) out.push(i);
  return out;
};

export function EnderecosBatchPage({ onNavigate }: Props) {
  const { tenantId, armazemId: ctxArmazemId, empresaVersion } = useTenant();

  // Common (armazém vem do contexto, não é editável)
  const armazemId = ctxArmazemId || "";
  const [setorId, setSetorId] = useState("");
  const [tipoEstoqueId, setTipoEstoqueId] = useState("");
  const [tipoEndereco, setTipoEndereco] = useState("PICKING");
  const [tipoEstrutura, setTipoEstrutura] = useState("");
  const [situacao, setSituacao] = useState("LIVRE");
  const [curva, setCurva] = useState("");
  const [totalPallet, setTotalPallet] = useState("");
  const [altura, setAltura] = useState("");
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [m3, setM3] = useState("");
  const [pesoMax, setPesoMax] = useState("");
  const [ativo, setAtivo] = useState(true);

  // Ranges
  const [ruaIni, setRuaIni] = useState("1");
  const [ruaFim, setRuaFim] = useState("1");
  const [predioIni, setPredioIni] = useState("1");
  const [predioFim, setPredioFim] = useState("1");
  const [nivelIni, setNivelIni] = useState("1");
  const [nivelFim, setNivelFim] = useState("1");
  const [aptoIni, setAptoIni] = useState("1");
  const [aptoFim, setAptoFim] = useState("1");
  const [lado, setLado] = useState("TODOS");

  // Options
  const [setorOptions, setSetorOptions] = useState<{ value: string; label: string }[]>([]);
  const [tipoEstoqueOptions, setTipoEstoqueOptions] = useState<{ value: string; label: string }[]>([]);

  // UI state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Limpar seleções ao trocar empresa/armazém para evitar inconsistência
    setSetorId("");
    setTipoEstoqueId("");
    if (tenantId && armazemId) {
      fetchOptions("setor", tenantId, "descricao", { armazem_id: armazemId }).then(setSetorOptions);
      fetchOptions("tipo_estoque", tenantId, "descricao", { armazem_id: armazemId }).then(setTipoEstoqueOptions);
    } else {
      setSetorOptions([]);
      setTipoEstoqueOptions([]);
    }
  }, [tenantId, armazemId, empresaVersion]);

  const combos = useMemo(() => {
    const rIni = parseInt(ruaIni), rFim = parseInt(ruaFim);
    const pIni = parseInt(predioIni), pFim = parseInt(predioFim);
    const nIni = parseInt(nivelIni), nFim = parseInt(nivelFim);
    const aIni = parseInt(aptoIni), aFim = parseInt(aptoFim);

    if ([rIni, rFim, pIni, pFim, nIni, nFim, aIni, aFim].some(isNaN)) return [];
    if (rIni > rFim || pIni > pFim || nIni > nFim || aIni > aFim) return [];

    const ruas = range(rIni, rFim);
    const niveis = range(nIni, nFim);
    const aptos = range(aIni, aFim);
    let predios = range(pIni, pFim);
    if (lado === "PAR") predios = predios.filter((n) => n % 2 === 0);
    else if (lado === "IMPAR") predios = predios.filter((n) => n % 2 !== 0);

    const out: { rua: number; predio: number; nivel: number; apto: number; descricao: string; lado: "PAR" | "IMPAR" }[] = [];
    for (const r of ruas)
      for (const p of predios)
        for (const n of niveis)
          for (const a of aptos)
            out.push({
              rua: r, predio: p, nivel: n, apto: a,
              descricao: buildDescricao(r, p, n, a),
              lado: p % 2 === 0 ? "PAR" : "IMPAR",
            });
    return out;
  }, [ruaIni, ruaFim, predioIni, predioFim, nivelIni, nivelFim, aptoIni, aptoFim, lado]);

  const totalCount = combos.length;
  const overLimit = totalCount > MAX_BATCH;

  const validateBeforeGenerate = (): string | null => {
    if (!armazemId) return "Selecione o Armazém";
    if (!setorId) return "Selecione o Setor";
    if (!tipoEstoqueId) return "Selecione o Tipo de Estoque";
    if (!tipoEndereco) return "Selecione o Tipo de Endereço";
    if (!situacao) return "Selecione a Situação";
    if (totalCount === 0) return "Intervalos inválidos ou vazios";
    if (overLimit) return `Limite de ${MAX_BATCH} endereços por lote excedido (${totalCount})`;
    if (tipoEndereco === "PULMAO" && !totalPallet) return "Total Pallets é obrigatório para PULMAO";
    return null;
  };

  const handleGenerate = async () => {
    const err = validateBeforeGenerate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!tenantId) return;

    setGenerating(true);
    setProgress(0);

    try {
      // 1. Check duplicates: fetch existing rua,predio,nivel,apto for this armazem
      const ruasUsadas = Array.from(new Set(combos.map((c) => c.rua)));
      const { data: existing, error: existErr } = await (supabase as any)
        .from("endereco")
        .select("rua,predio,nivel,apto")
        .eq("tenant_id", tenantId)
        .eq("armazem_id", armazemId)
        .in("rua", ruasUsadas);

      if (existErr) throw existErr;

      const existingSet = new Set(
        (existing || []).map((e: any) => `${e.rua}|${e.predio}|${e.nivel}|${e.apto}`)
      );

      const toInsert = combos
        .filter((c) => !existingSet.has(`${c.rua}|${c.predio}|${c.nivel}|${c.apto}`))
        .map((c) => {
          const payload: Record<string, any> = {
            tenant_id: tenantId,
            armazem_id: armazemId,
            setor_id: setorId,
            tipo_estoque_id: tipoEstoqueId,
            rua: c.rua,
            predio: c.predio,
            nivel: c.nivel,
            apto: c.apto,
            descricao: c.descricao,
            lado: c.lado,
            tipo_endereco: tipoEndereco,
            situacao,
            ativo,
          };
          if (tipoEstrutura) payload.tipo_estrutura = tipoEstrutura;
          if (curva) payload.curva_acesso = curva;
          if (tipoEndereco === "PULMAO" && totalPallet) payload.total_pallet = parseInt(totalPallet);
          if (altura) payload.altura = parseFloat(altura);
          if (largura) payload.largura = parseFloat(largura);
          if (comprimento) payload.comprimento = parseFloat(comprimento);
          if (m3) payload.m3 = parseFloat(m3);
          if (pesoMax) payload.peso_total = parseFloat(pesoMax);
          return payload;
        });

      const skipped = combos.length - toInsert.length;

      if (toInsert.length === 0) {
        toast.info(`Todos os ${combos.length} endereços já existem. Nenhum criado.`);
        setGenerating(false);
        return;
      }

      // 2. Chunked insert
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        const { error } = await (supabase as any).from("endereco").insert(chunk);
        if (error) {
          toast.error(`Erro após ${inserted} criados: ${error.message}`);
          setGenerating(false);
          return;
        }
        inserted += chunk.length;
        setProgress(inserted);
      }

      toast.success(
        skipped > 0
          ? `${inserted} endereços criados com sucesso! (${skipped} já existiam, ignorados)`
          : `${inserted} endereços foram criados com sucesso!`
      );
      onNavigate?.("/armazem/enderecos");
    } catch (e: any) {
      toast.error(`Erro ao gerar: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate?.("/armazem/enderecos")}
            className="w-8 h-8 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            title="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Layers size={16} className="text-primary" />
              Cadastro em Lote de Endereços
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gere múltiplos endereços a partir de intervalos
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="grid md:grid-cols-2 gap-4">
          {/* Configurações comuns */}
          <section className="card-surface p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Configurações Comuns</h3>

            <Field label="Armazém *">
              <div className="h-9 px-3 rounded-md bg-secondary/40 border border-border flex items-center text-sm text-muted-foreground">
                {armazemId ? "Armazém ativo da empresa selecionada" : "Selecione um armazém no topo"}
              </div>
            </Field>
            <Field label="Setor *">
              <SelectInput value={setorId} onChange={setSetorId} options={setorOptions} placeholder="Selecione o setor" />
            </Field>
            <Field label="Tipo de Estoque *">
              <SelectInput value={tipoEstoqueId} onChange={setTipoEstoqueId} options={tipoEstoqueOptions} placeholder="Selecione o tipo de estoque" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo Endereço *">
                <EnumSelect value={tipoEndereco} onChange={setTipoEndereco} options={TIPO_ENDERECO_OPTIONS} />
              </Field>
              <Field label="Situação *">
                <EnumSelect value={situacao} onChange={setSituacao} options={SITUACAO_OPTIONS} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo Estrutura">
                <EnumSelect value={tipoEstrutura} onChange={setTipoEstrutura} options={TIPO_ESTRUTURA_OPTIONS} placeholder="—" />
              </Field>
              <Field label="Curva de Acesso">
                <EnumSelect value={curva} onChange={setCurva} options={CURVA_OPTIONS} placeholder="—" />
              </Field>
            </div>

            {tipoEndereco === "PULMAO" && (
              <Field label="Total Pallets *">
                <NumberInput value={totalPallet} onChange={setTotalPallet} placeholder="2" />
              </Field>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Field label="Altura (cm)"><NumberInput value={altura} onChange={setAltura} /></Field>
              <Field label="Largura (cm)"><NumberInput value={largura} onChange={setLargura} /></Field>
              <Field label="Comprimento (cm)"><NumberInput value={comprimento} onChange={setComprimento} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="M³"><NumberInput value={m3} onChange={setM3} /></Field>
              <Field label="Peso Máx (kg)"><NumberInput value={pesoMax} onChange={setPesoMax} /></Field>
            </div>

            <label className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">Ativo</span>
              <button
                onClick={() => setAtivo(!ativo)}
                className={`relative w-10 h-5 rounded-full transition-colors ${ativo ? "bg-primary" : "bg-input"}`}
                type="button"
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform ${ativo ? "translate-x-5" : ""}`} />
              </button>
            </label>
          </section>

          {/* Intervalos */}
          <section className="card-surface p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Intervalos</h3>

            <RangeRow label="Rua" iniValue={ruaIni} fimValue={ruaFim} onIniChange={setRuaIni} onFimChange={setRuaFim} />
            <RangeRow label="Prédio" iniValue={predioIni} fimValue={predioFim} onIniChange={setPredioIni} onFimChange={setPredioFim} />
            <RangeRow label="Nível" iniValue={nivelIni} fimValue={nivelFim} onIniChange={setNivelIni} onFimChange={setNivelFim} />
            <RangeRow label="Apto" iniValue={aptoIni} fimValue={aptoFim} onIniChange={setAptoIni} onFimChange={setAptoFim} />

            <Field label="Lado * (aplicado ao Prédio)">
              <EnumSelect value={lado} onChange={setLado} options={LADO_OPTIONS} />
            </Field>

            {/* Resumo */}
            <div className={`mt-3 p-3 rounded-lg border ${overLimit ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Endereços a serem criados</p>
                  <p className={`text-2xl font-bold ${overLimit ? "text-destructive" : "text-primary"}`}>
                    {totalCount.toLocaleString("pt-BR")}
                  </p>
                  {overLimit && (
                    <p className="text-xs text-destructive mt-1">
                      Excede o limite de {MAX_BATCH.toLocaleString("pt-BR")} por lote
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setPreviewOpen(true)}
                  disabled={totalCount === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Eye size={13} />
                  Pré-visualizar
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Footer actions */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[260px] bg-background/95 backdrop-blur border-t border-border px-6 py-3 flex items-center justify-between gap-3 z-10">
        <p className="text-xs text-muted-foreground">
          {generating
            ? `Inserindo ${progress.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")}...`
            : `${totalCount.toLocaleString("pt-BR")} endereços serão gerados`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate?.("/armazem/enderecos")}
            disabled={generating}
            className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || totalCount === 0 || overLimit}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating && <Loader2 size={14} className="animate-spin" />}
            {generating ? "Gerando..." : "Gerar Endereços"}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pré-visualização ({Math.min(totalCount, 50)} de {totalCount})</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b border-border">
                <tr>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">#</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Endereço</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Lado</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Situação</th>
                </tr>
              </thead>
              <tbody>
                {combos.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 px-3 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-3 font-mono text-xs text-foreground">{c.descricao}</td>
                    <td className="py-2 px-3 text-xs text-foreground">{c.lado}</td>
                    <td className="py-2 px-3">
                      <StatusBadge status={tipoEndereco === "PULMAO" ? 0 : 1} type="endereco-tipo" />
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge status={{ LIVRE: 0, OCUPADO: 1, BLOQUEADO: 2 }[situacao] ?? 0} type="endereco-situacao" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalCount > 50 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                ... e mais {(totalCount - 50).toLocaleString("pt-BR")} endereços
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function SelectInput({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">{placeholder || "Selecione..."}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function EnumSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function RangeRow({ label, iniValue, fimValue, onIniChange, onFimChange }: { label: string; iniValue: string; fimValue: string; onIniChange: (v: string) => void; onFimChange: (v: string) => void }) {
  const ini = parseInt(iniValue), fim = parseInt(fimValue);
  const invalid = !isNaN(ini) && !isNaN(fim) && ini > fim;
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          value={iniValue}
          onChange={(e) => onIniChange(e.target.value)}
          className={`flex-1 h-9 px-3 rounded-md border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${invalid ? "border-destructive" : "border-input"}`}
          placeholder="Inicial"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <input
          type="number"
          min="1"
          value={fimValue}
          onChange={(e) => onFimChange(e.target.value)}
          className={`flex-1 h-9 px-3 rounded-md border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${invalid ? "border-destructive" : "border-input"}`}
          placeholder="Final"
        />
      </div>
      {invalid && <p className="text-xs text-destructive mt-1">Valor inicial deve ser ≤ ao final</p>}
    </div>
  );
}
