import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useOffline } from "@/contexts/OfflineContext";
import { Loader2, Database, Check, Lock, TrendingUp, Ban, CircleCheck, ChevronDown, ChevronUp, Info, WifiOff } from "lucide-react";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";
import { EtapaIndicador } from "@/components/coletor/EtapaIndicador";
import { ProdutoHeader } from "@/components/coletor/ProdutoHeader";
import { StickyFooter } from "@/components/coletor/StickyFooter";
import { QtdEmCaixa } from "@/components/coletor/QtdEmCaixa";
import { buscarDestinoArmazenagem } from "@/lib/armazenagemService";
import type { DestinoArmazenagem, PickingDestino } from "@/types/armazenagem";

interface Props { onNavigate: (path: string) => void; }

interface TarefaResult {
  tarefa_id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  qtd_conferida: number;
  qtd_armazenada: number;
  qtd_a_armazenar: number;
  validade: string | null;
  fabricacao: string | null;
  lote: string | null;
  varios_pickings: string | null;
  enderecos_picking: string | null;
  fator_caixa: number | null;
}

export function ArmazenagemIniciarPage({ onNavigate }: Props) {
  const { setFabVisivel } = useOcorrenciaColetorContext();
  useEffect(() => {
    setFabVisivel(false);
  }, [setFabVisivel]);
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const { isOnline, cacheData, getCachedData } = useOffline();
  const result = useResultDialog({ coletorMode: true });

  const preloadedTarefa = (() => {
    const tid = sessionStorage.getItem("coletor_armazenagem_tarefa_id");
    const pid = sessionStorage.getItem("coletor_armazenagem_produto_id");
    const desc = sessionStorage.getItem("coletor_armazenagem_produto_desc");
    if (!tid || !pid || !desc) return null;
    return {
      tarefa_id: tid,
      produto_id: pid,
      sku: sessionStorage.getItem("coletor_armazenagem_produto_sku") || "",
      descricao: desc,
      qtd_conferida: Number(sessionStorage.getItem("coletor_armazenagem_qtd_requerida") || "0"),
      qtd_armazenada: Number(sessionStorage.getItem("coletor_armazenagem_qtd_executada") || "0"),
      qtd_a_armazenar: Number(sessionStorage.getItem("coletor_armazenagem_qtd_restante") || "0"),
      validade: sessionStorage.getItem("coletor_armazenagem_validade") || null,
      fabricacao: sessionStorage.getItem("coletor_armazenagem_fabricacao") || null,
      lote: sessionStorage.getItem("coletor_armazenagem_lote") || null,
      varios_pickings: sessionStorage.getItem("coletor_armazenagem_varios_pickings") || null,
      enderecos_picking: sessionStorage.getItem("coletor_armazenagem_picking_sugerido") || null,
      fator_caixa: Number(sessionStorage.getItem("coletor_armazenagem_fator") || "1"),
    } as TarefaResult;
  })();

  const [lastScanned, setLastScanned] = useState("");
  const [loading, setLoading] = useState(false);
  const [tarefa, setTarefa] = useState<TarefaResult | null>(preloadedTarefa);
  const [isFromCache, setIsFromCache] = useState(false);
  const [eanConfirmado, setEanConfirmado] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const [destino, setDestino] = useState<DestinoArmazenagem | null>(null);
  const [destinoErro, setDestinoErro] = useState(false);
  const [loadingDestino, setLoadingDestino] = useState(false);
  const [escolha, setEscolha] = useState<"PICKING" | "PULMAO" | null>(null);
  const [pickingSelId, setPickingSelId] = useState<string | null>(null);
  const [verPickings, setVerPickings] = useState(false);

  const carregarDestino = useCallback(async (produtoId: string, tarefaId: string | null) => {
    setDestino(null);
    setDestinoErro(false);
    setEscolha(null);
    setPickingSelId(null);
    if (!navigator.onLine) { setDestinoErro(true); return; }
    setLoadingDestino(true);
    try {
      const d = await buscarDestinoArmazenagem({ produtoId, tarefaId });
      setDestino(d);
      const r = d.recomendacao;
      setEscolha(r.destino === "PICKING" || r.destino === "DIVIDIR" ? "PICKING" : "PULMAO");
      setPickingSelId(r.endereco_id || d.pickings[0]?.endereco_id || null);
    } catch {
      setDestinoErro(true);
    } finally {
      setLoadingDestino(false);
    }
  }, []);

  useEffect(() => {
    if (preloadedTarefa) carregarDestino(preloadedTarefa.produto_id, preloadedTarefa.tarefa_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscarTarefaOnline = async (code: string): Promise<TarefaResult> => {
    if (!tenantId || !empresaId) throw new Error("Tenant/empresa não identificados");

    if (code.startsWith("HU-") || code.startsWith("hu-")) {
      const { data: huResult, error: huErr } = await (supabase as any).rpc("buscar_hu_por_codigo", {
        p_tenant_id: tenantId,
        p_codigo_hu: code,
      });
      if (huErr) throw huErr;
      const hu = typeof huResult === "string" ? JSON.parse(huResult) : huResult;
      if (!hu?.encontrada) throw new Error("HU não encontrada: " + code);

      const { data: huItens, error: huItensErr } = await (supabase as any).rpc("listar_itens_hu", {
        p_tenant_id: tenantId,
        p_hu_id: hu.hu_id,
      });
      if (huItensErr) throw huItensErr;
      const itensResult = typeof huItens === "string" ? JSON.parse(huItens) : huItens;
      if (!itensResult?.itens || itensResult.itens.length === 0) throw new Error("HU " + code + " está vazia.");

      const firstItem = itensResult.itens[0];
      const { data: eanData } = await (supabase as any)
        .from("produto_embalagem")
        .select("ean")
        .eq("produto_id", firstItem.produto_id)
        .limit(1);
      if (!eanData || eanData.length === 0) throw new Error("Produto da HU sem EAN cadastrado.");

      sessionStorage.setItem("coletor_armazenagem_hu", hu.hu_id);
      sessionStorage.setItem("coletor_armazenagem_hu_codigo", hu.codigo_hu);

      const { data, error } = await supabase.rpc("fn_buscar_dados_armazenagem" as any, {
        p_tenant_id: tenantId,
        p_empresa_ids: [empresaId],
        p_ean: eanData[0].ean,
      });
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Nenhuma tarefa de armazenagem para o produto da HU");
      return data[0] as TarefaResult;
    }

    const { data, error } = await supabase.rpc("fn_buscar_dados_armazenagem" as any, {
      p_tenant_id: tenantId,
      p_empresa_ids: [empresaId],
      p_ean: code,
    });
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Nenhuma tarefa encontrada para este código");
    return data[0] as TarefaResult;
  };

  const handleScan = async (code: string) => {
    setLastScanned(code);

    // Se já tem tarefa pré-carregada do sessionStorage, o scan é OBRIGATÓRIO para conferência
    if (tarefa && preloadedTarefa) {
      setEanConfirmado(false);

      try {
        const cacheKey = `ean_emb_produto_${tarefa.produto_id}`;
        let embMap: { ean: string; fator: number }[] = [];

        if (!isOnline) {
          const cached = await getCachedData<{ ean: string; fator: number }[]>(cacheKey);
          if (cached) {
            embMap = cached;
          } else {
            // Offline sem cache: aceitar se o SKU bater (fallback mínimo, fator=1)
            if (code.trim().toUpperCase() === (tarefa.sku || "").trim().toUpperCase()) {
              setEanConfirmado(true);
              sessionStorage.setItem("coletor_armazenagem_fator", "1");
              setOverlay("success");
              setOverlayMsg(`Produto confirmado: ${tarefa.descricao}`);
              return;
            }
            result.showWarning("Não foi possível validar o EAN offline", {
              details: "Sem conexão e sem cache de EAN para este produto.",
              instruction: "Conecte-se à rede ou confira o SKU do produto manualmente.",
            });
            return;
          }
        } else {
          const { data: embData, error: embErr } = await (supabase as any)
            .from("produto_embalagem")
            .select("ean, fator")
            .eq("produto_id", tarefa.produto_id);

          if (embErr) throw embErr;

          embMap = (embData || []).map((e: any) => ({
            ean: String(e.ean).trim().toUpperCase(),
            fator: Number(e.fator) || 1,
          }));
          await cacheData(cacheKey, embMap, 480).catch(() => {});
        }

        const codeLimpo = code.trim().toUpperCase();
        const embEncontrada = embMap.find((e) => e.ean === codeLimpo);
        if (embEncontrada) {
          setEanConfirmado(true);
          // Gravar o fator ESPECÍFICO do EAN escaneado (não o fator_caixa genérico do produto)
          sessionStorage.setItem("coletor_armazenagem_fator", String(embEncontrada.fator));
          setOverlay("success");
          setOverlayMsg(`Produto confirmado: ${tarefa.descricao}`);
        } else {
          setEanConfirmado(false);
          result.showWarning("EAN não corresponde ao produto esperado", {
            details: `Código escaneado: ${code}\nProduto esperado: ${tarefa.sku} - ${tarefa.descricao}`,
            instruction: "Verifique se está com o produto correto em mãos e escaneie novamente.",
          });
        }
      } catch (err: any) {
        setEanConfirmado(false);
        result.showError(err, { context: "armazenagem-confirmar-ean" });
      }
      return;
    }

    setTarefa(null);
    setIsFromCache(false);
    if (!tenantId || !empresaId) return;

    setLoading(true);
    const cacheKey = `armazenagem_tarefa_${code}`;
    try {
      if (!isOnline) {
        const cached = await getCachedData<TarefaResult>(cacheKey);
        if (!cached) {
          result.showWarning("Sem dados em cache", {
            details: "Sem conexão e sem dados em cache para este código.",
            instruction: "Conecte-se à rede ou escaneie um produto que já foi consultado online.",
          });
          return;
        }
        setTarefa(cached);
        setIsFromCache(true);
        carregarDestino(cached.produto_id, cached.tarefa_id);
        setOverlay("success");
        setOverlayMsg(`Produto encontrado (cache): ${cached.descricao}`);
        return;
      }

      const row = await buscarTarefaOnline(code);
      setTarefa(row);
      carregarDestino(row.produto_id, row.tarefa_id);
      await cacheData(cacheKey, row, 30).catch(() => {});
      setOverlay("success");
      setOverlayMsg(code.toUpperCase().startsWith("HU-") ? `HU ${code} → ${row.descricao}` : `Produto encontrado: ${row.descricao}`);
    } catch (err: any) {
      result.showError(err, { context: "armazenagem-iniciar" });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!tarefa) return;
    sessionStorage.setItem("coletor_armazenagem_tarefa_id", tarefa.tarefa_id);
    sessionStorage.setItem("coletor_armazenagem_produto_id", tarefa.produto_id);
    sessionStorage.setItem("coletor_armazenagem_produto_desc", tarefa.descricao);
    sessionStorage.setItem("coletor_armazenagem_produto_sku", tarefa.sku || "");
    sessionStorage.setItem("coletor_armazenagem_qtd_restante", String(tarefa.qtd_a_armazenar));
    sessionStorage.setItem("coletor_armazenagem_lote", tarefa.lote || "");
    sessionStorage.setItem("coletor_armazenagem_validade", tarefa.validade || "");
    sessionStorage.setItem("coletor_armazenagem_fabricacao", tarefa.fabricacao || "");
    sessionStorage.setItem("coletor_armazenagem_picking_sugerido", tarefa.enderecos_picking || "");
    sessionStorage.setItem("coletor_armazenagem_varios_pickings", tarefa.varios_pickings || "N");
    // Só grava o fator do state quando NÃO é fluxo pré-carregado.
    // No fluxo pré-carregado, o handleScan já gravou o fator correto
    // do EAN específico escaneado — não devemos sobrescrevê-lo aqui.
    if (!preloadedTarefa) {
      sessionStorage.setItem("coletor_armazenagem_fator", String(tarefa.fator_caixa || 1));
    }
    if (!sessionStorage.getItem("coletor_armazenagem_hu")) {
      sessionStorage.removeItem("coletor_armazenagem_hu_codigo");
    }
    const pk = escolha === "PICKING"
      ? (destino?.pickings.find((p) => p.endereco_id === pickingSelId) || destino?.pickings[0] || null)
      : null;
    const recom = destino?.recomendacao;
    const qtdSugerida = escolha === "PICKING" && recom?.destino === "DIVIDIR"
      ? recom.quantidade_picking
      : (destino?.quantidade ?? tarefa.qtd_a_armazenar);
    sessionStorage.setItem("coletor_armazenagem_destino_tipo", escolha || "PULMAO");
    sessionStorage.setItem("coletor_armazenagem_destino_endereco_id", pk?.endereco_id || "");
    sessionStorage.setItem("coletor_armazenagem_destino_endereco_desc", pk?.endereco || "");
    sessionStorage.setItem("coletor_armazenagem_qtd_sugerida", String(qtdSugerida || 0));
    sessionStorage.setItem("coletor_armazenagem_recomendacao_destino", recom?.destino || "");
    sessionStorage.setItem("coletor_armazenagem_recomendacao_endereco_id", recom?.endereco_id || "");
    onNavigate("/coletor/armazenagem/execucao");
  };

  const travado = !!preloadedTarefa && !eanConfirmado;
  const fatorCaixa = Number(destino?.produto.fator_caixa || tarefa?.fator_caixa || 1);
  const pickings = destino?.pickings ?? [];
  const pickingAtual = pickings.find((p) => p.endereco_id === pickingSelId) || pickings[0] || null;
  const rec = destino?.recomendacao;
  const dataValida = (d: string | null | undefined) => !!d && !d.startsWith("1900-01-01");

  const statusPicking = (p: PickingDestino) => {
    if (!["LIVRE", "OCUPADO"].includes(p.situacao)) return { Icon: Lock, cor: "text-[hsl(213,31%,55%)]", txt: "bloqueado" };
    if (p.status === "ACIMA_MAXIMO") return { Icon: TrendingUp, cor: "text-[#ef5350]", txt: "acima do máximo" };
    if (p.status === "CHEIO") return { Icon: Ban, cor: "text-[#ef5350]", txt: "cheio" };
    if (p.status === "SEM_LIMITE") return { Icon: CircleCheck, cor: "text-[#22C55E]", txt: "sem máximo" };
    return { Icon: CircleCheck, cor: "text-[#22C55E]", txt: `cabe +${p.cabe ?? 0}` };
  };

  const opcaoCls = (sel: boolean) =>
    `relative min-h-[76px] rounded-[10px] border-[1.5px] p-2 text-left flex flex-col gap-0.5 ${
      sel ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/12" : "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]"
    }`;

  const ocorrenciaCtx = tarefa
    ? { etapa: "ARMAZENAGEM" as const, produto_id: tarefa.produto_id, produto_descricao: tarefa.descricao, tarefa_id: tarefa.tarefa_id }
    : undefined;

  return (
    <ColetorLayout title="Conferir produto" onNavigate={onNavigate} showBack backPath="/coletor/armazenagem/itens">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />
      <ResultDialog {...result.dialogProps} />
      <EtapaIndicador etapa={2} />

      <div className="flex flex-col gap-2 -mt-1">
        {tarefa && (
          <ProdutoHeader
            sku={tarefa.sku}
            descricao={tarefa.descricao}
            restante={tarefa.qtd_a_armazenar}
            fatorCaixa={fatorCaixa}
            linhas={2}
            onOcorrencia={ocorrenciaCtx as never}
          />
        )}

        <ScanField
          compact
          confirmado={eanConfirmado || (!preloadedTarefa && !!tarefa)}
          label={eanConfirmado ? "Produto conferido" : preloadedTarefa ? "Bipe o EAN do produto" : "Bipe o EAN ou HU"}
          lastScanned={lastScanned}
          onScan={handleScan}
        />

        {loading && (
          <div className="flex justify-center py-2"><Loader2 size={22} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
        )}

        {tarefa && !loading && (
          <>
            {(tarefa.lote || dataValida(tarefa.fabricacao) || dataValida(tarefa.validade) || isFromCache) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[hsl(213,31%,55%)]">
                {tarefa.lote && <span>Lote: <b className="text-[hsl(213,31%,85%)]">{tarefa.lote}</b></span>}
                {dataValida(tarefa.fabricacao) && <span>Fab: <b className="text-[hsl(213,31%,85%)]">{tarefa.fabricacao}</b></span>}
                {dataValida(tarefa.validade) && <span>Val: <b className="text-[hsl(213,31%,85%)]">{tarefa.validade}</b></span>}
                {isFromCache && (
                  <span className="flex items-center gap-1 text-[10px] text-yellow-400"><Database size={10} /> Cache</span>
                )}
              </div>
            )}

            <span className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(213,31%,55%)]">Para onde vai</span>

            <div className={travado ? "opacity-35 pointer-events-none" : ""} aria-disabled={travado}>
              {loadingDestino && !destino ? (
                <div className="flex items-center gap-2 text-[12px] text-[hsl(213,31%,55%)] py-3">
                  <Loader2 size={14} className="animate-spin" /> Carregando destino…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={opcaoCls(escolha === "PICKING")} onClick={() => setEscolha("PICKING")} aria-pressed={escolha === "PICKING"}>
                    {escolha === "PICKING" && <Check size={14} className="absolute top-1.5 right-1.5 text-[hsl(217,91%,65%)]" />}
                    <span className="text-[10px] uppercase font-semibold text-[hsl(213,31%,65%)]">Picking</span>
                    {destinoErro ? (
                      <span className="text-[11px] text-[hsl(213,31%,55%)]">Bipe o endereço</span>
                    ) : pickingAtual ? (
                      <>
                        <QtdEmCaixa qtd={Number(pickingAtual.saldo)} fatorCaixa={fatorCaixa} size="md" align="left" />
                        <span className="text-[10px] text-[hsl(213,31%,55%)]">
                          {pickingAtual.est_maximo == null ? "sem máximo" : `mín ${pickingAtual.est_minimo} · máx ${pickingAtual.est_maximo}`}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[hsl(280,70%,65%)] truncate">{pickingAtual.endereco}</span>
                        {(() => { const s = statusPicking(pickingAtual); return (
                          <span className={`flex items-center gap-1 text-[11px] font-semibold ${s.cor}`}><s.Icon size={12} /> {s.txt}</span>
                        ); })()}
                      </>
                    ) : (
                      <span className="text-[11px] text-[hsl(45,93%,55%)]">Sem picking cadastrado</span>
                    )}
                  </button>

                  <button type="button" className={opcaoCls(escolha === "PULMAO")} onClick={() => setEscolha("PULMAO")} aria-pressed={escolha === "PULMAO"}>
                    {escolha === "PULMAO" && <Check size={14} className="absolute top-1.5 right-1.5 text-[hsl(217,91%,65%)]" />}
                    <span className="text-[10px] uppercase font-semibold text-[hsl(213,31%,65%)]">Pulmão</span>
                    {destino && !destinoErro ? (
                      <>
                        <QtdEmCaixa qtd={Number(destino.pulmao.saldo)} fatorCaixa={fatorCaixa} size="md" align="left" />
                        <span className="text-[10px] text-[hsl(213,31%,55%)]">em {destino.pulmao.enderecos} endereço(s)</span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#22C55E]"><CircleCheck size={12} /> disponível</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-[hsl(213,31%,55%)]">Bipe o endereço</span>
                    )}
                  </button>
                </div>
              )}

              {pickings.length > 1 && (
                <div className="mt-1">
                  <button type="button" onClick={() => setVerPickings((v) => !v)} className="min-h-[32px] flex items-center gap-1 text-[12px] font-semibold text-[hsl(217,91%,65%)]">
                    {verPickings ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Ver {pickings.length} pickings
                  </button>
                  {verPickings && (
                    <div className="flex flex-col gap-1">
                      {pickings.map((p) => {
                        const s = statusPicking(p);
                        const sel = pickingAtual?.endereco_id === p.endereco_id;
                        return (
                          <button
                            key={p.endereco_id}
                            type="button"
                            onClick={() => { setPickingSelId(p.endereco_id); setEscolha("PICKING"); setVerPickings(false); }}
                            className={`min-h-[40px] rounded-lg border px-2 flex items-center justify-between gap-2 text-[11px] ${sel ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/12" : "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]"}`}
                          >
                            <span className="font-mono font-bold text-[hsl(280,70%,65%)]">{p.endereco}</span>
                            <span className="text-white">{p.saldo}</span>
                            <span className="text-[hsl(213,31%,55%)]">{p.est_maximo == null ? "s/ máx" : `${p.est_minimo}/${p.est_maximo}`}</span>
                            <span className={`flex items-center gap-1 ${s.cor}`}><s.Icon size={11} /> {s.txt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {travado && (
                <p className="text-[11px] text-center text-[hsl(213,31%,70%)] mt-1">Bipe o produto para liberar o destino</p>
              )}
            </div>

            {destinoErro ? (
              <div className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/35 text-[hsl(45,93%,80%)]">
                <WifiOff size={13} className="shrink-0" /> Sem conexão: escolha o destino
              </div>
            ) : rec && !travado ? (
              <div className="flex items-start gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] bg-[hsl(217,91%,50%)]/12 border border-[hsl(217,91%,60%)]/35 text-[hsl(213,31%,85%)]">
                <Info size={13} className="shrink-0 mt-0.5 text-[hsl(217,91%,65%)]" />
                <span>
                  {rec.motivo}
                  {rec.destino === "DIVIDIR" && ` Picking recebe ${rec.quantidade_picking}; ${rec.quantidade_pulmao} vão para o pulmão.`}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {tarefa && !loading && (
        <StickyFooter>
          <ActionButton onClick={handleConfirm} variant="primary" disabled={travado || !escolha}>
            {escolha === "PICKING" ? "SEGUIR PARA O PICKING" : escolha === "PULMAO" ? "SEGUIR PARA O PULMÃO" : "ESCOLHA O DESTINO"}
          </ActionButton>
        </StickyFooter>
      )}
    </ColetorLayout>
  );
}
