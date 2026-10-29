import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TvShell } from "./TvShell";
import { TvTokenGate, useTvToken } from "./TvTokenGate";
import {
  type LimiteIndicador,
  type NivelAlerta,
  type OperacionalData,
  decidirAlertaSonoro,
  formatDuracao,
  iniciais,
  intervaloAtualizacaoMs,
  isErroToken,
  nivelAlerta,
  nomeExibicao,
  type MelhorSeparador,
} from "./painelTvOperacional.utils";
import { audioLiberado, liberarAudio, tocarCarrilhao } from "./tvAlertaSonoro";

const REFRESH_MS = intervaloAtualizacaoMs();
/** Dados mais velhos que isso são tratados como desatualizados (5 leituras perdidas, mínimo 15 s). */
const STALE_MS = Math.max(15_000, REFRESH_MS * 5);
/** Intervalo mínimo entre dois sons, para um lote de pedidos não gerar vários alertas. */
const INTERVALO_MIN_SOM_MS = 20_000;
/** Tempo que a etiqueta "+N NOVOS" fica visível no cartão. */
const DESTAQUE_NOVOS_MS = 10_000;
const SOM_STORAGE_KEY = "core_tv_som";

const CORES = {
  fundoCard: "#0d1420",
  bordaCard: "#1a2540",
  numero: "#F8FAFC",
  rotulo: "#CBD5E1",
  apagado: "#64748B",
  atencao: "#FFC400",
  critico: "#FF3B30",
  fundoCritico: "#3A0D0D",
  aoVivo: "#22C55E",
} as const;

const ETAPA = {
  aguardando: "#F59E0B",
  separacao: "#3B82F6",
  conferencia: "#A855F7",
  destaque: "#FFC400",
  tempo: "#64748B",
  cortes: "#EF4444",
  expedidos: "#06B6D4",
} as const;

function lerSomPreferido(): boolean {
  try {
    return localStorage.getItem(SOM_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function salvarSomPreferido(ligado: boolean) {
  try {
    localStorage.setItem(SOM_STORAGE_KEY, ligado ? "1" : "0");
  } catch {
    /* sem storage: mantém só em memória */
  }
}

/** Mantém a tela da TV acesa enquanto a página estiver visível. */
function useWakeLock() {
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let ativo = true;
    const pedir = async () => {
      try {
        if (document.visibilityState === "visible" && ativo) lock = await nav.wakeLock!.request("screen");
      } catch {
        /* navegador recusou: segue sem wake lock */
      }
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      ativo = false;
      document.removeEventListener("visibilitychange", pedir);
      lock?.release().catch(() => undefined);
    };
  }, []);
}

/** Tamanho do número: ~20% da altura, limitado pela largura do cartão conforme a quantidade de caracteres. */
function tamanhoNumero(texto: string): string {
  const chars = Math.max(1, texto.length);
  const porLargura = 20.5 / (chars * 0.6);
  return `min(20vh, ${porLargura.toFixed(2)}vw)`;
}

const ESTILOS_GLOBAIS = `
@keyframes tvPulsoCritico {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,59,48,0.0); }
  50% { box-shadow: 0 0 0 0.6vh rgba(255,59,48,0.55); }
}
@keyframes tvPiscaNovos {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.tv-card-critico { animation: tvPulsoCritico 2s ease-in-out infinite; }
.tv-novos { animation: tvPiscaNovos 1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .tv-card-critico, .tv-novos { animation: none; }
}
`;

interface CardProps {
  rotulo: string;
  /** Linha curta abaixo do rótulo explicando o que o número mede. */
  subrotulo?: string;
  valor: string;
  nivel?: NivelAlerta;
  corEtapa: string;
  desatualizado?: boolean;
  detalhe?: React.ReactNode;
  destaque?: React.ReactNode;
  testId?: string;
}

function CardIndicador({ rotulo, subrotulo, valor, nivel = "normal", corEtapa, desatualizado, detalhe, destaque, testId }: CardProps) {
  const corValor = desatualizado
    ? CORES.apagado
    : nivel === "critico"
      ? CORES.critico
      : nivel === "atencao"
        ? CORES.atencao
        : CORES.numero;
  const borda = desatualizado
    ? `1px solid ${CORES.bordaCard}`
    : nivel === "critico"
      ? `0.4vh solid ${CORES.critico}`
      : nivel === "atencao"
        ? `0.4vh solid ${CORES.atencao}`
        : `1px solid ${CORES.bordaCard}`;

  return (
    <div
      data-testid={testId}
      data-nivel={nivel}
      className={nivel === "critico" && !desatualizado ? "tv-card-critico" : undefined}
      style={{
        position: "relative",
        background: nivel === "critico" && !desatualizado ? CORES.fundoCritico : CORES.fundoCard,
        border: borda,
        borderRadius: "1.4vh",
        padding: "2vh 1.4vw 1.6vh",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.7vh", background: corEtapa }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.8vw" }}>
        <div
          style={{
            fontSize: "2.6vh",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: CORES.rotulo,
          }}
        >
          {rotulo}
        </div>
        {nivel !== "normal" && !desatualizado && (
          <div
            style={{
              flexShrink: 0,
              fontSize: "1.9vh",
              fontWeight: 800,
              letterSpacing: "0.08em",
              padding: "0.4vh 0.7vw",
              borderRadius: "0.6vh",
              background: nivel === "critico" ? CORES.critico : CORES.atencao,
              color: nivel === "critico" ? "#FFFFFF" : "#1A1200",
            }}
          >
            {nivel === "critico" ? "CRÍTICO" : "ATENÇÃO"}
          </div>
        )}
      </div>
      {subrotulo && (
        <div style={{ fontSize: "2.1vh", fontWeight: 500, color: CORES.apagado, marginTop: "0.4vh" }}>{subrotulo}</div>
      )}
      {destaque}
      <div
        data-testid={testId ? `${testId}-valor` : undefined}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontFamily: "Inter, -apple-system, sans-serif",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 800,
          fontSize: tamanhoNumero(valor),
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: corValor,
          whiteSpace: "nowrap",
        }}
      >
        {valor}
      </div>
      <div style={{ minHeight: "3.2vh", fontSize: "2.6vh", fontWeight: 600, color: CORES.rotulo, textAlign: "right" }}>
        {detalhe}
      </div>
    </div>
  );
}

function CardMelhorSeparador({
  separador,
  desatualizado,
}: {
  separador: MelhorSeparador | null;
  desatualizado: boolean;
}) {
  const cor = desatualizado ? CORES.apagado : CORES.atencao;
  return (
    <div
      data-testid="card-melhor-separador"
      style={{
        position: "relative",
        background: CORES.fundoCard,
        border: `1px solid ${CORES.bordaCard}`,
        borderRadius: "1.4vh",
        padding: "2vh 1.4vw 1.6vh",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.7vh", background: ETAPA.destaque }} />
      <div
        style={{
          fontSize: "2.6vh",
          lineHeight: 1.15,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: CORES.rotulo,
        }}
      >
        Melhor separador
      </div>
      <div style={{ fontSize: "2.1vh", fontWeight: 500, color: CORES.apagado, marginTop: "0.4vh" }}>
        mais separações concluídas hoje
      </div>

      {separador ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.8vh",
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              data-testid="tv-avatar"
              style={{
                width: "min(12vh, 8vw)",
                height: "min(12vh, 8vw)",
                borderRadius: "50%",
                border: `0.6vh solid ${cor}`,
                background: "linear-gradient(135deg, #1D4ED8, #7C3AED)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "min(5vh, 3.2vw)",
                fontWeight: 800,
                letterSpacing: "0.02em",
                opacity: desatualizado ? 0.5 : 1,
              }}
            >
              {iniciais(separador.nome)}
            </div>
            <div
              aria-hidden
              style={{ position: "absolute", top: "-1.8vh", right: "-2vh", fontSize: "4.4vh", lineHeight: 1 }}
            >
              🏆
            </div>
          </div>
          <div
            data-testid="tv-melhor-nome"
            style={{
              maxWidth: "100%",
              fontSize: "3.8vh",
              fontWeight: 800,
              color: desatualizado ? CORES.apagado : CORES.numero,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textTransform: "capitalize",
            }}
          >
            {nomeExibicao(separador.nome)}
          </div>
          <div
            data-testid="tv-melhor-placar"
            style={{ fontSize: "2.8vh", fontWeight: 700, color: cor, fontVariantNumeric: "tabular-nums" }}
          >
            {separador.tarefas} {separador.tarefas === 1 ? "tarefa" : "tarefas"} ·{" "}
            {Number(separador.unidades).toLocaleString("pt-BR")} un
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: "2.8vh",
            fontWeight: 600,
            color: CORES.apagado,
          }}
        >
          Aguardando a primeira separação do dia
        </div>
      )}
    </div>
  );
}

function corNivel(nivel: NivelAlerta, desatualizado: boolean): string {
  if (desatualizado) return CORES.apagado;
  if (nivel === "critico") return CORES.critico;
  if (nivel === "atencao") return CORES.atencao;
  return CORES.rotulo;
}

const minParaSeg = (l?: LimiteIndicador): LimiteIndicador | undefined =>
  l ? { atencao: l.atencao * 60, critico: l.critico * 60 } : undefined;

export function PainelTvOperacional() {
  const [token, setToken] = useTvToken();
  const [agora, setAgora] = useState(() => Date.now());
  const [somLigado, setSomLigado] = useState(lerSomPreferido);
  const [audioOk, setAudioOk] = useState(() => audioLiberado());
  const [novos, setNovos] = useState<{ qtd: number; ate: number } | null>(null);

  const idsAnteriores = useRef<string[] | null>(null);
  const dataRefAnterior = useRef<string | null>(null);
  const ultimoSom = useRef<number | null>(null);

  useWakeLock();

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const query = useQuery({
    queryKey: ["tv-op", token],
    enabled: !!token,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: (falhas, erro) => !isErroToken(erro) && falhas < 1,
    retryDelay: 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_painel_tv_operacional" as never, {
        p_tv_token: token,
      } as never);
      if (error) throw error;
      return data as unknown as OperacionalData;
    },
  });

  const data = query.data;

  // Alerta sonoro: compara os IDs aguardando separação com a leitura anterior.
  useEffect(() => {
    if (!data) return;
    const atuais = data.aguardando_ids ?? [];
    if (dataRefAnterior.current !== data.data_ref) {
      // primeira leitura ou virada do dia: só estabelece a base
      dataRefAnterior.current = data.data_ref;
      idsAnteriores.current = atuais;
      return;
    }
    const agoraMs = Date.now();
    const decisao = decidirAlertaSonoro({
      anteriores: idsAnteriores.current,
      atuais,
      agoraMs,
      ultimoSomMs: ultimoSom.current,
      intervaloMinimoMs: INTERVALO_MIN_SOM_MS,
    });
    idsAnteriores.current = atuais;
    if (decisao.novos > 0) {
      setNovos((prev) => ({
        qtd: (prev && prev.ate > agoraMs ? prev.qtd : 0) + decisao.novos,
        ate: agoraMs + DESTAQUE_NOVOS_MS,
      }));
    }
    if (decisao.tocar && somLigado) {
      if (tocarCarrilhao()) ultimoSom.current = agoraMs;
      else setAudioOk(false);
    }
  }, [data, somLigado]);

  const ativarSom = useCallback(async () => {
    const ok = await liberarAudio();
    setAudioOk(ok);
    setSomLigado(true);
    salvarSomPreferido(true);
  }, []);

  const alternarSom = useCallback(async () => {
    if (!somLigado) {
      await ativarSom();
      return;
    }
    setSomLigado(false);
    salvarSomPreferido(false);
  }, [somLigado, ativarSom]);

  // Qualquer clique/tecla na TV também libera o áudio.
  useEffect(() => {
    if (audioOk) return;
    const liberar = () => {
      liberarAudio().then(setAudioOk);
    };
    window.addEventListener("pointerdown", liberar);
    window.addEventListener("keydown", liberar);
    return () => {
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
    };
  }, [audioOk]);

  const desatualizado = !!data && (query.isError || agora - query.dataUpdatedAt > STALE_MS);

  const header = useMemo(() => {
    if (!data) return null;
    const c = data.contadores;
    const total = c.aguardando_separacao + c.em_separacao + c.aguardando_conferencia + c.pronto_embarque;
    return { total };
  }, [data]);

  if (!token) {
    return <TvTokenGate onSubmit={(t) => setToken(t)} />;
  }

  if (query.isError && (isErroToken(query.error) || !data)) {
    return (
      <TvTokenGate
        onSubmit={(t) => setToken(t)}
        errorMessage={
          isErroToken(query.error)
            ? "Token inválido ou armazém indisponível."
            : "Não foi possível carregar o painel. Verifique a conexão."
        }
      />
    );
  }

  const c = data?.contadores;
  const t = data?.tempos;
  const cortes = data?.cortes;
  const lim = data?.limites ?? {};

  const aguardando = c?.aguardando_separacao ?? 0;
  const esperaMax = t?.espera_max_atual_seg ?? 0;
  const nivelEsperaMax = nivelAlerta(esperaMax, minParaSeg(lim.espera_max_atual_min));
  const novosVisiveis = novos && novos.ate > agora ? novos.qtd : 0;
  const horaDados = data ? new Date(data.gerado_em).toLocaleTimeString("pt-BR", { hour12: false }) : "";

  const headerExtra = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          data-testid="tv-status"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: desatualizado ? CORES.apagado : CORES.aoVivo,
            }}
          />
          <span style={{ color: desatualizado ? CORES.apagado : CORES.aoVivo }}>
            {desatualizado ? "SEM CONEXÃO" : "AO VIVO"}
          </span>
        </span>
        <button
          type="button"
          onClick={alternarSom}
          data-testid="tv-som"
          aria-label={somLigado && audioOk ? "Desligar som do painel" : "Ligar som do painel"}
          title={somLigado && audioOk ? "Som ligado" : "Som desligado"}
          style={{
            background: "transparent",
            border: `1px solid ${CORES.bordaCard}`,
            borderRadius: 8,
            color: somLigado && audioOk ? CORES.numero : CORES.apagado,
            fontSize: 13,
            fontWeight: 700,
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          {somLigado && audioOk ? "🔔 SOM" : "🔕 MUDO"}
        </button>
      </div>
      {header && (
        <div style={{ fontSize: 14, color: CORES.rotulo, fontWeight: 600 }} data-testid="tv-total">
          Total em operação: <span style={{ color: CORES.numero, fontWeight: 800, fontSize: 18 }}>{header.total}</span>
        </div>
      )}
    </div>
  );

  return (
    <TvShell
      title="Painel operacional"
      empresa={data?.empresa}
      armazem={data?.armazem}
      empresaLogo={data?.empresa_logo ?? null}
      headerExtra={headerExtra}
      fullHeight
    >
      <style>{ESTILOS_GLOBAIS}</style>

      {desatualizado && (
        <div
          data-testid="tv-banner-desatualizado"
          style={{
            marginBottom: "1.4vh",
            padding: "1vh 1.4vw",
            borderRadius: "1vh",
            background: "#1E293B",
            border: `1px solid ${CORES.apagado}`,
            color: CORES.numero,
            fontSize: "2.4vh",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          SEM CONEXÃO — exibindo dados de {horaDados}
        </div>
      )}

      {somLigado && !audioOk && (
        <button
          type="button"
          onClick={ativarSom}
          data-testid="tv-ativar-som"
          style={{
            marginBottom: "1.4vh",
            padding: "1vh 1.4vw",
            borderRadius: "1vh",
            background: "#1D4ED8",
            border: "none",
            color: "#FFFFFF",
            fontSize: "2.2vh",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          🔔 Clique para ativar o som do painel (alerta de novos pedidos)
        </button>
      )}

      <div
        data-testid="tv-grade"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
          gap: "1.6vh",
          flex: 1,
          minHeight: 0,
        }}
      >
        <CardIndicador
          testId="card-aguardando"
          rotulo="Aguardando separação"
          valor={String(aguardando)}
          nivel={nivelAlerta(aguardando, lim.aguardando_separacao)}
          corEtapa={ETAPA.aguardando}
          desatualizado={desatualizado}
          destaque={
            novosVisiveis > 0 && !desatualizado ? (
              <div
                className="tv-novos"
                data-testid="tv-novos"
                style={{
                  alignSelf: "flex-start",
                  marginTop: "1vh",
                  fontSize: "2.4vh",
                  fontWeight: 800,
                  padding: "0.3vh 0.8vw",
                  borderRadius: "0.6vh",
                  background: "#1D4ED8",
                  color: "#FFFFFF",
                }}
              >
                +{novosVisiveis} {novosVisiveis === 1 ? "NOVO" : "NOVOS"}
              </div>
            ) : null
          }
          detalhe={
            aguardando > 0 ? (
              <span data-testid="tv-maior-espera" style={{ color: corNivel(nivelEsperaMax, desatualizado) }}>
                Maior espera: {formatDuracao(esperaMax)}
              </span>
            ) : null
          }
        />
        <CardIndicador
          testId="card-em-separacao"
          rotulo="Em separação"
          valor={String(c?.em_separacao ?? 0)}
          corEtapa={ETAPA.separacao}
          desatualizado={desatualizado}
        />
        <CardIndicador
          testId="card-aguardando-conferencia"
          rotulo="Aguardando conferência"
          valor={String(c?.aguardando_conferencia ?? 0)}
          nivel={nivelAlerta(c?.aguardando_conferencia ?? 0, lim.aguardando_conferencia)}
          corEtapa={ETAPA.conferencia}
          desatualizado={desatualizado}
        />
        <CardIndicador
          testId="card-expedidos"
          rotulo="Expedidos hoje"
          subrotulo="pedidos concluídos"
          valor={String(c?.expedidos_hoje ?? 0)}
          corEtapa={ETAPA.expedidos}
          desatualizado={desatualizado}
        />

        <CardIndicador
          testId="card-espera-media"
          rotulo="Tempo médio de espera"
          valor={formatDuracao(t?.espera_media_seg ?? 0)}
          nivel={nivelAlerta(t?.espera_media_seg ?? 0, minParaSeg(lim.espera_media_min))}
          corEtapa={ETAPA.tempo}
          desatualizado={desatualizado}
          subrotulo="da liberação ao início da separação"
        />
        <CardIndicador
          testId="card-separacao-media"
          rotulo="Tempo médio de separação"
          valor={formatDuracao(t?.separacao_media_seg ?? 0)}
          nivel={nivelAlerta(t?.separacao_media_seg ?? 0, minParaSeg(lim.separacao_media_min))}
          corEtapa={ETAPA.tempo}
          desatualizado={desatualizado}
          subrotulo="por pedido, do início ao fim"
          detalhe={`base: ${t?.separacao_base_pedidos ?? 0} ${
            (t?.separacao_base_pedidos ?? 0) === 1 ? "pedido" : "pedidos"
          }`}
        />
        <CardIndicador
          testId="card-cortes"
          rotulo="Cortes na operação"
          valor={String(cortes?.linhas ?? 0)}
          nivel={nivelAlerta(cortes?.linhas ?? 0, lim.cortes_linhas)}
          corEtapa={ETAPA.cortes}
          desatualizado={desatualizado}
          subrotulo="itens cortados hoje (auditar)"
          detalhe={`${Number(cortes?.unidades ?? 0).toLocaleString("pt-BR")} un em ${cortes?.pedidos ?? 0} ${
            (cortes?.pedidos ?? 0) === 1 ? "pedido" : "pedidos"
          }`}
        />
        <CardMelhorSeparador separador={data?.melhor_separador ?? null} desatualizado={desatualizado} />
      </div>
    </TvShell>
  );
}
