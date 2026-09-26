import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, CircleDashed, Info, Loader2, Lock, Plus, RefreshCcw, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { formatDateTime } from "@/utils/dateTime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CAMPOS_PADRAO_PRODUTO, MODOS_PADRAO, SECOES_PADRAO, campoDef, formatarValorPadrao, labelModo,
  type CampoPadraoDef, type ModoPadrao, type RegraPadraoProduto, type ResultadoAplicar, type ValorPadrao,
} from "./produtoPadroes.types";
import {
  aplicarRegrasPadrao, listarRegrasPadrao, regrasPadraoQueryKey, removerRegraPadrao, salvarRegraPadrao,
} from "./produtoPadroesService";

const MODULO = "web.config.integracao";
const CAMPOS_IMPACTO = new Set(["tipo_controle", "tipo_separacao", "usa_picking", "varios_pickings"]);

export function ModoBadge({ modo }: { modo: ModoPadrao }) {
  const Icon = modo === "SEMPRE" ? Lock : modo === "SE_VAZIO" ? CircleDashed : Sparkles;
  return (
    <Badge variant={modo === "SEMPRE" ? "default" : "secondary"} className="gap-1 text-[10px]">
      <Icon size={11} aria-hidden /> {labelModo(modo)}
    </Badge>
  );
}

function valorInicial(def: CampoPadraoDef): ValorPadrao {
  if (def.tipo === "boolean") return false;
  if (def.tipo === "enum") return def.opcoes?.[0] ?? "";
  return def.tipo === "inteiro" && ["lastro", "camada", "fator_caixa"].includes(def.chave) ? 1 : 0;
}

interface Draft { valor: ValorPadrao | ""; modo: ModoPadrao }

function LinhaCampo({
  def, regra, podeEditar, empresaId, onChanged,
}: {
  def: CampoPadraoDef; regra?: RegraPadraoProduto; podeEditar: boolean; empresaId: string | null; onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmRemover, setConfirmRemover] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  useEffect(() => { setDraft(null); setErro(null); }, [regra?.updated_at, regra?.valor, regra?.modo]);

  const atual: Draft | null = draft ?? (regra ? { valor: regra.valor, modo: regra.modo } : null);
  const sujo = draft !== null;
  const id = `padrao-${def.chave}`;

  const salvar = async () => {
    if (!atual) return;
    const parsed = def.schema.safeParse(atual.valor === "" ? undefined : atual.valor);
    if (!parsed.success) { setErro(parsed.error.issues[0]?.message ?? "Valor inválido"); return; }
    setSalvando(true);
    const r = await salvarRegraPadrao({ empresaId, campo: def.chave, valor: parsed.data, modo: atual.modo });
    setSalvando(false);
    if (!r.sucesso) {
      const msg = r.mensagem ?? "Não foi possível salvar";
      setErro(msg); toast.error(msg); return;
    }
    toast.success(`Padrão de ${def.rotulo} salvo`);
    setDraft(null); setErro(null); onChanged();
  };

  const remover = async () => {
    setRemovendo(true);
    const r = await removerRegraPadrao(empresaId, def.chave);
    setRemovendo(false);
    setConfirmRemover(false);
    if (!r.sucesso) { toast.error(r.mensagem ?? "Não foi possível remover"); return; }
    toast.success(`Padrão de ${def.rotulo} removido`);
    onChanged();
  };

  const setValor = (v: ValorPadrao | "") => { setErro(null); setDraft({ valor: v, modo: atual?.modo ?? "SE_VAZIO" }); };
  const setModo = (m: ModoPadrao) => setDraft({ valor: atual?.valor ?? valorInicial(def), modo: m });

  const controle = () => {
    if (!atual) return null;
    const disabled = !podeEditar || salvando;
    if (def.tipo === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <Switch id={id} checked={atual.valor === true} onCheckedChange={(v) => setValor(v)} disabled={disabled} />
          <span className="text-xs text-muted-foreground">{atual.valor === true ? "Sim" : "Não"}</span>
        </div>
      );
    }
    if (def.tipo === "enum") {
      return (
        <Select value={String(atual.valor)} onValueChange={(v) => setValor(v)} disabled={disabled}>
          <SelectTrigger id={id} className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{def.opcoes!.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    return (
      <Input
        id={id}
        type="number"
        inputMode={def.tipo === "inteiro" ? "numeric" : "decimal"}
        step={def.tipo === "inteiro" ? 1 : 0.01}
        min={0}
        className="h-8 w-32 text-xs"
        value={atual.valor === "" ? "" : String(atual.valor)}
        onChange={(e) => setValor(e.target.value === "" ? "" : Number(e.target.value))}
        disabled={disabled}
        aria-invalid={!!erro}
      />
    );
  };

  const ajudaModo = atual ? MODOS_PADRAO.find((m) => m.value === atual.modo)?.ajuda : null;

  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-40 shrink-0 pt-1.5">
          <Label htmlFor={atual ? id : undefined} className="text-sm font-medium text-foreground">{def.rotulo}</Label>
          {atual && <div className="mt-1"><ModoBadge modo={atual.modo} /></div>}
        </div>

        {!atual ? (
          <div className="flex items-center gap-3 pt-1.5">
            <span className="text-xs text-muted-foreground">Sem padrão</span>
            {podeEditar && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDraft({ valor: valorInicial(def), modo: "SE_VAZIO" })}>
                <Plus size={12} aria-hidden /> Definir padrão
              </Button>
            )}
          </div>
        ) : (
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {controle()}
              <Label htmlFor={`${id}-modo`} className="sr-only">Modo de {def.rotulo}</Label>
              <Select value={atual.modo} onValueChange={(v) => setModo(v as ModoPadrao)} disabled={!podeEditar || salvando}>
                <SelectTrigger id={`${id}-modo`} className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{MODOS_PADRAO.map((m) => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}</SelectContent>
              </Select>
              {podeEditar && sujo && (
                <>
                  <Button size="sm" className="h-8 text-xs" onClick={salvar} disabled={salvando}>
                    {salvando && <Loader2 size={12} className="animate-spin mr-1" aria-hidden />} Salvar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setDraft(null); setErro(null); }} disabled={salvando}>
                    Cancelar
                  </Button>
                </>
              )}
              {podeEditar && regra && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Remover padrão de ${def.rotulo}`} onClick={() => setConfirmRemover(true)} disabled={salvando}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
            {ajudaModo && <p className="text-[11px] text-muted-foreground">{ajudaModo}</p>}
            {erro && <p className="text-[11px] text-destructive" role="alert">{erro}</p>}
            {atual.modo === "SEMPRE" && CAMPOS_IMPACTO.has(def.chave) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-400">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden />
                <span>
                  Este campo muda como a separação e a armazenagem funcionam para todos os produtos. Edições manuais no cadastro serão sobrescritas pela integração.
                  {def.chave === "tipo_controle" && " Produtos com saldo em estoque não terão o tipo de controle alterado ao aplicar nos existentes."}
                </span>
              </div>
            )}
            {regra && (regra.atualizado_por || regra.updated_at) && (
              <p className="text-[10px] text-muted-foreground">
                Atualizado{regra.atualizado_por ? ` por ${regra.atualizado_por}` : ""}{regra.updated_at ? ` em ${formatDateTime(regra.updated_at)}` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmRemover} onOpenChange={setConfirmRemover}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover padrão</AlertDialogTitle>
            <AlertDialogDescription>
              Remover o padrão de {def.rotulo}? A integração volta ao comportamento padrão do sistema para este campo. Produtos já alterados não voltam ao valor anterior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); remover(); }} disabled={removendo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removendo && <Loader2 size={12} className="animate-spin mr-1" aria-hidden />} Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ProdutoPadroesPage({ onNavigate: _onNavigate }: { onNavigate?: (p: string) => void }) {
  const { empresaId, empresaVersion } = useTenant() as any;
  const { can } = usePermissions();
  const podeLer = can(MODULO, "READ");
  const podeEditar = can(MODULO, "UPDATE");
  const qc = useQueryClient();
  const key = regrasPadraoQueryKey(empresaId ?? null);

  const { data: regras, isLoading, error, refetch } = useQuery({
    queryKey: [...key, empresaVersion],
    queryFn: () => listarRegrasPadrao(empresaId ?? null),
    enabled: podeLer,
    staleTime: 60_000,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: key });
  const porCampo = useMemo(() => new Map((regras ?? []).map((r) => [r.campo, r])), [regras]);

  const [simOpen, setSimOpen] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [sim, setSim] = useState<ResultadoAplicar | null>(null);

  const simular = async () => {
    setSimulando(true);
    const r = await aplicarRegrasPadrao(empresaId ?? null, true);
    setSimulando(false);
    if (!r.sucesso) { toast.error(r.mensagem ?? "Falha na simulação"); return; }
    setSim(r); setSimOpen(true);
  };

  const aplicar = async () => {
    setAplicando(true);
    const r = await aplicarRegrasPadrao(empresaId ?? null, false);
    setAplicando(false);
    if (!r.sucesso) { toast.error(r.mensagem ?? "Falha ao aplicar"); return; }
    const n = (r.campos ?? []).reduce((s, c) => s + (Number(c.produtos_afetados) || 0), 0);
    setSimOpen(false);
    toast.success(`Padrões aplicados em ${n} alterações de produto`);
    invalidar();
  };

  const totalAfetados = (sim?.campos ?? []).reduce((s, c) => s + (c.observacao ? 0 : Number(c.produtos_afetados) || 0), 0);

  if (!podeLer) {
    return <div className="p-6 text-sm text-muted-foreground">Você não tem permissão para acessar esta tela.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 h-full overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Padrões de cadastro de produto</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Valores aplicados automaticamente pela integração com o ERP quando o dado não é informado ou precisa seguir o padrão da empresa.
          </p>
        </div>
        <Button variant="outline" onClick={simular} disabled={simulando || isLoading} className="gap-2">
          {simulando ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
          Aplicar nos produtos existentes
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-6 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-destructive">Não foi possível carregar os padrões: {(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1"><RefreshCcw size={13} aria-hidden /> Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {SECOES_PADRAO.map((s) => <Skeleton key={s} className="h-56 w-full" />)}
        </div>
      ) : (
        <>
          {(regras ?? []).length === 0 && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              <Info size={15} aria-hidden /> Nenhum padrão definido. A integração segue o comportamento padrão do sistema.
            </div>
          )}
          {!podeEditar && (
            <p className="text-xs text-muted-foreground">Modo somente leitura — você não tem permissão para alterar os padrões.</p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {SECOES_PADRAO.map((secao) => (
              <Card key={secao}>
                <CardHeader className="pb-1"><CardTitle className="text-sm">{secao}</CardTitle></CardHeader>
                <CardContent>
                  {CAMPOS_PADRAO_PRODUTO.filter((c) => c.secao === secao).map((def) => (
                    <LinhaCampo key={def.chave} def={def} regra={porCampo.get(def.chave)} podeEditar={podeEditar}
                      empresaId={empresaId ?? null} onChanged={invalidar} />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={simOpen} onOpenChange={(o) => !aplicando && setSimOpen(o)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Simulação</DialogTitle>
            <DialogDescription>
              {totalAfetados === 0
                ? "Nenhum produto precisa ser alterado."
                : `${totalAfetados} alterações em ${sim?.total_produtos ?? 0} produtos avaliados.`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead><TableHead>Modo</TableHead><TableHead>Valor</TableHead>
                  <TableHead className="text-right">Produtos afetados</TableHead>
                  <TableHead className="text-right">Ignorados (com estoque)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sim?.campos ?? []).map((c) => (
                  <TableRow key={c.campo}>
                    <TableCell className="text-xs">{campoDef(c.campo)?.rotulo ?? c.campo}</TableCell>
                    <TableCell><ModoBadge modo={c.modo} /></TableCell>
                    <TableCell className="text-xs">{formatarValorPadrao(c.valor)}</TableCell>
                    {c.observacao ? (
                      <TableCell colSpan={2} className="text-xs text-muted-foreground text-right">Não se aplica a produtos existentes</TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums text-xs">{c.produtos_afetados}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{c.ignorados_com_estoque ?? 0}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-xs font-semibold">Total</TableCell>
                  <TableCell colSpan={2} className="text-right text-xs font-semibold tabular-nums">
                    {totalAfetados} de {sim?.total_produtos ?? 0} produtos
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimOpen(false)} disabled={aplicando}>
              {totalAfetados === 0 ? "Fechar" : "Cancelar"}
            </Button>
            {podeEditar && totalAfetados > 0 && (
              <Button onClick={aplicar} disabled={aplicando}>
                {aplicando && <Loader2 size={14} className="animate-spin mr-1" aria-hidden />} Confirmar e aplicar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProdutoPadroesPage;
