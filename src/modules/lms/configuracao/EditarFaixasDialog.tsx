import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/dateTime";
import { CORES, PALETA, intervalos, type CorFaixa, type FaixaLms } from "../faixas";
import { ehRetroativa, validarFaixas, type FaixaEntrada, type NivelRegra } from "./lmsConfig.service";

interface Linha extends FaixaEntrada { chave: number }

interface Props {
  aberto: boolean;
  nivelTela: "EMPRESA" | "ARMAZEM";
  atual: FaixaLms[];
  herdado: { lista: FaixaLms[]; nivel: NivelRegra };
  temProprio: boolean;
  hoje: string;
  podeRetroativo: boolean;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: (faixas: FaixaEntrada[] | null, vigenteDesde: string, motivo: string) => void;
}

let seq = 0;
const paraLinhas = (l: FaixaLms[]): Linha[] =>
  [...l].sort((a, b) => b.a_partir_de_pct - a.a_partir_de_pct)
    .map((f) => ({ chave: ++seq, nome: f.nome, cor: f.cor, a_partir_de_pct: Number(f.a_partir_de_pct), eh_meta: f.eh_meta }));

function menosDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

export function EditarFaixasDialog({
  aberto, nivelTela, atual, herdado, temProprio, hoje, podeRetroativo, salvando, onCancelar, onSalvar,
}: Props) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [herdar, setHerdar] = useState(false);
  const [vigencia, setVigencia] = useState(hoje);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setLinhas(paraLinhas(atual));
    setHerdar(false);
    setVigencia(hoje);
    setMotivo("");
  }, [aberto, atual, hoje]);

  const retro = ehRetroativa(vigencia, hoje);
  const minData = podeRetroativo ? menosDias(hoje, 92) : hoje;
  const entradas: FaixaEntrada[] = linhas.map(({ chave: _c, ...f }) => f);

  const erro = useMemo(() => {
    if (!vigencia || vigencia < minData) {
      return podeRetroativo ? "A data de início pode voltar no máximo 92 dias." : "A data de início não pode ser no passado.";
    }
    if (retro && !motivo.trim()) return "Informe o motivo de uma mudança com data no passado.";
    if (herdar) return null;
    return validarFaixas(entradas);
  }, [vigencia, minData, podeRetroativo, retro, motivo, herdar, entradas]);

  // Prévia: uma etiqueta por faixa, com o intervalo que ela cobre (todas aparecem, inclusive as mais baixas)
  const previa = useMemo(() => {
    const lista: FaixaLms[] = entradas.map((f, i) => ({ ...f, ordem: i + 1, codigo: `${i}` }));
    return intervalos(lista);
  }, [entradas]);

  function alterar(chave: number, campo: Partial<FaixaEntrada>) {
    setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, ...campo } : campo.eh_meta ? { ...x, eh_meta: false } : x)));
  }
  function adicionar() {
    const usadas = new Set(linhas.map((l) => l.cor));
    const cor = CORES.find((c) => !usadas.has(c)) ?? "cinza";
    setLinhas((l) => [...l, { chave: ++seq, nome: "", cor, a_partir_de_pct: NaN, eh_meta: false }]);
  }

  if (!aberto) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onCancelar(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Faixas de classificação</DialogTitle>
          <DialogDescription>
            {nivelTela === "EMPRESA"
              ? "Valem para todos os armazéns da empresa que não tiverem faixas próprias."
              : "Este armazém passa a usar um conjunto próprio de faixas, no lugar do da empresa."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {(temProprio || nivelTela === "ARMAZEM") && (
            <div className="flex items-center gap-2">
              <Checkbox id="lms-faixas-herdar" checked={herdar} onCheckedChange={(c) => setHerdar(c === true)} />
              <Label htmlFor="lms-faixas-herdar" className="font-normal">
                Voltar a herdar as faixas {herdado.nivel === "EMPRESA" ? "da empresa" : "do padrão do sistema"} ({herdado.lista.map((f) => f.nome).join(", ")})
              </Label>
            </div>
          )}

          {!herdar && (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">Nome</th>
                      <th className="px-2 py-2 text-left font-medium">Cor</th>
                      <th className="px-2 py-2 text-left font-medium">A partir de</th>
                      <th className="px-2 py-2 text-center font-medium">Meta</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={l.chave} className="border-t border-border">
                        <td className="px-2 py-1.5">
                          <Input aria-label={`Nome da faixa ${i + 1}`} value={l.nome} maxLength={30}
                            onChange={(e) => alterar(l.chave, { nome: e.target.value })} className="h-8" />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Cor da faixa ${i + 1}`}>
                            {CORES.map((c) => (
                              <button key={c} type="button" role="radio" aria-checked={l.cor === c} aria-label={PALETA[c].rotulo}
                                title={PALETA[c].rotulo} onClick={() => alterar(l.chave, { cor: c as CorFaixa })}
                                className={cn("h-5 w-5 rounded-full border-2", l.cor === c ? "border-foreground" : "border-transparent")}
                                style={{ background: PALETA[c].hex }} />
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <Input aria-label={`A partir de (faixa ${i + 1})`} inputMode="decimal" className="h-8 w-20"
                              value={Number.isNaN(l.a_partir_de_pct) ? "" : String(l.a_partir_de_pct)}
                              onChange={(e) => alterar(l.chave, { a_partir_de_pct: e.target.value.trim() === "" ? NaN : Number(e.target.value.replace(",", ".")) })} />
                            <span className="text-muted-foreground">%</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button type="button" aria-label={`Marcar ${l.nome || `faixa ${i + 1}`} como meta`} aria-pressed={l.eh_meta}
                            onClick={() => alterar(l.chave, { eh_meta: true })}
                            className={cn("inline-flex", l.eh_meta ? "text-amber-500" : "text-muted-foreground hover:text-foreground")}>
                            <Star size={16} fill={l.eh_meta ? "currentColor" : "none"} />
                          </button>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex justify-end gap-0.5">
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remover faixa ${i + 1}`}
                              onClick={() => setLinhas((x) => x.filter((y) => y.chave !== l.chave))} disabled={linhas.length <= 2}><Trash2 size={14} /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={adicionar} disabled={linhas.length >= 6}>
                  <Plus size={14} className="mr-1" /> Adicionar faixa
                </Button>
                <p className="text-xs text-muted-foreground">De 2 a 6 faixas, ordenadas pelo percentual ao salvar. A mais baixa começa em 0%. A estrela marca a meta.</p>
              </div>
              {!validarFaixas(entradas) && (
                <div className="flex flex-wrap gap-1.5 text-xs" aria-label="Prévia da classificação">
                  <span className="text-muted-foreground">Prévia:</span>
                  {previa.map(({ faixa, texto }) => (
                    <span key={faixa.codigo} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", PALETA[faixa.cor].fundo, PALETA[faixa.cor].texto, PALETA[faixa.cor].borda)}>
                      {faixa.eh_meta && <Star size={10} fill="currentColor" aria-label="meta" />}
                      {faixa.nome} {texto}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lms-faixas-vigencia">Vale a partir de</Label>
              <Input id="lms-faixas-vigencia" type="date" value={vigencia} min={minData} onChange={(e) => setVigencia(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                {retro ? `Data no passado: os períodos a partir de ${formatDate(vigencia)} passam a usar estas faixas.`
                  : vigencia > hoje ? `Fica agendado e passa a valer em ${formatDate(vigencia)}.` : "Vale a partir de hoje."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lms-faixas-motivo">Motivo {retro ? "(obrigatório)" : "(opcional)"}</Label>
              <Textarea id="lms-faixas-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>

          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => onSalvar(herdar ? null : entradas, vigencia, motivo)} disabled={!!erro || salvando}>
            {salvando && <Loader2 size={14} className="mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
