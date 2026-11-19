import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { listarEquipes, salvarEquipe, type CatalogoMetas, type Equipe } from "./metas.service";

interface Props { tenantId: string; empresaId: string; catalogo: CatalogoMetas; onAlterou: () => void }

type Edicao = { id: string | null; nome: string; armazem_id: string; lider_id: string; ativo: boolean; membros: string[] };

export function EquipesSection({ tenantId, empresaId, catalogo, onAlterou }: Props) {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listarEquipes(tenantId, empresaId);
      setEquipes(r.equipes);
      setPodeEditar(r.pode_editar);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar as equipes.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId, empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    if (!edicao) return;
    setSalvando(true);
    try {
      await salvarEquipe(tenantId, {
        id: edicao.id, empresa_id: empresaId, nome: edicao.nome.trim(), armazem_id: edicao.armazem_id || null,
        lider_id: edicao.lider_id || null, ativo: edicao.ativo, membros: edicao.membros,
      });
      toast.success("Equipe salva.");
      setEdicao(null);
      await carregar();
      onAlterou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const operadores = catalogo.operadores.filter((o) => !busca || o.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="lms-equipes">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-2">
          <Users size={18} className="mt-0.5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Equipes</h2>
            <p className="text-xs text-muted-foreground">Grupos de operadores com líder, para metas e acompanhamento. Quem sai da equipe deixa de contar a partir de hoje; o passado não muda.</p>
          </div>
        </div>
        {podeEditar && (
          <Button size="sm" variant="outline" onClick={() => setEdicao({ id: null, nome: "", armazem_id: "", lider_id: "", ativo: true, membros: [] })}>
            <Plus size={14} className="mr-1" /> Nova equipe
          </Button>
        )}
      </header>
      {carregando && equipes.length === 0 ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : equipes.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">Nenhuma equipe cadastrada.</p>
      ) : (
        <ul className="divide-y divide-border">
          {equipes.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-[160px] font-medium text-foreground">{e.nome}{!e.ativo && <span className="ml-1 text-xs text-muted-foreground">(inativa)</span>}</span>
              <span className="text-xs text-muted-foreground">{e.armazem_nome ?? "Toda a empresa"}</span>
              <span className="text-xs text-muted-foreground">{e.lider_nome ? `Líder: ${e.lider_nome}` : "Sem líder"}</span>
              <span className="flex-1 truncate text-xs text-foreground">{e.membros.map((m) => m.nome).join(", ") || "Sem membros"}</span>
              <span className="text-xs text-muted-foreground">{e.metas_ativas} meta(s) ativa(s)</span>
              {podeEditar && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`Editar ${e.nome}`}
                  onClick={() => setEdicao({ id: e.id, nome: e.nome, armazem_id: e.armazem_id ?? "", lider_id: e.lider_id ?? "", ativo: e.ativo, membros: e.membros.map((m) => m.usuario_id) })}>
                  <Pencil size={13} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {edicao && (
        <Dialog open onOpenChange={(o) => { if (!o && !salvando) setEdicao(null); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{edicao.id ? "Editar equipe" : "Nova equipe"}</DialogTitle>
              <DialogDescription>Os membros entram e saem a partir de hoje.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Label htmlFor="eq-nome">Nome</Label>
                <Input id="eq-nome" value={edicao.nome} maxLength={60} onChange={(ev) => setEdicao({ ...edicao, nome: ev.target.value })} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="eq-arm">Armazém</Label>
                  <select id="eq-arm" className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={edicao.armazem_id}
                    onChange={(ev) => setEdicao({ ...edicao, armazem_id: ev.target.value })}>
                    <option value="">Toda a empresa</option>
                    {catalogo.armazens.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eq-lider">Líder</Label>
                  <select id="eq-lider" className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={edicao.lider_id}
                    onChange={(ev) => setEdicao({ ...edicao, lider_id: ev.target.value })}>
                    <option value="">Sem líder</option>
                    {catalogo.operadores.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Membros ({edicao.membros.length})</Label>
                <Input placeholder="Buscar operador" value={busca} onChange={(ev) => setBusca(ev.target.value)} />
                <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-1" aria-label="Membros">
                  {operadores.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={edicao.membros.includes(o.id)}
                        onCheckedChange={() => setEdicao({ ...edicao, membros: edicao.membros.includes(o.id) ? edicao.membros.filter((x) => x !== o.id) : [...edicao.membros, o.id] })} />
                      {o.nome}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <Checkbox checked={edicao.ativo} onCheckedChange={(c) => setEdicao({ ...edicao, ativo: c === true })} /> Ativa
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdicao(null)} disabled={salvando}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando || edicao.nome.trim().length < 2}>
                {salvando && <Loader2 size={14} className="mr-1 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
