import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { fetchEstoqueReport, type EstoqueFilter } from "./estoque.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function EstoqueReportPage() {
  const { tenantId, empresaId } = useTenant();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Filter states
  const [filterSku, setFilterSku] = useState("");
  const [filterTipoEndereco, setFilterTipoEndereco] = useState("");
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterEan, setFilterEan] = useState("");
  const [filterTipoEstoqueId, setFilterTipoEstoqueId] = useState("");
  const [filterSetorId, setFilterSetorId] = useState("");

  // Options
  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [tiposEstoque, setTiposEstoque] = useState<{ id: string; descricao: string }[]>([]);
  const [setores, setSetores] = useState<{ id: string; descricao: string }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("armazem").select("id, descricao").eq("tenant_id", tenantId).eq("ativo", true)
      .then(({ data }) => setArmazens(data || []));
    (supabase as any).from("tipo_estoque").select("id, descricao").eq("tenant_id", tenantId).eq("ativo", true)
      .then(({ data }: any) => setTiposEstoque(data || []));
    (supabase as any).from("setor").select("id, descricao").eq("tenant_id", tenantId).eq("ativo", true)
      .then(({ data }: any) => setSetores(data || []));
  }, [tenantId]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const filters: EstoqueFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: filterArmazemId || undefined,
        tipo_endereco: filterTipoEndereco || undefined,
        sku: filterSku || undefined,
        ean: filterEan || undefined,
        tipo_estoque_id: filterTipoEstoqueId || undefined,
        setor_id: filterSetorId || undefined,
      };
      const results = await fetchEstoqueReport(filters);
      setData(results);
      setGeneratedAt(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
      setGenerated(true);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilterSku("");
    setFilterTipoEndereco("");
    setFilterArmazemId("");
    setFilterEan("");
    setFilterTipoEstoqueId("");
    setFilterSetorId("");
  };

  const isExpired = (date: string) => {
    if (!date || date === "1900-01-01") return false;
    return new Date(date) < new Date();
  };

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "100px" },
    { key: "descricao", label: "Descrição", width: "200px" },
    { key: "lote", label: "Lote", width: "100px" },
    {
      key: "data_validade", label: "Validade", width: "100px",
      render: (v) => {
        if (!v || v === "1900-01-01") return "—";
        const expired = isExpired(v);
        return <span className={cn(expired && "text-[hsl(var(--status-blocked))] font-semibold")}>{new Date(v).toLocaleDateString("pt-BR")}</span>;
      },
    },
    { key: "codigo_endereco", label: "Endereço", width: "100px" },
    { key: "tipo_endereco", label: "Tipo Endereço", width: "110px" },
    {
      key: "quantidade_disponivel", label: "Disponível", align: "right", width: "90px",
      render: (v) => <span className={cn(v === 0 && "text-muted-foreground")}>{Number(v).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "quantidade_bloqueada", label: "Bloqueado", align: "right", width: "90px",
      render: (v) => <span className={cn(Number(v) > 0 && "text-[hsl(var(--status-busy))] font-semibold")}>{Number(v).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "quantidade_total", label: "Total", align: "right", width: "90px",
      render: (v) => <span className={cn(v === 0 && "text-muted-foreground")}>{Number(v).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "atualizado_em", label: "Última Atualização", width: "150px",
      render: (v) => v ? new Date(v).toLocaleString("pt-BR") : "—",
    },
  ];

  const activeFilters: Record<string, string> = {};
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find(a => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterTipoEndereco) activeFilters["Tipo"] = filterTipoEndereco;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterEan) activeFilters["EAN"] = filterEan;
  if (filterTipoEstoqueId) activeFilters["Tipo Estoque"] = tiposEstoque.find(t => t.id === filterTipoEstoqueId)?.descricao || filterTipoEstoqueId;
  if (filterSetorId) activeFilters["Setor"] = setores.find(s => s.id === filterSetorId)?.descricao || filterSetorId;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Posição de Estoque"
        subtitle="Relatório analítico de saldos por endereço"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? data.length : undefined}
        filters={generated ? activeFilters : undefined}
      />

      {/* Filters panel */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors"
        >
          <span className="flex items-center gap-2"><Filter size={14} /> Filtros</span>
          <span className="text-muted-foreground">{showFilters ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showFilters && (
          <div className="border-t border-border p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Armazém</Label>
                <Select value={filterArmazemId} onValueChange={setFilterArmazemId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {armazens.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo Endereço</Label>
                <Select value={filterTipoEndereco} onValueChange={setFilterTipoEndereco}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PICKING">Picking</SelectItem>
                    <SelectItem value="PULMAO">Pulmão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={e => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">EAN</Label>
                <Input className="h-8 text-xs" placeholder="Buscar por EAN..." value={filterEan} onChange={e => setFilterEan(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleGenerate} disabled={loading}>
                <Search size={14} />
                {loading ? "Gerando..." : "Gerar Relatório"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <X size={14} />
                Limpar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {generated && <ReportTable columns={columns} data={data} loading={loading} />}
    </div>
  );
}
