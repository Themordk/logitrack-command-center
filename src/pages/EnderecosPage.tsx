import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Printer, Layers, Loader2 } from "lucide-react";
import { PrintEtiquetaEnderecoModal } from "@/components/etiqueta/PrintEtiquetaEnderecoModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function EnderecosPage({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const { tenantId, empresaId, armazemId, empresaVersion } = useTenant();
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterSituacao, setFilterSituacao] = useState<string>("all");
  const [filterLado, setFilterLado] = useState<string>("all");
  const [filterCurva, setFilterCurva] = useState<string>("all");
  const [filterAtivo, setFilterAtivo] = useState<string>("all");
  const [filterArmazem, setFilterArmazem] = useState<string>("all");
  const [filterSetor, setFilterSetor] = useState<string>("all");
  const [filterTipoEstoque, setFilterTipoEstoque] = useState<string>("all");
  const [filterTipoEstrutura, setFilterTipoEstrutura] = useState<string>("all");
  const crudFilters: Record<string, any> = {};
  if (filterTipo !== "all") crudFilters.tipo_endereco = filterTipo;
  if (filterSituacao !== "all") crudFilters.situacao = filterSituacao;
  if (filterLado !== "all") crudFilters.lado = filterLado;
  if (filterCurva !== "all") crudFilters.curva_acesso = filterCurva;
  if (filterAtivo !== "all") crudFilters.ativo = filterAtivo === "true";
  if (filterArmazem !== "all") crudFilters.armazem_id = filterArmazem;
  if (filterSetor !== "all") crudFilters.setor_id = filterSetor;
  if (filterTipoEstoque !== "all") crudFilters.tipo_estoque_id = filterTipoEstoque;
  if (filterTipoEstrutura !== "all") crudFilters.tipo_estrutura = filterTipoEstrutura;
  const crud = useCrud({ table: "vw_endereco_listagem", writeTable: "endereco", tenantId, orderBy: "descricao", filters: crudFilters });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [formArmazemId, setFormArmazemId] = useState("");
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);
  const [setorOptions, setSetorOptions] = useState<{ value: string; label: string }[]>([]);
  const [tipoEstoqueOptions, setTipoEstoqueOptions] = useState<{ value: string; label: string }[]>([]);
  const [filterSetorOptions, setFilterSetorOptions] = useState<{ value: string; label: string }[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printEnderecos, setPrintEnderecos] = useState<any[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);

  const fetchEnderecosByIds = async (ids: string[]): Promise<any[]> => {
    if (!tenantId || ids.length === 0) return [];
    const chunkSize = 300;
    const results: any[] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await (supabase as any)
        .from("vw_endereco_listagem")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("id", chunk);
      if (error) throw error;
      if (data) results.push(...data);
    }
    return results;
  };

  const handlePrintSelected = async () => {
    if (selectedIds.size === 0) return;
    const idsArr = Array.from(selectedIds);
    const cached = crud.data.filter((r) => selectedIds.has(r.id));
    if (cached.length === idsArr.length) {
      setPrintEnderecos(cached);
      setPrintOpen(true);
      return;
    }
    setPreparingPrint(true);
    try {
      const rows = await fetchEnderecosByIds(idsArr);
      setPrintEnderecos(rows);
      setPrintOpen(true);
    } catch (err: any) {
      toast.error("Falha ao carregar endereços selecionados");
    } finally {
      setPreparingPrint(false);
    }
  };

  const handleSelectAllPages = async () => {
    setSelectingAll(true);
    try {
      const ids = await crud.fetchAllIds();
      setSelectedIds(new Set(ids));
    } finally {
      setSelectingAll(false);
    }
  };

  const handlePrintSingle = (row: any) => {
    setPrintEnderecos([row]);
    setPrintOpen(true);
  };

  useEffect(() => {
    if (tenantId && empresaId) {
      fetchOptions("armazem", tenantId, "descricao", { empresa_id: empresaId }).then(setArmazemOptions);
      fetchOptions("tipo_estoque", tenantId, "descricao", { empresa_id: empresaId }).then(setTipoEstoqueOptions);
    } else {
      setArmazemOptions([]);
      setTipoEstoqueOptions([]);
    }
    setFormArmazemId(armazemId || "");
    setSelectedIds(new Set());
    setModalOpen(false);
    setEditItem(null);
  }, [tenantId, empresaId, armazemId, empresaVersion]);

  useEffect(() => {
    if (tenantId && formArmazemId) {
      fetchOptions("setor", tenantId, "descricao", { armazem_id: formArmazemId }).then(setSetorOptions);
    } else {
      setSetorOptions([]);
    }
  }, [tenantId, formArmazemId]);

  useEffect(() => {
    if (tenantId && filterArmazem !== "all") {
      fetchOptions("setor", tenantId, "descricao", { armazem_id: filterArmazem }).then(setFilterSetorOptions);
    } else {
      setFilterSetorOptions([]);
    }
  }, [tenantId, filterArmazem]);

  // Limpa seleção sempre que filtros ou busca mudarem — evita IDs órfãos do conjunto anterior.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterTipo, filterSituacao, filterLado, filterCurva, filterAtivo, filterArmazem, filterSetor, filterTipoEstoque, filterTipoEstrutura, crud.search]);


  const buildDescricao = (rua: string, predio: string, nivel: string, apto: string) => {
    const pad = (v: string) => String(v).padStart(2, "0");
    return `R${pad(rua)}-P${pad(predio)}-N${pad(nivel)}-A${pad(apto)}`;
  };

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Endereço", type: "mono" },
    { key: "codigo_endereco", label: "Código" },
    { key: "tipo_endereco", label: "Tipo", render: (row) => <StatusBadge status={row.tipo_endereco === "PULMAO" ? 0 : 1} type="endereco-tipo" /> },
    { key: "situacao", label: "Situação", render: (row) => <StatusBadge status={row.situacao} type="endereco-situacao" /> },
    { key: "tipo_estoque_descricao", label: "Tipo Estoque" },
    { key: "armazem_descricao", label: "Armazém" },
    { key: "setor_descricao", label: "Setor" },
    { key: "curva_acesso", label: "Curva" },
    { key: "lado", label: "Lado" },
    { key: "capacidade_unidades", label: "Cap. Unid." },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "armazem_id", label: "Armazém", type: "select", required: true, options: armazemOptions, defaultValue: armazemId || "" },
    { name: "setor_id", label: "Setor", type: "select", required: true, options: setorOptions },
    { name: "tipo_estoque_id", label: "Tipo de Estoque", type: "select", required: true, options: tipoEstoqueOptions },
    { name: "rua", label: "Rua", type: "number", required: true, placeholder: "1" },
    { name: "predio", label: "Prédio", type: "number", required: true, placeholder: "1" },
    { name: "nivel", label: "Nível", type: "number", required: true, placeholder: "1" },
    { name: "apto", label: "Apto", type: "number", required: true, placeholder: "1" },
    { name: "lado", label: "Lado", type: "enum", required: true, enumValues: ["PAR", "IMPAR"] },
    { name: "tipo_endereco", label: "Tipo Endereço", type: "enum", required: true, enumValues: ["PULMAO", "PICKING"] },
    { name: "tipo_estrutura", label: "Tipo Estrutura", type: "enum", enumValues: ["PORTA PALLET", "BLOCADO", "PRATELEIRA", "FLOW RACK", "DRIVE IN", "MEZANINO", "DOCA"] },
    { name: "situacao", label: "Situação", type: "enum", required: true, enumValues: ["LIVRE", "OCUPADO", "BLOQUEADO", "BLOQUEADO_INVENTARIO"] },
    { name: "total_pallet", label: "Total Pallets", type: "number", placeholder: "2", visibleWhen: (form) => form.tipo_endereco === "PULMAO", requiredWhen: (form) => form.tipo_endereco === "PULMAO" },
    { name: "curva_acesso", label: "Curva de Acesso", type: "enum", enumValues: ["A", "B", "C", "D"] },
    { name: "altura", label: "Altura (cm)", type: "number" },
    { name: "largura", label: "Largura (cm)", type: "number" },
    { name: "comprimento", label: "Comprimento (cm)", type: "number" },
    { name: "m3", label: "M³", type: "number" },
    { name: "peso_total", label: "Peso Máx (kg)", type: "number" },
    { name: "capacidade_unidades", label: "Capacidade (unidades)", type: "number", required: false },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  const handleSave = async (data: Record<string, any>) => {
    data.descricao = buildDescricao(
      String(data.rua || "0"),
      String(data.predio || "0"),
      String(data.nivel || "0"),
      String(data.apto || "0")
    );
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  return (
    <>
      <CrudTable
        title="Localizações / Endereços"
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
        onNew={() => { setEditItem(null); setModalOpen(true); }}
        onEdit={(row) => { setEditItem(row); setModalOpen(true); }}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Novo Endereço"
        searchPlaceholder="Buscar por endereço ou código..."
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        selectionBanner={
          selectedIds.size > 0 ? (
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
              <span className="text-sm text-foreground">
                <span className="font-semibold text-primary">{selectedIds.size}</span>{" "}
                {selectedIds.size === 1 ? "endereço selecionado" : "endereços selecionados"}
                {selectedIds.size >= crud.total && crud.total > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">(todos os registros do filtro atual)</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {selectedIds.size < crud.total && (
                  <button
                    type="button"
                    onClick={handleSelectAllPages}
                    disabled={selectingAll}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {selectingAll && <Loader2 size={12} className="animate-spin" />}
                    Selecionar todos os {crud.total} endereços
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  Limpar seleção
                </button>
              </div>
            </div>
          ) : null
        }
        extraFilters={
          <>
            <select
              value={filterArmazem}
              onChange={(e) => { setFilterArmazem(e.target.value); setFilterSetor("all"); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Armazém: Todos</option>
              {armazemOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={filterSetor}
              onChange={(e) => { setFilterSetor(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Setor: Todos</option>
              {filterSetorOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={filterTipoEstoque}
              onChange={(e) => { setFilterTipoEstoque(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Tipo Estoque: Todos</option>
              {tipoEstoqueOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={filterTipoEstrutura}
              onChange={(e) => { setFilterTipoEstrutura(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Tipo Estrutura: Todos</option>
              <option value="PORTA PALLET">PORTA PALLET</option>
              <option value="BLOCADO">BLOCADO</option>
              <option value="PRATELEIRA">PRATELEIRA</option>
              <option value="FLOW RACK">FLOW RACK</option>
              <option value="DRIVE IN">DRIVE IN</option>
              <option value="MEZANINO">MEZANINO</option>
              <option value="DOCA">DOCA</option>
            </select>
            <select
              value={filterTipo}
              onChange={(e) => { setFilterTipo(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Tipo: Todos</option>
              <option value="PULMAO">Pulmão</option>
              <option value="PICKING">Picking</option>
            </select>
            <select
              value={filterSituacao}
              onChange={(e) => { setFilterSituacao(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Situação: Todas</option>
              <option value="LIVRE">Livre</option>
              <option value="OCUPADO">Ocupado</option>
              <option value="BLOQUEADO">Bloqueado</option>
              <option value="BLOQUEADO_INVENTARIO">Bloq. Inventário</option>
            </select>
            <select
              value={filterLado}
              onChange={(e) => { setFilterLado(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Lado: Todos</option>
              <option value="PAR">Par</option>
              <option value="IMPAR">Ímpar</option>
            </select>
            <select
              value={filterCurva}
              onChange={(e) => { setFilterCurva(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Curva: Todas</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
            <select
              value={filterAtivo}
              onChange={(e) => { setFilterAtivo(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Status: Todos</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
            {(filterTipo !== "all" || filterSituacao !== "all" || filterLado !== "all" || filterCurva !== "all" || filterAtivo !== "all" || filterArmazem !== "all" || filterSetor !== "all" || filterTipoEstoque !== "all" || filterTipoEstrutura !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setFilterTipo("all");
                  setFilterSituacao("all");
                  setFilterLado("all");
                  setFilterCurva("all");
                  setFilterAtivo("all");
                  setFilterArmazem("all");
                  setFilterSetor("all");
                  setFilterTipoEstoque("all");
                  setFilterTipoEstrutura("all");
                  crud.setPage(1);
                }}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Limpar filtros
              </button>
            )}
          </>
        }
        headerActions={
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={handlePrintSelected}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/50 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
              >
                <Printer size={15} />
                Imprimir Selecionados ({selectedIds.size})
              </button>
            )}
            <button
              onClick={() => onNavigate?.("/armazem/enderecos/lote")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-secondary transition-colors"
            >
              <Layers size={15} />
              Cadastro em Lote
            </button>
          </div>
        }
        extraRowActions={(row) => (
          <button
            onClick={() => handlePrintSingle(row)}
            className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            title="Imprimir etiqueta"
          >
            <Printer size={13} />
          </button>
        )}
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Endereço" : "Novo Endereço"}
        fields={fields}
        initialData={editItem}
        onFormChange={(form) => setFormArmazemId(form.armazem_id || "")}
        onSave={handleSave}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
      <PrintEtiquetaEnderecoModal
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintEnderecos([]); }}
        enderecos={printEnderecos}
      />
    </>
  );
}
