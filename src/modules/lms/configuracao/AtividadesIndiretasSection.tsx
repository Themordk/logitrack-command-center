import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Coffee, Loader2, Pencil, Plus, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  ROTULO_TIPO_ATIVIDADE, codigoDeNome, listarAtividadesLms, restaurarAtividadesPadrao, salvarAtividadeLms,
  type AtividadeIndireta, type TipoAtividade,
} from "./lmsConfig.service";

interface Props {
  tenantId: string;
  empresaId: string;
  nomeEmpresa: string;
  nivelTela: "EMPRESA" | "ARMAZEM";
}

type Edicao = { id: string | null; codigo: string; nome: string; tipo: TipoAtividade; duracao: string; ativo: boolean; usada: boolean };

const TIPOS: TipoAtividade[] = ["INDIRETA", "EXCECAO"];

export function AtividadesIndiretasSection({ tenantId, empresaId, nomeEmpresa, nivelTela }: Props) {
  const [itens, setItens] = useState<AtividadeIndireta[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listarAtividadesLms(tenantId, empresaId);
      setItens(r.atividades);
      setPodeEditar(r.pode_editar);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar as atividades.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId, empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(e: Edicao) {
    setSalvando(true);
    try {
      await salvarAtividadeLms({
        tenantId, empresaId, id: e.id, codigo: e.codigo || codigoDeNome(e.nome), nome: e.nome, tipo: e.tipo,
        duracaoMaxMin: Number(e.duracao), ativo: e.ativo,
      });
      toast.success(e.id ? "Atividade atualizada." : "Atividade criada.");
      setEdicao(null);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(a: AtividadeIndireta) {
    try {
      await salvarAtividadeLms({ tenantId, empresaId, id: a.id, codigo: a.codigo, nome: a.nome, tipo: a.tipo, duracaoMaxMin: a.duracao_max_min, ativo: !a.ativo, ordem: a.ordem });
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar.");
    }
  }

  async function restaurar() {
    try {
      const n = await restaurarAtividadesPadrao(tenantId, empresaId);
      toast.success(n > 0 ? `${n} atividade(s) da lista padrão recriada(s).` : "A lista padrão já está completa.");
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível restaurar.");
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="lms-atividades">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-2">
          <Coffee size={18} className="mt-0.5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Atividades indiretas e paradas</h2>
            <p className="text-xs text-muted-foreground">
              O que o operador pode apontar no coletor quando não está numa tarefa.
              {nivelTela === "ARMAZEM" && ` A lista é da empresa (${nomeEmpresa}) e vale para todos os armazéns.`}
            </p>
          </div>
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={restaurar} title="Recria as atividades da lista padrão que tiverem sido apagadas">
              <RotateCcw size={14} className="mr-1" /> Lista padrão
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => setEdicao({ id: null, codigo: "", nome: "", tipo: "INDIRETA", duracao: "60", ativo: true, usada: false })}>
              <Plus size={14} className="mr-1" /> Nova atividade
            </Button>
          </div>
        )}
      </header>

      {carregando && itens.length === 0 ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="grid gap-0 md:grid-cols-2">
          {TIPOS.map((t) => (
            <div key={t} className="border-b border-border p-4 md:border-b-0 md:[&:first-child]:border-r">
              <p className="text-xs font-semibold text-foreground">{ROTULO_TIPO_ATIVIDADE[t].titulo}</p>
              <p className="mb-2 text-[11px] text-muted-foreground">{ROTULO_TIPO_ATIVIDADE[t].efeito}</p>
              <ul className="space-y-1">
                {itens.filter((a) => a.tipo === t).map((a) => (
                  <li key={a.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40", !a.ativo && "opacity-50")}>
                    <span className="flex-1 text-foreground">{a.nome}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground" title="Se o operador esquecer de encerrar, conta no máximo este tempo">
                      até {a.duracao_max_min} min
                    </span>
                    {a.usos_30d > 0 && <span className="text-[11px] text-muted-foreground">· {a.usos_30d} uso(s) em 30 dias</span>}
                    {!a.ativo && <span className="text-[11px] text-muted-foreground">· desativada</span>}
                    {podeEditar && (
                      <>
                        <Checkbox aria-label={`${a.ativo ? "Desativar" : "Ativar"} ${a.nome}`} checked={a.ativo} onCheckedChange={() => alternar(a)} />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`Editar ${a.nome}`}
                          onClick={() => setEdicao({ id: a.id, codigo: a.codigo, nome: a.nome, tipo: a.tipo, duracao: String(a.duracao_max_min), ativo: a.ativo, usada: a.usos_30d > 0 })}>
                          <Pencil size={13} />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
                {itens.filter((a) => a.tipo === t).length === 0 && <li className="text-xs text-muted-foreground">Nenhuma.</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      {edicao && <EditarAtividadeDialog edicao={edicao} salvando={salvando} onCancelar={() => setEdicao(null)} onSalvar={salvar} />}
    </section>
  );
}

function EditarAtividadeDialog({ edicao, salvando, onCancelar, onSalvar }: {
  edicao: Edicao; salvando: boolean; onCancelar: () => void; onSalvar: (e: Edicao) => void;
}) {
  const [e, setE] = useState(edicao);
  const dur = Number(e.duracao);
  const erro = e.nome.trim().length < 2 ? "Informe o nome." : !Number.isInteger(dur) || dur < 5 || dur > 720 ? "A duração máxima deve ficar entre 5 e 720 minutos." : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onCancelar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{e.id ? "Editar atividade" : "Nova atividade"}</DialogTitle>
          <DialogDescription>Aparece na lista do coletor para o operador apontar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="ativ-nome">Nome</Label>
            <Input id="ativ-nome" value={e.nome} maxLength={60} onChange={(ev) => setE({ ...e, nome: ev.target.value })} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map((t) => (
                <button key={t} type="button" disabled={!!e.id && edicao.tipo !== t && edicao.usada}
                  onClick={() => setE({ ...e, tipo: t })}
                  className={cn("rounded-md border p-2 text-left text-xs disabled:opacity-40",
                    e.tipo === t ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40")}>
                  <span className="block font-semibold text-foreground">{ROTULO_TIPO_ATIVIDADE[t].titulo}</span>
                  <span className="text-muted-foreground">{ROTULO_TIPO_ATIVIDADE[t].efeito}</span>
                </button>
              ))}
            </div>
            {!!e.id && edicao.usada && <p className="text-[11px] text-muted-foreground">Já tem apontamentos: o tipo não muda (mudaria o passado ao reprocessar).</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ativ-dur">Duração máxima (min)</Label>
            <Input id="ativ-dur" inputMode="numeric" value={e.duracao} onChange={(ev) => setE({ ...e, duracao: ev.target.value })} />
            <p className="text-xs text-muted-foreground">Se o operador esquecer de encerrar, o apontamento fecha sozinho depois desse tempo.</p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ativ-ativo" checked={e.ativo} onCheckedChange={(c) => setE({ ...e, ativo: c === true })} />
            <Label htmlFor="ativ-ativo" className="font-normal">Disponível no coletor</Label>
          </div>
          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => onSalvar({ ...e, nome: e.nome.trim() })} disabled={!!erro || salvando}>
            {salvando && <Loader2 size={14} className="mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
