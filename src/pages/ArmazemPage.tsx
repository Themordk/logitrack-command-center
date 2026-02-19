import { useState } from "react";
import { mockArmazens, mockSetores, mockTiposEstoque } from "@/data/mockData";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, Eye, Edit2, Trash2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SubPage = "armazens" | "setores" | "tipos";

export function ArmazemPage({ sub }: { sub: SubPage }) {
  const [search, setSearch] = useState("");

  const data = sub === "armazens" ? mockArmazens : sub === "setores" ? mockSetores : mockTiposEstoque;
  const filtered = data.filter((item: any) =>
    Object.values(item).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  const titles: Record<SubPage, string> = {
    armazens: "Cadastro de Armazéns",
    setores: "Setores",
    tipos: "Tipos de Estoque",
  };

  const columns: Record<SubPage, string[]> = {
    armazens: ["Código", "Descrição", "Cidade", "UF", "Capacidade", "Status"],
    setores: ["Código", "Descrição", "Armazém", "Tipo", "Status"],
    tipos: ["Código", "Descrição", "Sigla", "Status"],
  };

  const renderRow = (item: any, col: string) => {
    const key = col.toLowerCase().replace(/[^a-z]/g, "");
    if (col === "Status") return <StatusBadge status={item.status} type="generic" />;
    if (col === "Capacidade") return <span className="text-sm text-muted-foreground">{item.capacidade?.toLocaleString()} m²</span>;
    const val = item[Object.keys(item).find((k) => k.toLowerCase().includes(key.slice(0, 4))) || ""] ?? "—";
    return <span className="text-sm text-muted-foreground">{String(val)}</span>;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{titles[sub]}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} registros</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          Novo
        </button>
      </div>

      <div className="card-surface p-4 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
          />
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {columns[sub].map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{col}</th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item: any, idx: number) => (
              <tr key={item.id} className={cn("border-b border-border/50 table-row-hover", idx % 2 === 0 ? "" : "bg-secondary/10")}>
                <td className="px-4 py-3 font-mono text-sm font-semibold text-primary">{item.codigo}</td>
                {columns[sub].slice(1).map((col) => (
                  <td key={col} className="px-4 py-3">{renderRow(item, col)}</td>
                ))}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {[<Eye size={13} />, <Edit2 size={13} />, <Trash2 size={13} />].map((icon, i) => (
                      <button key={i} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center">{icon}</button>
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
