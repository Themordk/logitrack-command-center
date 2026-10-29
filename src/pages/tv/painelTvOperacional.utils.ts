export type NivelAlerta = "normal" | "atencao" | "critico";

export interface LimiteIndicador {
  atencao: number;
  critico: number;
}

export type LimitesPainel = Partial<
  Record<
    | "aguardando_separacao"
    | "espera_max_atual_min"
    | "espera_media_min"
    | "separacao_media_min"
    | "aguardando_conferencia"
    | "pronto_embarque"
    | "cortes_linhas",
    LimiteIndicador
  >
>;

export interface OperacionalData {
  armazem: string;
  empresa: string;
  empresa_logo?: string | null;
  gerado_em: string;
  data_ref: string;
  contadores: {
    aguardando_separacao: number;
    em_separacao: number;
    aguardando_conferencia: number;
    pronto_embarque: number;
    expedidos_hoje: number;
  };
  aguardando_ids: string[];
  tempos: {
    espera_media_seg: number;
    espera_max_atual_seg: number;
    separacao_media_seg: number;
    separacao_base_pedidos: number;
  };
  cortes: {
    linhas: number;
    unidades: number;
    pedidos: number;
  };
  limites: LimitesPainel;
}

/** Nível do indicador conforme os limites do armazém (valores >= limite disparam). */
export function nivelAlerta(valor: number, limite?: LimiteIndicador | null): NivelAlerta {
  if (!limite || !Number.isFinite(valor)) return "normal";
  if (limite.critico != null && valor >= limite.critico) return "critico";
  if (limite.atencao != null && valor >= limite.atencao) return "atencao";
  return "normal";
}

/** Tempo em segundos -> "mm:ss" abaixo de 1 h, "h:mm:ss" acima. */
export function formatDuracao(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** IDs presentes em `atuais` que não estavam em `anteriores`. */
export function idsNovos(anteriores: readonly string[] | null, atuais: readonly string[]): string[] {
  if (!anteriores) return [];
  const base = new Set(anteriores);
  return atuais.filter((id) => !base.has(id));
}

export interface DecisaoAlerta {
  tocar: boolean;
  novos: number;
}

/**
 * Decide se o carrilhão toca nesta leitura.
 * - primeira leitura (anteriores = null) só estabelece a base;
 * - toca uma vez por leitura com IDs novos, respeitando o intervalo mínimo entre sons.
 */
export function decidirAlertaSonoro(params: {
  anteriores: readonly string[] | null;
  atuais: readonly string[];
  agoraMs: number;
  ultimoSomMs: number | null;
  intervaloMinimoMs: number;
}): DecisaoAlerta {
  const novos = idsNovos(params.anteriores, params.atuais).length;
  if (novos === 0) return { tocar: false, novos };
  const liberado =
    params.ultimoSomMs == null || params.agoraMs - params.ultimoSomMs >= params.intervaloMinimoMs;
  return { tocar: liberado, novos };
}

/** Lê um parâmetro da query string que fica depois do "#" (rotas por hash). */
export function lerParametroHash(nome: string, hash: string = window.location.hash): string | null {
  const limpo = hash.replace(/^#/, "");
  const idx = limpo.indexOf("?");
  if (idx === -1) return null;
  return new URLSearchParams(limpo.slice(idx + 1)).get(nome);
}

/** Intervalo de atualização em ms (padrão 3 s; `?refresh=N` em segundos, entre 1 e 60). */
export function intervaloAtualizacaoMs(hash?: string): number {
  const bruto = Number(lerParametroHash("refresh", hash));
  if (Number.isFinite(bruto) && bruto >= 1 && bruto <= 60) return Math.round(bruto * 1000);
  return 3000;
}

/** Erro de token (não de rede): só nesse caso a TV volta para a tela de token. */
export function isErroToken(erro: unknown): boolean {
  const msg = (erro as { message?: string } | null)?.message ?? "";
  return /token de tv/i.test(msg);
}
