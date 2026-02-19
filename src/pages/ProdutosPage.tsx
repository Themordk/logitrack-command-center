import { useState } from "react";
import { mockProdutos } from "@/data/mockData";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, Eye, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProdutosPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = mockProdutos.filter((p) => {
    const matchSearch =
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.descricao.toLowerCase().includes(search.toLowerCase()) ||
      p.grupo.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Produtos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} produtos cadastrados</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          Novo Produto
        </button>
      </div>

      <div className="card-surface p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar por SKU, descrição ou grupo..."
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
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>

      <div className="card-surface overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {["SKU", "Descrição", "Grupo", "Subgrupo", "Unidade", "Peso Bruto", "M³", "Status", "Ações"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((prod, idx) => (
              <tr key={prod.id} className={cn("border-b border-border/50 table-row-hover", idx % 2 === 0 ? "" : "bg-secondary/10")}>
                <td className="px-4 py-3 font-mono text-sm font-semibold text-primary">{prod.sku}</td>
                <td className="px-4 py-3 text-sm text-foreground">{prod.descricao}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{prod.grupo}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{prod.subgrupo}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{prod.unidade}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{prod.pesoBruto} kg</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{prod.m3}</td>
                <td className="px-4 py-3"><StatusBadge status={prod.status} type="generic" /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
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
