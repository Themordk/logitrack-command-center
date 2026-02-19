import { useState } from "react";
import { mockHUs, type HU } from "@/data/mockData";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, LayoutGrid, List, Eye, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function HUsPage() {
  const [search, setSearch] = useState("");
  const [filterDisp, setFilterDisp] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  const filtered = mockHUs.filter((h) => {
    const matchSearch =
      h.codigoHU.toLowerCase().includes(search.toLowerCase()) ||
      h.sscc.includes(search) ||
      h.produto.toLowerCase().includes(search.toLowerCase());
    const matchDisp = filterDisp === "all" || String(h.disponibilidade) === filterDisp;
    const matchTipo = filterTipo === "all" || h.tipoHU === filterTipo;
    return matchSearch && matchDisp && matchTipo;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Unidades de Handling (HUs)</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} HUs encontradas</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          Nova HU
        </button>
      </div>

      {/* Filters */}
      <div className="card-surface p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar por código HU, SSCC ou produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
          />
        </div>
        <select
          value={filterDisp}
          onChange={(e) => setFilterDisp(e.target.value)}
          className="bg-secondary text-sm text-foreground rounded-lg px-3 py-2 border-none outline-none cursor-pointer"
        >
          <option value="all">Todos os Status</option>
          <option value="0">Disponível</option>
          <option value="1">Reservada</option>
          <option value="2">Bloqueada</option>
          <option value="3">Em Movimento</option>
          <option value="4">Descartada</option>
        </select>
        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value)}
          className="bg-secondary text-sm text-foreground rounded-lg px-3 py-2 border-none outline-none cursor-pointer"
        >
          <option value="all">Todos os Tipos</option>
          <option value="Pallet">Pallet</option>
          <option value="Caixa">Caixa</option>
          <option value="Volume">Volume</option>
          <option value="Outro">Outro</option>
        </select>
        {/* View Toggle */}
        <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("table")}
            className={cn("p-2 rounded-md transition-colors", viewMode === "table" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setViewMode("card")}
            className={cn("p-2 rounded-md transition-colors", viewMode === "card" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* TABLE VIEW */}
      {viewMode === "table" && (
        <div className="card-surface overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {["Código HU", "SSCC", "Tipo", "Produto", "Qtd", "Peso Bruto", "M³", "Endereço", "Disponibilidade", "Ações"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((hu, idx) => (
                <tr key={hu.id} className={cn("border-b border-border/50 table-row-hover", idx % 2 === 0 ? "" : "bg-secondary/10")}>
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-primary">{hu.codigoHU}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{hu.sscc}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-foreground">
                      {hu.tipoHU}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground max-w-[180px] truncate">{hu.produto}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{hu.quantidade}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{hu.pesoBruto.toFixed(1)} kg</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{hu.m3.toFixed(1)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{hu.endereco}</td>
                  <td className="px-4 py-3"><StatusBadge status={hu.disponibilidade} type="hu-disponibilidade" /></td>
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
      )}

      {/* CARD VIEW */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((hu) => (
            <div key={hu.id} className="card-surface p-4 hover:border-primary/30 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-mono text-sm font-bold text-primary">{hu.codigoHU}</div>
                  <div className="font-mono text-xs text-muted-foreground mt-0.5 truncate max-w-[140px]">{hu.sscc}</div>
                </div>
                <StatusBadge status={hu.disponibilidade} type="hu-disponibilidade" />
              </div>
              <div className="text-xs text-foreground font-medium truncate mb-3">{hu.produto}</div>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-secondary/50 rounded p-2">
                  <div className="text-xs text-muted-foreground">Qtd</div>
                  <div className="text-sm font-semibold text-foreground">{hu.quantidade}</div>
                </div>
                <div className="bg-secondary/50 rounded p-2">
                  <div className="text-xs text-muted-foreground">Peso</div>
                  <div className="text-sm font-semibold text-foreground">{hu.pesoBruto.toFixed(0)}kg</div>
                </div>
                <div className="bg-secondary/50 rounded p-2">
                  <div className="text-xs text-muted-foreground">M³</div>
                  <div className="text-sm font-semibold text-foreground">{hu.m3.toFixed(1)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-secondary text-muted-foreground">{hu.tipoHU}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {[<Eye size={12} />, <Edit2 size={12} />].map((icon, i) => (
                    <button key={i} className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center">
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              {hu.endereco !== "Em trânsito" && hu.endereco !== "Em Movimento" && hu.endereco !== "—" && (
                <div className="mt-2 pt-2 border-t border-border/50 font-mono text-xs text-muted-foreground">{hu.endereco}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
