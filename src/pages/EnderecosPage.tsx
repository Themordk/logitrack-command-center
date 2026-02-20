import { useState } from "react";
import { mockEnderecos, type Endereco } from "@/data/mockData";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, SlidersHorizontal, ChevronUp, ChevronDown, Eye, Edit2, Trash2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrintEtiquetaEnderecoModal } from "@/components/etiqueta/PrintEtiquetaEnderecoModal";

const ITEMS_PER_PAGE = 8;

interface EnderecosPageProps {
  onNavigate?: (path: string) => void;
}

export function EnderecosPage({ onNavigate }: EnderecosPageProps) {
  const [search, setSearch] = useState("");
  const [filterSituacao, setFilterSituacao] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<keyof Endereco>("codigo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Selection state
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Print modal state
  const [printEnderecos, setPrintEnderecos] = useState<Endereco[]>([]);
  const [printOpen, setPrintOpen] = useState(false);

  const filtered = mockEnderecos
    .filter((e) => {
      const matchSearch =
        e.codigo.toLowerCase().includes(search.toLowerCase()) ||
        e.setor.toLowerCase().includes(search.toLowerCase());
      const matchSituacao = filterSituacao === "all" || String(e.situacao) === filterSituacao;
      const matchTipo = filterTipo === "all" || String(e.tipoEndereco) === filterTipo;
      return matchSearch && matchSituacao && matchTipo;
    })
    .sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const toggleSort = (col: keyof Endereco) => {
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: keyof Endereco }) =>
    sortCol === col ? (
      sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
    ) : (
      <ChevronDown size={12} className="opacity-20" />
    );

  // Selection helpers
  const allPageSelected =
    paginated.length > 0 && paginated.every((e) => selected.has(e.id));
  const somePageSelected = paginated.some((e) => selected.has(e.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      const next = new Set(selected);
      paginated.forEach((e) => next.delete(e.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      paginated.forEach((e) => next.add(e.id));
      setSelected(next);
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const openPrintSingle = (end: Endereco) => {
    setPrintEnderecos([end]);
    setPrintOpen(true);
  };

  const openPrintLote = () => {
    const lote = mockEnderecos.filter((e) => selected.has(e.id));
    if (lote.length === 0) return;
    setPrintEnderecos(lote);
    setPrintOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Localizações / Endereços</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} endereços encontrados
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={openPrintLote}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 border border-border transition-colors"
            >
              <Printer size={15} />
              Imprimir Selecionados ({selected.size})
            </button>
          )}
          <button
            onClick={() => onNavigate?.("/armazem/enderecos/novo")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            Novo Endereço
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card-surface p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar por código ou setor..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-muted-foreground" />
          <select
            value={filterSituacao}
            onChange={(e) => {
              setFilterSituacao(e.target.value);
              setPage(1);
            }}
            className="bg-secondary text-sm text-foreground rounded-lg px-3 py-2 border-none outline-none cursor-pointer"
          >
            <option value="all">Todas as Situações</option>
            <option value="0">Livre</option>
            <option value="1">Ocupado</option>
            <option value="2">Bloqueado</option>
          </select>
          <select
            value={filterTipo}
            onChange={(e) => {
              setFilterTipo(e.target.value);
              setPage(1);
            }}
            className="bg-secondary text-sm text-foreground rounded-lg px-3 py-2 border-none outline-none cursor-pointer"
          >
            <option value="all">Todos os Tipos</option>
            <option value="0">Pulmão</option>
            <option value="1">Picking</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card-surface overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {/* Checkbox select all */}
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePageSelected && !allPageSelected;
                  }}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                  title="Selecionar todos da página"
                />
              </th>
              {[
                { key: "codigo", label: "Endereço" },
                { key: "tipoEndereco", label: "Tipo" },
                { key: "situacao", label: "Situação" },
                { key: "curva", label: "Curva" },
                { key: "capacidadeM3", label: "Cap. M³" },
                { key: "pesoMaxKg", label: "Peso Máx. (kg)" },
                { key: "totalPallets", label: "Pallets" },
                { key: "setor", label: "Setor" },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key as keyof Endereco)}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <SortIcon col={key as keyof Endereco} />
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((end, idx) => (
              <tr
                key={end.id}
                className={cn(
                  "border-b border-border/50 table-row-hover",
                  idx % 2 === 0 ? "" : "bg-secondary/10",
                  selected.has(end.id) ? "bg-primary/5" : ""
                )}
              >
                {/* Checkbox */}
                <td className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.has(end.id)}
                    onChange={() => toggleSelect(end.id)}
                    className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 font-mono text-sm font-medium text-foreground">
                  {end.codigo}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={end.tipoEndereco} type="endereco-tipo" />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={end.situacao} type="endereco-situacao" />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold",
                      end.curva === "A"
                        ? "bg-green-500/15 text-green-400"
                        : end.curva === "B"
                        ? "bg-blue-500/15 text-blue-400"
                        : end.curva === "C"
                        ? "bg-yellow-500/15 text-yellow-400"
                        : "bg-slate-500/15 text-slate-400"
                    )}
                  >
                    {end.curva}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {end.capacidadeM3.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {end.pesoMaxKg.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{end.totalPallets}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{end.setor}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {[
                      { icon: <Eye size={13} />, label: "Ver", onClick: () => {} },
                      { icon: <Edit2 size={13} />, label: "Editar", onClick: () => {} },
                      {
                        icon: <Printer size={13} />,
                        label: "Imprimir Etiqueta",
                        onClick: () => openPrintSingle(end),
                      },
                      { icon: <Trash2 size={13} />, label: "Excluir", onClick: () => {} },
                    ].map(({ icon, label, onClick }) => (
                      <button
                        key={label}
                        onClick={onClick}
                        className={cn(
                          "flex items-center justify-center w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors",
                          label === "Imprimir Etiqueta" && "hover:text-primary"
                        )}
                        title={label}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  Nenhum endereço encontrado com os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Mostrando{" "}
            {Math.min((page - 1) * ITEMS_PER_PAGE + 1, filtered.length)}–
            {Math.min(page * ITEMS_PER_PAGE, filtered.length)} de {filtered.length}
            {selected.size > 0 && (
              <span className="ml-3 text-primary font-medium">
                · {selected.size} selecionado{selected.size > 1 ? "s" : ""}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  "w-7 h-7 rounded text-xs transition-colors",
                  page === p
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Próximo
            </button>
          </div>
        </div>
      </div>

      {/* Print Modal */}
      <PrintEtiquetaEnderecoModal
        open={printOpen}
        onClose={() => {
          setPrintOpen(false);
          setPrintEnderecos([]);
        }}
        enderecos={printEnderecos}
      />
    </div>
  );
}
