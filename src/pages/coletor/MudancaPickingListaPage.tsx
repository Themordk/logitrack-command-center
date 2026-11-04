import { useEffect, useMemo, useState } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ActionButton } from "@/components/coletor/ActionButton";
import { QtdEmCaixa } from "@/components/coletor/QtdEmCaixa";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Ban, CheckCircle2, Package } from "lucide-react";
import {
  type Decisao,
  type PreviewProduto,
  lerDecisoes,
  lerPreview,
  salvarDecisoes,
} from "@/modules/coletor/mudanca-picking/mudancaPicking.service";

interface Props { onNavigate: (path: string) => void; }

const fmtData = (iso: string | null) =>
  iso && iso !== "1900-01-01" ? iso.split("-").reverse().join("/") : null;

function decisaoValida(d: Decisao | undefined): boolean {
  if (!d) return false;
  if (d.acao === "SOMENTE_ESTOQUE") return true;
  if (d.acao === "MIGRAR_PICKING_EXISTENTE") return !!d.picking_produto_id;
  return (
    d.est_minimo >= 0 && d.est_maximo > 0 && d.est_maximo >= d.est_minimo
  );
}

export function MudancaPickingListaPage({ onNavigate }: Props) {
  const offlineBlocked = useOnlineOnlyBlocked();
  const preview = useMemo(() => lerPreview(), []);
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>(() => lerDecisoes());
  const [confirmarMigracao, setConfirmarMigracao] = useState(false);

  useEffect(() => {
    if (!preview) onNavigate("/coletor/movimentos/mudanca-picking/origem");
  }, [preview, onNavigate]);

  if (!preview) return null;

  const { itens, produtos, totais, bloqueios, pendencias } = preview;

  const setDecisao = (produtoId: string, d: Decisao) => {
    const next = { ...decisoes, [produtoId]: d };
    setDecisoes(next);
    salvarDecisoes(next);
  };

  const pendentesDecisao = produtos.filter(
    (p) => p.requer_decisao && !decisaoValida(decisoes[p.produto_id]),
  );

  const decisoesMigrar = Object.values(decisoes).filter(
    (d) => d.acao === "MIGRAR_PICKING_EXISTENTE",
  );

  const migrarDetalhes = decisoesMigrar.map((d) => {
    const prod = produtos.find((p) => p.produto_id === d.produto_id);
    const outro = prod?.outros_pickings.find(
      (o) => d.acao === "MIGRAR_PICKING_EXISTENTE" && o.picking_produto_id === d.picking_produto_id,
    );
    return { sku: prod?.sku || "—", endereco: outro?.endereco_descricao || "—" };
  });

  const botaoDesabilitado =
    !preview.pode_prosseguir || pendentesDecisao.length > 0 || offlineBlocked;

  const handleConfirm = () => {
    if (decisoesMigrar.length > 0) {
      setConfirmarMigracao(true);
    } else {
      onNavigate("/coletor/movimentos/mudanca-picking/destino");
    }
  };

  const renderProduto = (p: PreviewProduto) => {
    const base = "rounded-xl p-3 flex flex-col gap-2 border";
    if (p.situacao === "MAPEADO_ORIGEM") {
      return (
        <div key={p.produto_id} className={`${base} bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-mono text-[hsl(217,91%,60%)]">{p.sku}</p>
              <p className="text-xs text-white truncate">{p.descricao}</p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/30">
              <CheckCircle2 size={11} /> Picking será transferido
            </span>
          </div>
          {p.mapeamentos_origem.map((m) => (
            <p key={m.picking_produto_id} className="text-[11px] text-[hsl(213,31%,75%)]">
              {m.tipo_picking} · Mín {m.est_minimo} · Máx {m.est_maximo}
            </p>
          ))}
          {p.saldo_total === 0 && (
            <p className="text-[10px] text-[hsl(213,31%,55%)]">Sem saldo — só o mapeamento será transferido.</p>
          )}
        </div>
      );
    }

    if (p.situacao === "SEM_MAPEAMENTO_NAO_PERMITIDO") {
      return (
        <div key={p.produto_id} className={`${base} bg-[hsl(222,40%,12%)] border-red-500/50`}>
          <div className="flex items-start gap-2">
            <Ban size={16} className="text-red-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-mono text-[hsl(217,91%,60%)]">{p.sku}</p>
              <p className="text-xs text-white truncate">{p.descricao}</p>
              <p className="text-[11px] text-red-300 mt-1">
                Produto com saldo neste endereço, sem mapeamento de picking, e não permite vários pickings.
                Regularize o cadastro (Mapear Picking) antes da mudança.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // DECIDIR_MIGRAR_OU_MANTER | DECIDIR_CRIAR_OU_MANTER
    const decisao = decisoes[p.produto_id];
    const migrar = p.situacao === "DECIDIR_MIGRAR_OU_MANTER";
    const opcaoCls = (ativo: boolean) =>
      `w-full min-h-[52px] rounded-xl border p-3 text-left text-xs font-semibold transition-colors ${
        ativo
          ? "border-[hsl(280,80%,60%)] bg-[hsl(280,80%,60%)]/15 text-white"
          : "border-[hsl(222,35%,22%)] bg-[hsl(222,35%,16%)] text-[hsl(213,31%,75%)]"
      }`;

    return (
      <div key={p.produto_id} className={`${base} bg-[hsl(222,40%,12%)] border-amber-500/50`}>
        <div className="min-w-0">
          <p className="text-xs font-mono text-[hsl(217,91%,60%)]">{p.sku}</p>
          <p className="text-xs text-white truncate">{p.descricao}</p>
          <p className="text-[11px] text-amber-300 mt-1">
            {migrar
              ? "Este produto já possui picking em outro endereço:"
              : "Este produto não possui picking cadastrado."}
          </p>
        </div>

        {migrar && (
          <div className="flex flex-col gap-1">
            {p.outros_pickings.map((o) => (
              <p key={o.picking_produto_id} className="text-[11px] text-[hsl(213,31%,75%)]">
                {o.endereco_descricao} · {o.tipo_picking} · Mín {o.est_minimo} · Máx {o.est_maximo}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {migrar &&
            p.outros_pickings.map((o) => (
              <button
                key={o.picking_produto_id}
                type="button"
                className={opcaoCls(
                  decisao?.acao === "MIGRAR_PICKING_EXISTENTE" &&
                    decisao.picking_produto_id === o.picking_produto_id,
                )}
                onClick={() =>
                  setDecisao(p.produto_id, {
                    produto_id: p.produto_id,
                    acao: "MIGRAR_PICKING_EXISTENTE",
                    picking_produto_id: o.picking_produto_id,
                  })
                }
              >
                Migrar o picking para o novo endereço
                {p.outros_pickings.length > 1 && (
                  <span className="block text-[10px] font-normal opacity-80 mt-0.5">
                    {o.endereco_descricao} · {o.tipo_picking}
                  </span>
                )}
              </button>
            ))}

          {!migrar && (
            <button
              type="button"
              className={opcaoCls(decisao?.acao === "CRIAR_PICKING")}
              onClick={() =>
                setDecisao(p.produto_id, {
                  produto_id: p.produto_id,
                  acao: "CRIAR_PICKING",
                  tipo_picking: "FRACIONADO",
                  est_minimo: 0,
                  est_maximo: 0,
                })
              }
            >
              Criar picking no novo endereço
            </button>
          )}

          {decisao?.acao === "CRIAR_PICKING" && (
            <CriarPickingForm decisao={decisao} onChange={(d) => setDecisao(p.produto_id, d)} />
          )}

          <button
            type="button"
            className={opcaoCls(decisao?.acao === "SOMENTE_ESTOQUE")}
            onClick={() =>
              setDecisao(p.produto_id, { produto_id: p.produto_id, acao: "SOMENTE_ESTOQUE" })
            }
          >
            {migrar ? "Manter o picking atual e mover só o estoque" : "Mover só o estoque"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <ColetorLayout title="Mudança de Picking - Itens" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/mudanca-picking/origem">
      <OnlineOnlyNotice flow="Mudança de Picking" />

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 2 de 3</span>
        <p className="text-sm font-bold text-white">Conferir itens e picking</p>
        <p className="text-xs text-[hsl(213,31%,55%)] mt-1">
          Origem: <span className="text-white font-mono">{preview.origem.descricao}</span>
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] text-[hsl(213,31%,55%)]">
            {totais.qtd_itens} {totais.qtd_itens === 1 ? "item" : "itens"} · Total:{" "}
            <span className="text-white font-bold">{totais.qtd_total} UN</span>
            {(() => {
              const primeiroFator = itens[0]?.fator_caixa;
              const todosMesmoFator = itens.length > 0 && itens.every((i) => i.fator_caixa === primeiroFator);
              const fc = Number(primeiroFator || 0);
              if (todosMesmoFator && fc > 1) {
                const cx = Math.floor(totais.qtd_total / fc);
                const resto = totais.qtd_total % fc;
                return (
                  <span className="text-[hsl(217,91%,70%)] ml-1">
                    (= {cx} CX{resto > 0 ? ` + ${resto} UN` : ""})
                  </span>
                );
              }
              return null;
            })()}
          </span>
          {totais.qtd_bloqueada > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Bloqueado: {totais.qtd_bloqueada} UN
            </span>
          )}
        </div>
      </div>

      {bloqueios.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 mb-2 flex flex-col gap-1">
          {bloqueios.map((b, i) => (
            <p key={i} className="text-xs text-red-300 flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {b}
            </p>
          ))}
          {pendencias.slice(0, 5).map((pd) => (
            <p key={pd.tarefa_id} className="text-[11px] text-red-300/80 pl-5">
              {pd.tipo_tarefa} · {pd.status} · {pd.endereco}
            </p>
          ))}
          {pendencias.length > 5 && (
            <p className="text-[11px] text-red-300/80 pl-5">+{pendencias.length - 5}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 max-h-[calc(100vh-340px)] overflow-y-auto pb-2">
        <p className="text-[11px] font-semibold text-[hsl(213,31%,55%)] uppercase tracking-wide px-1">
          Saldo a transferir
        </p>
        {itens.length === 0 ? (
          <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-4 text-center">
            <p className="text-xs text-[hsl(213,31%,75%)]">
              Sem saldo no endereço — apenas o mapeamento de picking será transferido.
            </p>
          </div>
        ) : (
          itens.map((it) => (
            <div key={it.estoque_id} className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Package size={18} className="text-[hsl(280,80%,60%)] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-[hsl(217,91%,60%)]">{it.sku}</p>
                    <p className="text-xs text-white truncate">{it.descricao}</p>
                  </div>
                </div>
                <div className="shrink-0"><QtdEmCaixa qtd={it.quantidade_total} fatorCaixa={it.fator_caixa} size="md" /></div>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {it.lote && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[hsl(222,35%,16%)] text-[hsl(213,31%,75%)]">
                    Lote: <span className="text-white">{it.lote}</span>
                  </span>
                )}
                {fmtData(it.data_validade) && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[hsl(222,35%,16%)] text-[hsl(213,31%,75%)]">
                    Val: <span className="text-white">{fmtData(it.data_validade)}</span>
                  </span>
                )}
                {it.quantidade_bloqueada > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Bloq: {it.quantidade_bloqueada}
                  </span>
                )}
              </div>
              {it.quantidade_bloqueada > 0 && (
                <p className="text-[10px] text-[hsl(213,31%,55%)] mt-1">
                  O saldo bloqueado continuará bloqueado no destino.
                </p>
              )}
            </div>
          ))
        )}

        {produtos.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-[hsl(213,31%,55%)] uppercase tracking-wide px-1 mt-1">
              Picking
            </p>
            {produtos.map(renderProduto)}
          </>
        )}
      </div>

      <ActionButton onClick={handleConfirm} disabled={botaoDesabilitado}>
        Confirmar Mudança
      </ActionButton>

      <AlertDialog open={confirmarMigracao} onOpenChange={setConfirmarMigracao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Migrar picking?</AlertDialogTitle>
            <AlertDialogDescription>
              O picking do(s) SKU(s) {migrarDetalhes.map((m) => m.sku).join(", ")} sairá de{" "}
              {migrarDetalhes.map((m) => m.endereco).join(", ")} e passará para o novo endereço.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onNavigate("/coletor/movimentos/mudanca-picking/destino")}
            >
              Sim, migrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ColetorLayout>
  );
}

function CriarPickingForm({
  decisao,
  onChange,
}: {
  decisao: Extract<Decisao, { acao: "CRIAR_PICKING" }>;
  onChange: (d: Decisao) => void;
}) {
  const tipos = ["MASTER", "FRACIONADO", "PDV"] as const;
  const erroMin = decisao.est_minimo < 0 ? "Mínimo deve ser ≥ 0." : null;
  const erroMax =
    decisao.est_maximo <= 0
      ? "Máximo deve ser > 0."
      : decisao.est_maximo < decisao.est_minimo
        ? "Máximo deve ser ≥ mínimo."
        : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-[hsl(222,35%,16%)] p-2">
      <div className="grid grid-cols-3 gap-1">
        {tipos.map((t) => (
          <button
            key={t}
            type="button"
            className={`h-10 rounded-lg text-[11px] font-bold border ${
              decisao.tipo_picking === t
                ? "border-[hsl(280,80%,60%)] bg-[hsl(280,80%,60%)]/20 text-white"
                : "border-[hsl(222,35%,22%)] text-[hsl(213,31%,75%)]"
            }`}
            onClick={() => onChange({ ...decisao, tipo_picking: t })}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-[hsl(213,31%,55%)]">Estoque mínimo</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={decisao.est_minimo}
            onChange={(e) => onChange({ ...decisao, est_minimo: Number(e.target.value) })}
            className="h-12 rounded-lg bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] px-3 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-[hsl(213,31%,55%)]">Estoque máximo</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={decisao.est_maximo}
            onChange={(e) => onChange({ ...decisao, est_maximo: Number(e.target.value) })}
            className="h-12 rounded-lg bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] px-3 text-sm text-white"
          />
        </label>
      </div>
      {(erroMin || erroMax) && (
        <p className="text-[11px] text-red-300">{erroMin || erroMax}</p>
      )}
    </div>
  );
}
