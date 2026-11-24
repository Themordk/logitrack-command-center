/**
 * Módulo de Entregas — foto (canhoto/ocorrência) e posição do aparelho.
 *
 * A foto é reduzida no aparelho (lado maior 1600 px, JPEG 0,7 ≈ 200–400 KB) e enviada ao
 * bucket privado 'evidencias' ANTES da RPC; a RPC confere o caminho e se o arquivo existe.
 */
import { supabase } from "@/integrations/supabase/client";
import { ANEXO_BUCKET } from "@/lib/ocorrenciaAnexos";
import type { Posicao } from "@/lib/entregaService";

const LADO_MAX = 1600;
const QUALIDADE = 0.7;

/** Reduz e converte para JPEG. Se o navegador não conseguir, devolve o arquivo original. */
export async function comprimirFoto(arquivo: File | Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALIDADE));
    return blob ?? arquivo;
  } catch {
    return arquivo;
  }
}

/** Envia a foto já comprimida. Lança erro com mensagem amigável se o envio falhar. */
export async function enviarFoto(caminho: string, foto: Blob): Promise<void> {
  const { error } = await supabase.storage.from(ANEXO_BUCKET).upload(caminho, foto, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) {
    throw new Error(`Não foi possível enviar a foto (${error.message}). Verifique a conexão e tente de novo.`);
  }
}

/**
 * Posição atual, sem travar a operação: devolve null se o usuário negar, se não houver GPS
 * ou se demorar mais que o limite.
 */
export function obterPosicao(limiteMs = 6000): Promise<Posicao | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let resolvido = false;
    const fim = (p: Posicao | null) => { if (!resolvido) { resolvido = true; resolve(p); } };
    const timer = setTimeout(() => fim(null), limiteMs + 500);
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => { clearTimeout(timer); fim({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy }); },
        () => { clearTimeout(timer); fim(null); },
        { enableHighAccuracy: true, timeout: limiteMs, maximumAge: 60_000 },
      );
    } catch {
      clearTimeout(timer);
      fim(null);
    }
  });
}
