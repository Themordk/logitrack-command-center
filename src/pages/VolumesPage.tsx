import { useState } from "react";
import { mockVolumes, type VolumeExpedicao } from "@/data/mockData";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, Eye, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function VolumesPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = mockVolumes.filter((v) => {
    const matchSearch =
      v.codigoVolume.toLowerCase().includes(search.toLowerCase()) ||
      v.pedido.toLowerCase().includes(search.toLowerCase()) ||
      v.cliente.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || String(v.status) === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = [
    { label: "Abertos", value: mockVolumes.filter((v) => v.status === 0).length, cls: "badge-moving" },
    { label: "Fechados", value: mockVolumes.filter((v) => v.status === 1).length, cls: "badge-busy" },
    { label: "Conferidos", value: mockVolumes.filter((v) => v.status === 2).length, cls: "badge-pulm" },
    { label: "Expedidos", value: mockVolumes.filter((v) => v.status === 3).length, cls: "badge-free" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Volumes de Expedição</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} volumes encontrados</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          Novo Volume
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card-surface px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{s.label}</span>
            <span className={cn("text-lg font-bold px-2 py-0.5 rounded", s.cls)}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card-surface p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar por volume, pedido ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-secondary text-sm text-foreground rounded-lg px-3 py-2 border-none outline-none cursor-pointer"
        >
          <option value="all">Todos os Status</option>
          <option value="0">Aberto</option>
          <option value="1">Fechado</option>
          <option value="2">Conferido</option>
          <option value="3">Expedido</option>
        </select>
      </div>

      {/* Table */}
      <div className="card-surface overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {["Código Volume", "Pedido", "Cliente", "Produto", "Qtd", "Peso (kg)", "Prev. Expedição", "Rota", "Status", "Ações"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((vol, idx) => (
              <tr key={vol.id} className={cn("border-b border-border/50 table-row-hover", idx % 2 === 0 ? "" : "bg-secondary/10")}>
                <td className="px-4 py-3 font-mono text-sm font-semibold text-primary">{vol.codigoVolume}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{vol.pedido}</td>
                <td className="px-4 py-3 text-sm text-foreground">{vol.cliente}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground max-w-[160px] truncate">{vol.produto}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{vol.quantidade}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{vol.peso.toFixed(1)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{vol.previsaoExpedicao}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{vol.rota}</td>
                <td className="px-4 py-3"><StatusBadge status={vol.status} type="volume-status" /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {[<Eye size={13} />, <Edit2 size={13} />, <Trash2 size={13} />].map((icon, i) => (
                      <button key={i} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center">
                        {icon}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
