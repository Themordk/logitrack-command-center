import { useCallback, useEffect, useState } from "react";

/**
 * Hook de preview térmico via API pública Labelary.
 * Recebe ZPL + dimensões e devolve a URL de um PNG renderizado
 * exatamente como sairia na impressora térmica.
 */

export interface UseLabelaryPreviewParams {
  zpl: string;
  larguraMm: number;
  alturaMm: number;
  dados?: Record<string, string | number | null | undefined>;
  /** Densidade em dpmm. Padrão 8 (equivale a 203 DPI). */
  dpmm?: 6 | 8 | 12 | 24;
  /** Índice da etiqueta quando o ZPL tem múltiplas. Padrão 0. */
  indice?: number;
  /** Se false, não dispara chamada. Padrão true. */
  enabled?: boolean;
}

export interface UseLabelaryPreviewResult {
  url: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Cache in-memory: chave -> objectURL. Some ao recarregar a página. */
const previewCache = new Map<string, string>();

/** Hash DJB2 simples — evita dependência externa. */
function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36) + "_" + input.length.toString(36);
}

/** Substitui {{chave}} pelos valores; sobras viram "---". */
export function aplicarPlaceholders(
  zpl: string,
  dados: Record<string, string | number | null | undefined> = {},
): string {
  let out = zpl;
  for (const [chave, valor] of Object.entries(dados)) {
    const v = valor === null || valor === undefined ? "" : String(valor);
    out = out.split(`{{${chave}}}`).join(v);
  }
  return out.replace(/\{\{[^}]+\}\}/g, "---");
}

/** Libera todos os objectURLs em cache (uso opcional). */
export function limparCacheLabelary() {
  previewCache.forEach((url) => URL.revokeObjectURL(url));
  previewCache.clear();
}

export function useLabelaryPreview({
  zpl,
  larguraMm,
  alturaMm,
  dados,
  dpmm = 8,
  indice = 0,
  enabled = true,
}: UseLabelaryPreviewParams): UseLabelaryPreviewResult {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const dadosKey = JSON.stringify(dados ?? {});

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled || !zpl || !zpl.trim()) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    const larg = larguraMm > 0 ? larguraMm : 100;
    const alt = alturaMm > 0 ? alturaMm : 40;
    const zplFinal = aplicarPlaceholders(zpl, dados);
    const cacheKey = hashKey(`${dpmm}|${larg}|${alt}|${indice}|${dadosKey}|${zplFinal}`);

    const cached = previewCache.get(cacheKey);
    if (cached) {
      setUrl(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);

      const largPol = (larg / 25.4).toFixed(2);
      const altPol = (alt / 25.4).toFixed(2);
      const path = `v1/printers/${dpmm}dpmm/labels/${largPol}x${altPol}/${indice}/`;
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: zplFinal,
        signal: controller.signal,
      };

      try {
        let response: Response;
        try {
          response = await fetch(`https://api.labelary.com/${path}`, init);
        } catch (e) {
          if (controller.signal.aborted) return;
          response = await fetch(`http://api.labelary.com/${path}`, init);
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          if (cancelled) return;
          setError(errText.trim() || `Labelary retornou ${response.status}`);
          setUrl(null);
          setLoading(false);
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        previewCache.set(cacheKey, objectUrl);
        setUrl(objectUrl);
        setError(null);
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled || controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Erro ao gerar preview";
        setError(msg);
        setUrl(null);
        setLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [zpl, larguraMm, alturaMm, dadosKey, dpmm, indice, enabled, tick]);

  return { url, loading, error, refetch };
}
