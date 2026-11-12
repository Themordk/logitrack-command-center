import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, ChevronRight, Loader2, PackageCheck, RefreshCw, Route, Truck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { parseError } from "@/lib/errorMapper";
import { cargaService, type CargaStatus, type OndaSugerida } from "@/lib/cargaService";
import { CARGA_STATUS_LABEL, agruparSugestao, formatarNumero } from "@/lib/cargaExibicao";
import { useCargaCadastros } from "@/hooks/useCargaCadastros";
import { CargaStatusBadge } from "@/components/carga/CargaStatusBadge";
import { CapacidadeVeiculo } from "@/components/carga/CapacidadeVeiculo";
import { CargaDetalheSheet } from "@/components/carga/CargaDetalheSheet";

const MODULO = "web.atividades.montagem-carga";
const FILTROS: { valor: string; rotulo: string; status: CargaStatus[] | null }[] = [
  { valor: "ativas", rotulo: "Em aberto", status: ["EM_MONTAGEM", "LIBERADA", "EM_CARREGAMENTO"] },
  { valor: "FECHADA", rotulo: "Fechadas", status: ["FECHADA"] },
  { valor: "CANCELADA", rotulo: "Canceladas", status: ["CANCELADA"] },
  { valor: "todas", rotulo: "Todas", status: null },
];
const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary";
const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function MontagemCargaPage(_props: { onNavigate?: (path: string) => void } = {}) {
  const { tenantId, empresaId, usuarioId } = useTenant();
  const { can } = usePermissions();
  const podeEditar = can(MODULO, "UPDATE") || can(MODULO, "CREATE");
  const qc = useQueryClient();
  const { veiculos, boxes } = useCargaCadastros(tenantId, empresaId);

  const [aba, setAba] = useState("montar");
  const [filtro, setFiltro] = useState("ativas");
  const [cargaAberta, setCargaAberta] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ veiculoId: "", boxId: "", motorista: "" });

  const pronto = !!tenantId && !!empresaId;

  const sugestao = useQuery({
    queryKey: ["carga-sugestao", tenantId, empresaId],
    enabled: pronto,
    queryFn: () => cargaService.sugerir(tenantId as string, empresaId as string),
    refetchInterval: 60_000,
  });

  const statusFiltro = FILTROS.find((f) => f.valor === filtro)?.status ?? null;
  const cargas = useQuery({
    queryKey: ["cargas", tenantId, empresaId, filtro],
    enabled: pronto,
    queryFn: () => cargaService.listar(tenantId as string, empresaId as string, statusFiltro),
    refetchInterval: 30_000,
  });

  const grupos = useMemo(() => agruparSugestao(sugestao.data?.ondas ?? []), [sugestao.data]);
  const ondasSel: OndaSugerida[] = useMemo(
    () => (sugestao.data?.ondas ?? []).filter((o) => selecionadas.has(o.movimento_saida_id)),
    [sugestao.data, selecionadas],
  );
  const totais = useMemo(() => ({
    peso: ondasSel.reduce((s, o) => s + Number(o.peso_total ?? 0), 0),
    m3: ondasSel.reduce((s, o) => s + Number(o.m3 ?? 0), 0),
    pedidos: ondasSel.reduce((s, o) => s + Number(o.documentos ?? 0), 0),
  }), [ondasSel]);

  // Veículo/box herdados das ondas: o backend recusa se divergirem; aqui só antecipamos o aviso.
  const veiculosOndas = [...new Set(ondasSel.map((o) => o.veiculo_id).filter(Boolean))] as string[];
  const boxesOndas = [...new Set(ondasSel.map((o) => o.box_id).filter(Boolean))] as string[];
  const veiculoEfetivo = form.veiculoId || veiculosOndas[0] || "";
  const veiculoSel = veiculos.find((v) => v.id === veiculoEfetivo);
  const divergente = veiculosOndas.length > 1 || boxesOndas.length > 1
    || (!!form.veiculoId && veiculosOndas.some((v) => v !== form.veiculoId))
    || (!!form.boxId && boxesOndas.some((b) => b !== form.boxId));

  const alternar = (id: string, marcado: boolean) => setSelecionadas((s) => {
    const n = new Set(s); if (marcado) n.add(id); else n.delete(id); return n;
  });

  const montar = useMutation({
    mutationFn: () => cargaService.montar({
      tenantId: tenantId as string, empresaId: empresaId as string, usuarioId: usuarioId as string,
      ondas: [...selecionadas], veiculoId: form.veiculoId || null, boxId: form.boxId || null, motorista: form.motorista,
    }),
    onSuccess: (r) => {
      toast.success(r.mensagem ?? "Carga montada.");
      for (const a of r.avisos ?? []) toast.warning(a.mensagem);
      setSelecionadas(new Set());
      setForm({ veiculoId: "", boxId: "", motorista: "" });
      void qc.invalidateQueries({ queryKey: ["carga-sugestao", tenantId, empresaId] });
      void qc.invalidateQueries({ queryKey: ["cargas", tenantId, empresaId] });
      if (r.dados?.id) setCargaAberta(r.dados.id);
    },
    onError: (e) => {
      const p = parseError(e, "montagem-carga");
      toast.error(p.title, { description: p.instruction || p.details });
      void qc.invalidateQueries({ queryKey: ["carga-sugestao", tenantId, empresaId] });
    },
  });

  if (!pronto) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Montagem de Carga</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Junte as ondas que aguardam embarque num veículo, defina a ordem dos pedidos e libere para o coletor.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void sugestao.refetch(); void cargas.refetch(); }}
          disabled={sugestao.isFetching || cargas.isFetching}>
          <RefreshCw size={14} className={sugestao.isFetching || cargas.isFetching ? "animate-spin" : ""} /> Atualizar
        </Button>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="montar">Montar carga{sugestao.data ? ` (${sugestao.data.ondas.length})` : ""}</TabsTrigger>
          <TabsTrigger value="cargas">Cargas</TabsTrigger>
        </TabsList>

        {/* ===== Montar ===== */}
        <TabsContent value="montar" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4 min-w-0">
              {sugestao.data && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Route size={13} aria-hidden="true" />
                  Sugestão agrupada por {sugestao.data.criterio === "ROTA" ? "rota" : sugestao.data.criterio === "PARCEIRO" ? "parceiro" : "veículo e box"}
                  {" "}(configurável em Fluxo de Expedição › Embarque).
                </p>
              )}
              {sugestao.isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : sugestao.isError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
                  {parseError(sugestao.error, "carga-sugestao").title}
                </div>
              ) : grupos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-10 flex flex-col items-center text-center gap-2">
                  <PackageCheck size={32} className="text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">Nenhuma onda aguardando embarque</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Aparecem aqui as ondas cujo tipo de saída realiza embarque e que já terminaram a conferência
                    (ou a separação, quando não há conferência).
                  </p>
                </div>
              ) : (
                grupos.map((g) => {
                  const todas = g.ondas.every((o) => selecionadas.has(o.movimento_saida_id));
                  return (
                    <div key={g.chave} className="rounded-lg border border-border bg-card">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{g.rotulo}</p>
                          <p className="text-xs text-muted-foreground">
                            {g.ondas.length} onda(s) · {g.documentos} pedido(s) · {formatarNumero(g.peso)} kg · {formatarNumero(g.m3, 2)} m³
                          </p>
                        </div>
                        <Button variant="outline" size="sm" disabled={!podeEditar}
                          onClick={() => g.ondas.forEach((o) => alternar(o.movimento_saida_id, !todas))}>
                          {todas ? "Desmarcar grupo" : "Selecionar grupo"}
                        </Button>
                      </div>
                      <ul className="divide-y divide-border">
                        {g.ondas.map((o) => (
                          <li key={o.movimento_saida_id}>
                            <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-secondary/30">
                              <Checkbox disabled={!podeEditar} checked={selecionadas.has(o.movimento_saida_id)}
                                onCheckedChange={(v) => alternar(o.movimento_saida_id, !!v)} aria-label={`Selecionar onda ${o.numero_onda}`} />
                              <span className="font-mono font-semibold text-sm w-16">#{o.numero_onda}</span>
                              <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate" title={o.parceiros ?? undefined}>
                                {o.parceiros ?? "—"}
                              </span>
                              <span className="hidden md:inline text-xs text-muted-foreground w-28 truncate">{o.tipo_saida ?? ""}</span>
                              <span className="text-xs text-muted-foreground w-20 text-right">{o.documentos} ped.</span>
                              <span className="text-xs font-mono text-muted-foreground w-24 text-right">{formatarNumero(o.peso_total)} kg</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>

            {/* Painel da nova carga */}
            <aside className="lg:sticky lg:top-4 h-fit rounded-lg border border-border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-primary" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Nova carga</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                {ondasSel.length === 0 ? "Selecione ondas na lista ao lado."
                  : `${ondasSel.length} onda(s) · ${totais.pedidos} pedido(s)`}
              </p>
              <div>
                <label htmlFor="nova-veiculo" className="block text-xs font-medium text-muted-foreground mb-1.5">Veículo</label>
                <select id="nova-veiculo" className={inputClass} value={form.veiculoId} disabled={!podeEditar}
                  onChange={(e) => setForm((f) => ({ ...f, veiculoId: e.target.value }))}>
                  <option value="">{veiculosOndas.length === 1 ? "Usar o veículo das ondas" : "Selecione…"}</option>
                  {veiculos.map((v) => <option key={v.id} value={v.id}>{v.descricao}{v.placa ? ` — ${v.placa}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="nova-box" className="block text-xs font-medium text-muted-foreground mb-1.5">Box / doca</label>
                <select id="nova-box" className={inputClass} value={form.boxId} disabled={!podeEditar}
                  onChange={(e) => setForm((f) => ({ ...f, boxId: e.target.value }))}>
                  <option value="">{boxesOndas.length === 1 ? "Usar o box das ondas" : "Sem box"}</option>
                  {boxes.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="nova-motorista" className="block text-xs font-medium text-muted-foreground mb-1.5">Motorista</label>
                <input id="nova-motorista" className={inputClass} value={form.motorista} maxLength={120} disabled={!podeEditar}
                  onChange={(e) => setForm((f) => ({ ...f, motorista: e.target.value }))} />
              </div>
              {ondasSel.length > 0 && (
                <CapacidadeVeiculo medidas={[
                  { rotulo: "Peso", usado: totais.peso, limite: veiculoSel?.peso_total, unidade: "kg" },
                  { rotulo: "Volume", usado: totais.m3, limite: veiculoSel?.m3, unidade: "m³", casas: 2 },
                ]} />
              )}
              {divergente && (
                <p className="text-xs text-yellow-400 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2" role="alert">
                  As ondas selecionadas indicam veículos ou boxes diferentes. Uma carga sai num veículo só.
                </p>
              )}
              <Button className="w-full" disabled={!podeEditar || ondasSel.length === 0 || divergente || montar.isPending}
                onClick={() => montar.mutate()}>
                {montar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Boxes size={14} />} Montar carga
              </Button>
              {!podeEditar && <p className="text-xs text-muted-foreground">Seu perfil só consulta cargas.</p>}
            </aside>
          </div>
        </TabsContent>

        {/* ===== Cargas ===== */}
        <TabsContent value="cargas" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar cargas por situação">
            {FILTROS.map((f) => (
              <button key={f.valor} type="button" onClick={() => setFiltro(f.valor)} aria-pressed={filtro === f.valor}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  filtro === f.valor ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {f.rotulo}
              </button>
            ))}
          </div>

          {cargas.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (cargas.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 flex flex-col items-center text-center gap-2">
              <Truck size={32} className="text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Nenhuma carga {FILTROS.find((f) => f.valor === filtro)?.rotulo.toLowerCase()}</p>
              <p className="text-xs text-muted-foreground">As cargas montadas na aba "Montar carga" aparecem aqui.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Carga</th>
                    <th className="text-left font-medium px-4 py-2.5">Situação</th>
                    <th className="text-left font-medium px-4 py-2.5">Veículo</th>
                    <th className="text-left font-medium px-4 py-2.5">Box</th>
                    <th className="text-right font-medium px-4 py-2.5">Ondas</th>
                    <th className="text-right font-medium px-4 py-2.5">Pedidos</th>
                    <th className="text-left font-medium px-4 py-2.5 w-44">Embarque</th>
                    <th className="text-left font-medium px-4 py-2.5">Criada em</th>
                    <th className="px-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(cargas.data ?? []).map((c) => {
                    const pct = c.unidades_total > 0 ? (c.unidades_embarcadas / c.unidades_total) * 100 : 0;
                    return (
                      <tr key={c.id} className="hover:bg-secondary/20 cursor-pointer" onClick={() => setCargaAberta(c.id)}>
                        <td className="px-4 py-2.5 font-mono font-semibold">#{c.numero_carga}</td>
                        <td className="px-4 py-2.5"><CargaStatusBadge status={c.status} /></td>
                        <td className="px-4 py-2.5 text-muted-foreground">{c.veiculo ? `${c.veiculo}${c.placa ? ` — ${c.placa}` : ""}` : "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{c.box ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">{c.ondas}</td>
                        <td className="px-4 py-2.5 text-right">{c.documentos}</td>
                        <td className="px-4 py-2.5">
                          {c.unidades_total > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-mono text-muted-foreground">{c.unidades_embarcadas}/{c.unidades_total}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">{c.status === "EM_MONTAGEM" ? "Não liberada" : "—"}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{dataHora(c.created_at)}</td>
                        <td className="px-2">
                          <button type="button" className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                            aria-label={`Abrir carga ${c.numero_carga} (${CARGA_STATUS_LABEL[c.status]})`}
                            onClick={(e) => { e.stopPropagation(); setCargaAberta(c.id); }}>
                            <ChevronRight size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CargaDetalheSheet
        cargaId={cargaAberta}
        onClose={() => setCargaAberta(null)}
        tenantId={tenantId as string}
        empresaId={empresaId as string}
        usuarioId={usuarioId ?? ""}
        podeEditar={podeEditar}
        veiculos={veiculos}
        boxes={boxes}
      />
    </div>
  );
}
