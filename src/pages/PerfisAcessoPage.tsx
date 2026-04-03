import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, Plus, Edit2, Trash2, Shield, ChevronDown, ChevronRight, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Perfil {
  id: string;
  nome: string;
  descricao: string | null;
  sistema: boolean;
  ativo: boolean;
}

interface Modulo {
  id: string;
  codigo: string;
  descricao: string;
  ambiente: string;
}

interface Permissao {
  id: string;
  modulo_id: string;
  acao: string;
  descricao: string | null;
}

interface PerfilPermissao {
  permissao_id: string;
}

export function PerfisAcessoPage() {
  const { tenantId } = useTenant();
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerfil, setSelectedPerfil] = useState<Perfil | null>(null);
  const [perfilPermissoes, setPerfilPermissoes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [editingDesc, setEditingDesc] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [moduleSearch, setModuleSearch] = useState("");

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [perfisRes, modulosRes, permissoesRes] = await Promise.all([
      (supabase as any).from("perfil").select("*").eq("tenant_id", tenantId).order("nome"),
      (supabase as any).from("modulo").select("*").eq("tenant_id", tenantId).order("codigo"),
      (supabase as any).from("permissao").select("*").eq("tenant_id", tenantId),
    ]);
    setPerfis(perfisRes.data || []);
    setModulos(modulosRes.data || []);
    setPermissoes(permissoesRes.data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadPerfilPermissoes = async (perfilId: string) => {
    const { data } = await (supabase as any)
      .from("perfil_permissao")
      .select("permissao_id")
      .eq("tenant_id", tenantId)
      .eq("perfil_id", perfilId);
    setPerfilPermissoes(new Set((data || []).map((pp: PerfilPermissao) => pp.permissao_id)));
  };

  const selectPerfil = async (perfil: Perfil) => {
    setSelectedPerfil(perfil);
    setEditingName(perfil.nome);
    setEditingDesc(perfil.descricao || "");
    await loadPerfilPermissoes(perfil.id);
    // Expand all groups by default
    const groups = new Set<string>();
    modulos.forEach((m) => {
      const parts = m.codigo.split(".");
      if (parts.length >= 2) groups.add(parts.slice(0, 2).join("."));
    });
    setExpandedGroups(groups);
  };

  const togglePermission = (permissaoId: string) => {
    if (selectedPerfil?.sistema) return;
    const next = new Set(perfilPermissoes);
    if (next.has(permissaoId)) next.delete(permissaoId);
    else next.add(permissaoId);
    setPerfilPermissoes(next);
  };

  const savePermissoes = async () => {
    if (!selectedPerfil || !tenantId) return;
    setSaving(true);

    // Update name/desc if not sistema
    if (!selectedPerfil.sistema) {
      await (supabase as any)
        .from("perfil")
        .update({ nome: editingName, descricao: editingDesc || null })
        .eq("id", selectedPerfil.id);
    }

    // Delete all existing and re-insert
    await (supabase as any)
      .from("perfil_permissao")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("perfil_id", selectedPerfil.id);

    if (perfilPermissoes.size > 0) {
      const rows = Array.from(perfilPermissoes).map((pid) => ({
        tenant_id: tenantId,
        perfil_id: selectedPerfil.id,
        permissao_id: pid,
      }));
      await (supabase as any).from("perfil_permissao").insert(rows);
    }

    toast.success("Permissões salvas com sucesso!");
    setSaving(false);
    fetchAll();
  };

  const createPerfil = async () => {
    if (!tenantId || !editingName.trim()) return;
    const { error } = await (supabase as any)
      .from("perfil")
      .insert({ tenant_id: tenantId, nome: editingName.trim(), descricao: editingDesc || null });
    if (error) {
      toast.error("Erro ao criar perfil: " + error.message);
      return;
    }
    toast.success("Perfil criado!");
    setShowCreateModal(false);
    setEditingName("");
    setEditingDesc("");
    fetchAll();
  };

  const deletePerfil = async (perfil: Perfil) => {
    if (perfil.sistema) { toast.error("Perfis do sistema não podem ser excluídos."); return; }
    if (!confirm(`Excluir perfil "${perfil.nome}"?`)) return;
    await (supabase as any).from("perfil_permissao").delete().eq("perfil_id", perfil.id);
    await (supabase as any).from("usuario_perfil").delete().eq("perfil_id", perfil.id);
    await (supabase as any).from("perfil").delete().eq("id", perfil.id);
    toast.success("Perfil excluído.");
    if (selectedPerfil?.id === perfil.id) setSelectedPerfil(null);
    fetchAll();
  };

  // Filter modules by search term
  const filteredModulos = moduleSearch.trim()
    ? modulos.filter((m) => {
        const searchLower = moduleSearch.toLowerCase();
        const groupKey = m.codigo.split(".").slice(0, 2).join(".");
        const groupLabel = groupLabels[groupKey] || groupKey;
        return (
          m.descricao.toLowerCase().includes(searchLower) ||
          m.codigo.toLowerCase().includes(searchLower) ||
          groupLabel.toLowerCase().includes(searchLower)
        );
      })
    : modulos;

  // Group modules by prefix (web.armazem, web.config, coletor, etc.)
  const moduleGroups = filteredModulos.reduce<Record<string, Modulo[]>>((acc, m) => {
    const parts = m.codigo.split(".");
    const group = parts.length >= 2 ? parts.slice(0, 2).join(".") : m.codigo;
    if (!acc[group]) acc[group] = [];
    acc[group].push(m);
    return acc;
  }, {});

  const groupLabels: Record<string, string> = {
    "web.dashboard": "Dashboard",
    "web.rastreabilidade": "Rastreabilidade",
    "web.armazem": "Armazém",
    "web.dados-mestres": "Dados Mestres",
    "web.atividades": "Atividades",
    "web.relatorios": "Relatórios",
    "web.config": "Configurações",
    "coletor.recebimento": "Coletor - Recebimento",
    "coletor.armazenagem": "Coletor - Armazenagem",
    "coletor.movimentos": "Coletor - Movimentos",
    "coletor.separacao": "Coletor - Separação",
    "coletor.conferencia": "Coletor - Conferência",
    "coletor.inventario": "Coletor - Inventário",
    "coletor.consulta": "Coletor - Consultas",
  };

  const acaoLabels: Record<string, string> = {
    CREATE: "Criar",
    READ: "Visualizar",
    UPDATE: "Editar",
    DELETE: "Excluir",
    EXECUTE: "Executar",
  };

  const toggleGroup = (group: string) => {
    const next = new Set(expandedGroups);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setExpandedGroups(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Perfis de Acesso</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{perfis.length} perfis cadastrados</p>
        </div>
        <button
          onClick={() => { setEditingName(""); setEditingDesc(""); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> Novo Perfil
        </button>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div className="card-surface p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">Criar Novo Perfil</h3>
          <input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            placeholder="Nome do perfil"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={editingDesc}
            onChange={(e) => setEditingDesc(e.target.value)}
            placeholder="Descrição (opcional)"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={createPerfil} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Criar</button>
            <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg bg-secondary text-foreground text-sm">Cancelar</button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left: profile list */}
        <div className="w-72 shrink-0 card-surface overflow-auto">
          <div className="p-2">
            {perfis.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPerfil(p)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors",
                  selectedPerfil?.id === p.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary"
                )}
              >
                <div className="flex items-center gap-2">
                  <Shield size={14} className={p.sistema ? "text-amber-500" : "text-muted-foreground"} />
                  <span className="font-medium">{p.nome}</span>
                  {p.sistema && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-semibold">Sistema</span>}
                </div>
                {!p.sistema && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePerfil(p); }}
                    className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right: permission tree */}
        <div className="flex-1 card-surface overflow-auto">
          {selectedPerfil ? (
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  {selectedPerfil.sistema ? (
                    <h3 className="text-base font-semibold text-foreground">{selectedPerfil.nome}</h3>
                  ) : (
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="text-base font-semibold text-foreground bg-transparent border-b border-border outline-none"
                    />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{selectedPerfil.descricao || "Sem descrição"}</p>
                </div>
                <button
                  onClick={savePermissoes}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Salvar
                </button>
              </div>

              {/* Module search */}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  placeholder="Pesquisar módulo..."
                  className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:border-primary"
                />
              </div>

              {/* Permission tree */}
              <div className="space-y-1">
                {Object.entries(moduleGroups).map(([group, mods]) => {
                  const isExpanded = expandedGroups.has(group);
                  const groupPerms = permissoes.filter((p) => mods.some((m) => m.id === p.modulo_id));
                  const checkedCount = groupPerms.filter((p) => perfilPermissoes.has(p.id)).length;

                  return (
                    <div key={group}>
                      <button
                        onClick={() => toggleGroup(group)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-sm font-semibold text-foreground">{groupLabels[group] || group}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground ml-auto">
                          {checkedCount}/{groupPerms.length}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="ml-6 space-y-0.5">
                          {mods.map((mod) => {
                            const modPerms = permissoes.filter((p) => p.modulo_id === mod.id);
                            if (modPerms.length === 0) return null;
                            return (
                              <div key={mod.id} className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-secondary/50">
                                <span className="text-xs text-foreground min-w-[160px]">{mod.descricao}</span>
                                <div className="flex items-center gap-2 ml-auto">
                                  {modPerms.map((perm) => {
                                    const checked = perfilPermissoes.has(perm.id);
                                    return (
                                      <label
                                        key={perm.id}
                                        className={cn(
                                          "flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors",
                                          checked
                                            ? "bg-primary/10 text-primary font-semibold"
                                            : "text-muted-foreground hover:text-foreground",
                                          selectedPerfil.sistema && "cursor-default"
                                        )}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => togglePermission(perm.id)}
                                          disabled={selectedPerfil.sistema}
                                          className="w-3 h-3 rounded border-border accent-primary"
                                        />
                                        {acaoLabels[perm.acao] || perm.acao}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Selecione um perfil para gerenciar permissões
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
