/**
 * Fluxo de Expedição · F6.7 — "Responsáveis pelo carregamento" (como "Responsáveis da onda").
 * Sem convocado = carga livre no coletor para qualquer operador com permissão de embarque;
 * com convocados = só eles veem e executam a carga. Elegibilidade e regras vêm de carga_operadores_elegiveis /
 * carga_responsaveis_salvar; a tela só monta a escolha.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Search, UserCog, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cargaService, type CargaStatus } from "@/lib/cargaService";
import { parseError } from "@/lib/errorMapper";

interface Props {
  carga: { id: string; numero_carga: number; status: CargaStatus } | null;
  tenantId: string;
  usuarioId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CargaResponsaveisDialog({ carga, tenantId, usuarioId, onClose, onSuccess }: Props) {
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const q = useQuery({
    queryKey: ["carga-operadores", carga?.id],
    enabled: !!carga,
    staleTime: 0,
    queryFn: () => cargaService.operadoresElegiveis(tenantId, carga!.id),
  });
  const operadores = useMemo(() => q.data ?? [], [q.data]);
  const gravados = useMemo(() => new Set(operadores.filter((o) => o.convocado).map((o) => o.usuario_id)), [operadores]);

  useEffect(() => { setSelecao(new Set(gravados)); }, [gravados]);
  useEffect(() => { if (!carga) { setBusca(""); setMotivo(""); } }, [carga]);

  const visiveis = operadores.filter((o) => {
    const t = busca.trim().toLowerCase();
    return !t || o.nome.toLowerCase().includes(t) || (o.login ?? "").toLowerCase().includes(t);
  });
  const removendo = [...gravados].some((id) => !selecao.has(id));
  const exigeMotivo = carga?.status === "EM_CARREGAMENTO" && removendo;
  const alterado = selecao.size !== gravados.size || [...selecao].some((id) => !gravados.has(id));

  const alternar = (id: string) => setSelecao((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const salvar = async () => {
    if (!carga) return;
    setSalvando(true);
    try {
      const r = await cargaService.salvarResponsaveis(tenantId, usuarioId, carga.id, [...selecao], motivo);
      toast.success(r.mensagem ?? "Responsáveis salvos.");
      onSuccess();
      onClose();
    } catch (e) {
      const p = parseError(e, "carga-responsaveis");
      toast.error(p.title, { description: p.instruction || p.details });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!carga} onOpenChange={(v) => !v && !salvando && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserCog size={18} /> Responsáveis pelo carregamento · Carga #{carga?.numero_carga}</DialogTitle>
          <DialogDescription>
            Sem ninguém marcado, a carga fica livre no coletor para qualquer operador com permissão de embarque.
            Marcando operadores, só eles veem e carregam esta carga.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button type="button" onClick={() => setSelecao(new Set())}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
              selecao.size === 0 ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-secondary"}`}>
            <UsersRound size={15} /> Livre (qualquer operador habilitado)
            {selecao.size === 0 && <Check size={14} className="ml-auto" />}
          </button>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar operador por nome ou login..."
              aria-label="Buscar operador"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
            {q.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>
            ) : visiveis.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum operador encontrado.</p>
            ) : visiveis.map((o) => {
              const marcado = selecao.has(o.usuario_id);
              return (
                <button key={o.usuario_id} type="button" disabled={!o.elegivel} onClick={() => alternar(o.usuario_id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    marcado ? "bg-primary/10" : "hover:bg-secondary"}`}
                  aria-pressed={marcado} title={o.elegivel ? undefined : o.mensagem ?? undefined}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${marcado ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                    {marcado && <Check size={11} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground truncate">{o.nome}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {o.elegivel ? (o.login ?? "") : o.mensagem}
                      {o.volumes_carregados > 0 && ` · ${o.volumes_carregados} volume(s) já carregados`}
                    </span>
                  </span>
                  {o.logado && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/15 text-green-400 border-green-500/30 shrink-0">ONLINE</span>
                  )}
                </button>
              );
            })}
          </div>

          {exigeMotivo && (
            <div>
              <label htmlFor="motivo-responsavel" className="block text-xs font-medium text-muted-foreground mb-1.5">Motivo da troca (obrigatório: carga em carregamento) *</label>
              <textarea id="motivo-responsavel" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300}
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary resize-none" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {selecao.size === 0 ? "Carga livre." : `${selecao.size} operador(es) convocado(s).`} Os volumes já carregados continuam registrados com quem os carregou.
          </p>
        </div>

        <DialogFooter>
          <button type="button" onClick={onClose} disabled={salvando}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
          <button type="button" onClick={() => void salvar()} disabled={salvando || !alterado || (exigeMotivo && !motivo.trim())}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
