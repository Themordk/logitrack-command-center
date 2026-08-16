import { supabase } from "@/integrations/supabase/client";

export const ANEXO_BUCKET = "evidencias";
export const ANEXO_ACCEPT = "image/*,application/pdf,.xlsx,.docx";
export const ANEXO_MAX_BYTES = 10 * 1024 * 1024;

const MIME_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Retorna a mensagem de erro ou null quando o arquivo é válido. */
export function validarAnexo(file: File): string | null {
  if (file.size > ANEXO_MAX_BYTES) return `"${file.name}" excede o limite de 10 MB.`;
  if (!MIME_PERMITIDOS.includes(file.type)) {
    return `"${file.name}" tem formato não suportado (use imagem, PDF, XLSX ou DOCX).`;
  }
  return null;
}

export function formatBytes(bytes?: number | null): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImagem(tipo?: string | null): boolean {
  return !!tipo && tipo.startsWith("image/");
}

/** Bucket privado: sempre usar URL assinada. */
export async function anexoSignedUrl(storagePath: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(ANEXO_BUCKET).createSignedUrl(storagePath, expiresIn);
  return data?.signedUrl ?? null;
}

interface UploadArgs {
  file: File;
  tenantId: string;
  ocorrenciaId: string;
  usuarioId?: string | null;
  historicoId?: string | null;
  origem?: "ADMIN" | "COLETOR";
}

/**
 * Faz upload no bucket privado (path {tenant_id}/{ocorrencia_id}/...) e registra em ocorrencia_anexo.
 * Retorna { error } — nunca lança.
 */
export async function uploadAnexoOcorrencia({
  file, tenantId, ocorrenciaId, usuarioId, historicoId, origem = "ADMIN",
}: UploadArgs): Promise<{ error: string | null }> {
  try {
    const nomeSanitizado = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${tenantId}/${ocorrenciaId}/${Date.now()}_${nomeSanitizado}`;
    const { error: uploadError } = await supabase.storage
      .from(ANEXO_BUCKET)
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) return { error: uploadError.message };

    const { error: insertError } = await supabase.from("ocorrencia_anexo").insert({
      tenant_id: tenantId,
      ocorrencia_id: ocorrenciaId,
      ocorrencia_historico_id: historicoId ?? null,
      nome_arquivo: file.name,
      tipo_arquivo: file.type,
      tamanho_bytes: file.size,
      storage_path: storagePath,
      origem,
      created_by: usuarioId ?? null,
    });
    if (insertError) return { error: insertError.message };
    return { error: null };
  } catch (e: any) {
    return { error: e?.message || "Falha ao enviar anexo." };
  }
}

export async function abrirAnexo(storagePath: string) {
  const url = await anexoSignedUrl(storagePath);
  if (url) window.open(url, "_blank", "noopener");
  return url;
}
