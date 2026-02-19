import { useState } from "react";
import { mockVeiculos } from "@/data/mockData";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, Eye, Edit2, Trash2, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export function VeiculosPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = mockVeiculos.filter((v) => {
    const matchSearch =
      v.placa.toLowerCase().includes(search.toLowerCase()) ||
      v.motorista.toLowerCase().includes(search.toLowerCase()) ||
      v.tipo.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || v.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Veículos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} veículos cadastrados</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          Novo Veículo
        </button>
      </div>

      {/* Filters */}
      <div className="card-surface p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar por placa, motorista ou tipo..."
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
          <option value="disponivel">Disponível</option>
          <option value="em_rota">Em Rota</option>
          <option value="manutencao">Manutenção</option>
        </select>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((vei) => (
          <div key={vei.id} className="card-surface p-5 hover:border-primary/30 transition-colors group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                  <Truck size={18} className="text-muted-foreground" />
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-foreground">{vei.placa}</div>
                  <div className="text-xs text-muted-foreground">{vei.tipo}</div>
                </div>
              </div>
              <StatusBadge status={vei.status} type="veiculo" />
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Motorista</span>
                <span className="text-foreground text-xs font-medium">{vei.motorista}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Cap. Peso</span>
                <span className="text-foreground text-xs">{vei.capacidadeKg.toLocaleString()} kg</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Cap. Volume</span>
                <span className="text-foreground text-xs">{vei.capacidadeM3} m³</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {[<Eye size={13} />, <Edit2 size={13} />, <Trash2 size={13} />].map((icon, i) => (
                <button key={i} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center">
                  {icon}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
