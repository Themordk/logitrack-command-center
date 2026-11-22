import { useState, useEffect, useCallback, useMemo } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { toast } from "sonner";
import { Check, Copy, Loader2, Lock, Monitor, Plus, Search, Shield, Smartphone, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseError } from "@/lib/errorMapper";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissoesWebGrupo } from "@/components/perfis/PermissoesWebGrupo";
import { PermissoesColetor } from "@/components/perfis/PermissoesColetor";
import {
  agruparColetor,
  agruparWeb,
  alternarPermissao,
  contarAlteracoes,
  definirPermissoes,
  ehColetor,
  menuVisivel,
  permissoesDoModulo,
  rotuloModulo,
} from "@/lib/perfisAcesso";
import {
  carregarCatalogo,
  carregarConfiguracao,
  criarPerfil,
  excluirPerfil,
  salvarPerfil,
  type CatalogoPerfis,
  type ConfiguracaoPerfil,
  type Modulo,
  type Perfil,
  type Permissao,
} from "@/lib/perfisAcessoService";

type Aba = "web" | "coletor" | "todos";
type Filtro = "todas" | "concedidas" | "nao_concedidas";

const CONFIG_VAZIA: ConfiguracaoPerfil = { permissoes: new Set(), menus: {} };

function mostrarErro(error: unknown, contexto: string) {
  const parsed = parseError(error, contexto);
  toast.error(parsed.title, { description: parsed.details ?? parsed.instruction });
}

export function PerfisAcessoPage() {
  const { tenantId } = useTenant();
  const { refresh: recarregarMinhasPermissoes } = usePermissions();
  const [catalogo, setCatalogo] = useState<CatalogoPerfis | null>(null);
  const [loading, setLoading] = useState(true);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [original, setOriginal] = useState<ConfiguracaoPerfil>(CONFIG_VAZIA);
  const [atual, setAtual] = useState<ConfiguracaoPerfil>(CONFIG_VAZIA);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [editingDesc, setEditingDesc] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaDesc, setNovaDesc] = useState("");
  const [aba, setAba] = useState<Aba>("web");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      setCatalogo(await carregarCatalogo(tenantId));
    } catch (e) {
      mostrarErro(e, "carregar perfis");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const perfil = catalogo?.perfis.find((p) => p.id === perfilId) ?? null;
  const somenteLeitura = !!perfil && (perfil.sistema || perfil.acesso_total);
  const alteracoes = perfil
    ? contarAlteracoes(original, atual)
      + (!perfil.sistema && (editingName.trim() !== perfil.nome || (editingDesc.trim() || null) !== (perfil.descricao || null)) ? 1 : 0)
    : 0;

  const abrirPerfil = async (p: Perfil) => {
    if (!tenantId || p.id === perfilId) return;
    if (alteracoes > 0 && !confirm(`Descartar ${alteracoes} alteração(ões) não salva(s) em "${perfil?.nome}"?`)) return;
    setPerfilId(p.id);
    setEditingName(p.nome);
    setEditingDesc(p.descricao || "");
    setCarregandoPerfil(true);
    try {
      const config = await carregarConfiguracao(tenantId, p.id);
      setOriginal(config);
      setAtual(config);
    } catch (e) {
      mostrarErro(e, "carregar perfil");
    } finally {
      setCarregandoPerfil(false);
    }
  };

  const alternar = (perm: Permissao, doModulo: Permissao[]) => {
    if (somenteLeitura) return;
    setAtual((c) => ({ ...c, permissoes: alternarPermissao(c.permissoes, doModulo, perm) }));
  };

  const definir = (ids: string[], ligar: boolean) => {
    if (somenteLeitura) return;
    setAtual((c) => ({ ...c, permissoes: definirPermissoes(c.permissoes, ids, ligar) }));
  };

  const definirVisibilidade = (grupoId: string, visivel: boolean) => {
    if (somenteLeitura) return;
    setAtual((c) => ({ ...c, menus: { ...c.menus, [grupoId]: visivel } }));
  };

  const descartar = () => {
    setAtual(original);
    if (perfil) {
      setEditingName(perfil.nome);
      setEditingDesc(perfil.descricao || "");
    }
  };

  const salvar = async () => {
    if (!perfil) return;
    setSaving(true);
    try {
      await salvarPerfil({ perfilId: perfil.id, nome: editingName, descricao: editingDesc || null, config: atual });
      toast.success("Perfil salvo.");
      setOriginal(atual);
      await Promise.all([fetchAll(), recarregarMinhasPermissoes()]);
    } catch (e) {
      mostrarErro(e, "salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  const criar = async () => {
    if (!tenantId || !novoNome.trim()) return;
    try {
      await criarPerfil(tenantId, novoNome, novaDesc || null);
      toast.success("Perfil criado!");
      setShowCreateModal(false);
      setNovoNome("");
      setNovaDesc("");
      fetchAll();
    } catch (e) {
      mostrarErro(e, "criar perfil");
    }
  };

  const duplicar = async () => {
    if (!tenantId || !perfil) return;
    if (alteracoes > 0 && !confirm("Duplicar com as alterações ainda não salvas?")) return;
    try {
      const novoId = await criarPerfil(tenantId, `${perfil.nome} (cópia)`, perfil.descricao);
      await salvarPerfil({
        perfilId: novoId,
        nome: `${perfil.nome} (cópia)`,
        descricao: perfil.descricao,
        config: perfil.acesso_total ? { permissoes: atual.permissoes, menus: {} } : atual,
      });
      toast.success("Perfil duplicado. Ajuste as permissões e salve.");
      await fetchAll();
      setOriginal(CONFIG_VAZIA);
      setAtual(CONFIG_VAZIA);
      setPerfilId(null);
    } catch (e) {
      mostrarErro(e, "duplicar perfil");
    }
  };

  const excluir = async (p: Perfil) => {
    if (!confirm(`Excluir perfil "${p.nome}"?`)) return;
    try {
      await excluirPerfil(p.id);
      toast.success("Perfil excluído.");
      if (perfilId === p.id) {
        setPerfilId(null);
        setOriginal(CONFIG_VAZIA);
        setAtual(CONFIG_VAZIA);
      }
      fetchAll();
    } catch (e) {
      mostrarErro(e, "excluir perfil");
    }
  };

  // ── Filtro de busca e de concedidas, aplicado antes de agrupar ──
  const modulosFiltrados = useMemo(() => {
    if (!catalogo) return [] as Modulo[];
    const termo = busca.trim().toLowerCase();
    return catalogo.modulos.filter((m) => {
      const perms = permissoesDoModulo(catalogo.permissoes, m.id);
      if (perms.length === 0) return false;
      const concedida = perms.some((p) => atual.permissoes.has(p.id));
      if (filtro === "concedidas" && !concedida) return false;
      if (filtro === "nao_concedidas" && concedida) return false;
      if (!termo) return true;
      return rotuloModulo(m).toLowerCase().includes(termo) || m.codigo.toLowerCase().includes(termo);
    });
  }, [catalogo, busca, filtro, atual.permissoes]);

  const gruposWeb = useMemo(() => agruparWeb(modulosFiltrados), [modulosFiltrados]);
  const gruposColetor = useMemo(() => agruparColetor(modulosFiltrados), [modulosFiltrados]);

  // Contadores das abas e prévia do menu usam o catálogo inteiro (sem filtro)
  const resumo = useMemo(() => {
    if (!catalogo) return { web: [0, 0], coletor: [0, 0], previa: [] as { id: string; label: string; estado: "visivel" | "oculto" | "sem_telas" }[] };
    const contar = (coletor: boolean) => {
      const ids = catalogo.permissoes
        .filter((p) => catalogo.modulos.some((m) => m.id === p.modulo_id && ehColetor(m) === coletor))
        .map((p) => p.id);
      return [ids.filter((id) => atual.permissoes.has(id)).length, ids.length];
    };
    const previa = agruparWeb(catalogo.modulos)
      .filter((g) => g.grupo.id !== "__outros")
      .map(({ grupo, modulos }) => {
        const temTela = modulos.some((m) =>
          catalogo.permissoes.some((p) => p.modulo_id === m.id && p.acao === "READ" && atual.permissoes.has(p.id)));
        const estado = !menuVisivel(atual, grupo.id) ? "oculto" as const : temTela ? "visivel" as const : "sem_telas" as const;
        return { id: grupo.id, label: grupo.label, estado };
      });
    return { web: contar(false), coletor: contar(true), previa };
  }, [catalogo, atual]);

  const alternarExpandido = (id: string) => {
    setExpandidos((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && !catalogo) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  const perfis = catalogo?.perfis ?? [];
  const permissoes = catalogo?.permissoes ?? [];
  const busy = saving || carregandoPerfil;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Perfis de Acesso</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{perfis.length} perfis cadastrados</p>
        </div>
        <button
          onClick={() => { setNovoNome(""); setNovaDesc(""); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> Novo Perfil
        </button>
      </div>

      {showCreateModal && (
        <div className="card-surface p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">Criar Novo Perfil</h3>
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome do perfil"
            aria-label="Nome do perfil"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={novaDesc}
            onChange={(e) => setNovaDesc(e.target.value)}
            placeholder="Descrição (opcional)"
            aria-label="Descrição do perfil"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={criar} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Criar</button>
            <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg bg-secondary text-foreground text-sm">Cancelar</button>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4">
        {/* Lista de perfis */}
        <div className="lg:w-72 shrink-0 card-surface overflow-auto max-h-64 lg:max-h-none">
          <div className="p-2 space-y-0.5">
            {perfis.map((p) => {
              const usuarios = catalogo?.usuariosPorPerfil[p.id] ?? 0;
              const podeExcluir = !p.sistema && !p.acesso_total;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-1 rounded-lg transition-colors",
                    perfilId === p.id ? "bg-primary/10" : "hover:bg-secondary",
                  )}
                >
                  <button onClick={() => abrirPerfil(p)} className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left">
                    {p.acesso_total
                      ? <Lock size={14} className="text-primary shrink-0" />
                      : <Shield size={14} className={cn("shrink-0", p.sistema ? "text-amber-500" : "text-muted-foreground")} />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-sm font-medium truncate", perfilId === p.id ? "text-primary" : "text-foreground")}>{p.nome}</span>
                        {p.acesso_total && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">Acesso total</span>}
                        {p.sistema && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-semibold">Sistema</span>}
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users size={11} /> {usuarios} {usuarios === 1 ? "usuário" : "usuários"}
                      </span>
                    </div>
                  </button>
                  {podeExcluir && (
                    <button
                      onClick={() => excluir(p)}
                      disabled={usuarios > 0}
                      title={usuarios > 0 ? "Troque o perfil dos usuários antes de excluir" : "Excluir perfil"}
                      aria-label={`Excluir perfil ${p.nome}`}
                      className="w-7 h-7 mr-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-w-0 card-surface overflow-auto flex flex-col">
          {perfil ? (
            <>
              <div className="p-4 flex flex-col gap-3 flex-1">
                {/* Cabeçalho */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {perfil.sistema ? (
                      <h3 className="text-base font-semibold text-foreground">{perfil.nome}</h3>
                    ) : (
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        aria-label="Nome do perfil"
                        className="text-base font-semibold text-foreground bg-transparent border-b border-border outline-none"
                      />
                    )}
                    {perfil.sistema ? (
                      <p className="text-xs text-muted-foreground mt-1">{perfil.descricao || "Sem descrição"}</p>
                    ) : (
                      <input
                        value={editingDesc}
                        onChange={(e) => setEditingDesc(e.target.value)}
                        placeholder="Descrição (opcional)"
                        aria-label="Descrição do perfil"
                        className="block w-full mt-1 text-xs text-muted-foreground bg-transparent border-b border-transparent focus:border-border outline-none"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={duplicar}
                      disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm hover:bg-secondary/80 disabled:opacity-50"
                    >
                      <Copy size={14} /> Duplicar
                    </button>
                    <button
                      onClick={salvar}
                      disabled={busy || alteracoes === 0 || perfil.sistema}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Salvar
                    </button>
                  </div>
                </div>

                {perfil.acesso_total && (
                  <p className="text-xs px-3 py-2 rounded-md bg-primary/10 text-primary">
                    Perfil de acesso total: tem todas as permissões, inclusive as que forem criadas no futuro, e vê todos os menus.
                  </p>
                )}
                {perfil.sistema && !perfil.acesso_total && (
                  <p className="text-xs px-3 py-2 rounded-md bg-amber-500/10 text-amber-600">
                    Perfil do sistema: somente leitura. Use Duplicar para criar uma versão personalizada.
                  </p>
                )}

                {/* Abas Web / Coletor / Todos */}
                <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
                  <TabsList>
                    <TabsTrigger value="web" className="gap-1.5">
                      <Monitor size={14} /> Painel Web
                      <span className="font-mono text-[10px] text-muted-foreground">{resumo.web[0]}/{resumo.web[1]}</span>
                    </TabsTrigger>
                    <TabsTrigger value="coletor" className="gap-1.5">
                      <Smartphone size={14} /> Coletor
                      <span className="font-mono text-[10px] text-muted-foreground">{resumo.coletor[0]}/{resumo.coletor[1]}</span>
                    </TabsTrigger>
                    <TabsTrigger value="todos">Todos</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Busca e filtro */}
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Pesquisar tela ou módulo..."
                      aria-label="Pesquisar tela ou módulo"
                      className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <select
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value as Filtro)}
                    aria-label="Filtrar permissões"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="todas">Todas</option>
                    <option value="concedidas">Só concedidas</option>
                    <option value="nao_concedidas">Só não concedidas</option>
                  </select>
                </div>

                {carregandoPerfil ? (
                  <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {aba !== "coletor" && (
                      <section className="flex flex-col gap-2">
                        {aba === "todos" && (
                          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
                            <Monitor size={13} /> Painel Web · menus do TopNav
                          </h4>
                        )}
                        {/* Prévia do menu do perfil */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-muted-foreground mr-1">No menu:</span>
                          {resumo.previa.map((g) => (
                            <span
                              key={g.id}
                              title={g.estado === "oculto" ? "Oculto pelo interruptor" : g.estado === "sem_telas" ? "Nenhuma tela com Visualizar" : "Visível"}
                              className={cn(
                                "px-2 py-0.5 rounded border",
                                g.estado === "visivel" && "bg-primary/10 text-primary border-primary/30",
                                g.estado !== "visivel" && "text-muted-foreground/60 border-border line-through",
                              )}
                            >
                              {g.label}
                            </span>
                          ))}
                        </div>
                        {gruposWeb.map((item) => (
                          <PermissoesWebGrupo
                            key={item.grupo.id}
                            item={item}
                            permissoes={permissoes}
                            selecionadas={atual.permissoes}
                            visivel={menuVisivel(atual, item.grupo.id)}
                            expandido={expandidos.has(item.grupo.id) || busca.trim().length > 0}
                            somenteLeitura={somenteLeitura}
                            menuTravado={perfil.acesso_total}
                            onExpandir={() => alternarExpandido(item.grupo.id)}
                            onAlternar={alternar}
                            onDefinir={definir}
                            onVisibilidade={(v) => definirVisibilidade(item.grupo.id, v)}
                          />
                        ))}
                        {gruposWeb.length === 0 && (
                          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma tela do painel web corresponde ao filtro.</p>
                        )}
                      </section>
                    )}

                    {aba !== "web" && (
                      <section className="flex flex-col gap-2">
                        {aba === "todos" && (
                          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-500 uppercase tracking-wide">
                            <Smartphone size={13} /> Coletor · fluxos operacionais
                          </h4>
                        )}
                        {gruposColetor.length > 0 ? (
                          <PermissoesColetor
                            grupos={gruposColetor}
                            permissoes={permissoes}
                            selecionadas={atual.permissoes}
                            somenteLeitura={somenteLeitura}
                            onAlternar={alternar}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum módulo do coletor corresponde ao filtro.</p>
                        )}
                      </section>
                    )}
                  </div>
                )}
              </div>

              {/* Barra de alterações pendentes */}
              {alteracoes > 0 && (
                <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-border bg-card">
                  <span className="flex items-center gap-2 text-sm text-amber-500">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    {alteracoes === 1 ? "1 alteração não salva" : `${alteracoes} alterações não salvas`}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={descartar} disabled={saving} className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm">
                      Descartar
                    </button>
                    <button
                      onClick={salvar}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Salvar alterações
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 py-16 text-sm text-muted-foreground">
              <Shield size={28} className="opacity-40" />
              Selecione um perfil para gerenciar permissões
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
