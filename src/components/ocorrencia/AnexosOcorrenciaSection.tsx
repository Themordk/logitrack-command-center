import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Download, FileText, Image as ImageIcon, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import {
  ANEXO_ACCEPT, abrirAnexo, anexoSignedUrl, formatBytes, isImagem,
  uploadAnexoOcorrencia, validarAnexo,
} from "@/lib/ocorrenciaAnexos";

export interface AnexoRow {
  id: string;
  nome_arquivo: string;
  tipo_arquivo: string;
  tamanho_bytes: number;
  storage_path: string;
  origem: string;
  created_at: string;
  ocorrencia_historico_id?: string | null;
  usuario?: { nome?: string | null } | null;
}

interface Props {
  anexos: AnexoRow[];
  tenantId: string | null;
  ocorrenciaId: string;
  usuarioId: string | null;
  podeAnexar: boolean;
  evidenciaLegado?: string | null;
  onChanged: () => void | Promise<void>;
}

function AnexoCard({ anexo }: { anexo: AnexoRow }) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    if (isImagem(anexo.tipo_arquivo)) {
      anexoSignedUrl(anexo.storage_path).then((url) => { if (ativo) setThumb(url); });
    }
    return () => { ativo = false; };
  }, [anexo.storage_path, anexo.tipo_arquivo]);

  return (
    <div className="flex items-center gap-3 p-2 rounded-md border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors">
      {thumb ? (
        <img src={thumb} alt={anexo.nome_arquivo} className="h-12 w-12 rounded object-cover border border-border" />
      ) : isImagem(anexo.tipo_arquivo) ? (
        <div className="h-12 w-12 rounded border border-border flex items-center justify-center text-muted-foreground">
          <ImageIcon size={16} />
        </div>
      ) : (
        <div className="h-12 w-12 rounded border border-border flex items-center justify-center text-muted-foreground">
          <FileText size={16} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground truncate">{anexo.nome_arquivo}</p>
        <p className="text-[10px] text-muted-foreground">
          {formatBytes(anexo.tamanho_bytes)} · {formatDateTime(anexo.created_at)}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn(
            "px-1.5 py-0.5 rounded-full text-[9px] border",
            anexo.origem === "COLETOR"
              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
              : "bg-purple-500/15 text-purple-400 border-purple-500/30",
          )}>
            {anexo.origem === "COLETOR" ? "Coletor" : "Admin"}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">{anexo.usuario?.nome ?? "—"}</span>
        </div>
      </div>
      <button
        onClick={() => abrirAnexo(anexo.storage_path)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
        title="Baixar"
      >
        <Download size={14} />
      </button>
    </div>
  );
}

export function AnexosOcorrenciaSection({
  anexos, tenantId, ocorrenciaId, usuarioId, podeAnexar, evidenciaLegado, onChanged,
}: Props) {
  const [enviando, setEnviando] = useState(false);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !tenantId) return;

    const validos: File[] = [];
    files.forEach((f) => {
      const erro = validarAnexo(f);
      if (erro) toast.error(erro);
      else validos.push(f);
    });
    if (!validos.length) return;

    setEnviando(true);
    let ok = 0;
    for (const f of validos) {
      const { error } = await uploadAnexoOcorrencia({
        file: f, tenantId, ocorrenciaId, usuarioId, origem: "ADMIN",
      });
      if (error) toast.error(`Falha ao enviar "${f.name}".`);
      else ok++;
    }
    setEnviando(false);
    if (ok > 0) toast.success(ok === 1 ? "Anexo enviado." : `${ok} anexos enviados.`);
    await onChanged();
  };

  const vazio = anexos.length === 0 && !evidenciaLegado;

  return (
    <div className="card-surface p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Paperclip size={14} /> Anexos e Evidências
      </h3>

      {vazio ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo registrado.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {evidenciaLegado && (
            <div className="flex items-center gap-3 p-2 rounded-md border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors">
              <div className="h-12 w-12 rounded border border-border flex items-center justify-center text-muted-foreground">
                <ImageIcon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground truncate">Evidência anterior</p>
                <span className="px-1.5 py-0.5 rounded-full text-[9px] border bg-secondary/40 text-muted-foreground border-border">
                  Legado
                </span>
              </div>
              <a
                href={evidenciaLegado}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                <Download size={14} />
              </a>
            </div>
          )}
          {anexos.map((a) => <AnexoCard key={a.id} anexo={a} />)}
        </div>
      )}

      {podeAnexar && (
        <label className="mt-3 flex items-center justify-center gap-2 px-3 py-3 rounded-md border border-dashed border-border bg-secondary/30 text-xs text-muted-foreground cursor-pointer hover:border-primary hover:text-foreground transition-colors">
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {enviando ? "Enviando arquivos..." : "Anexar arquivo"}
          <input
            type="file"
            multiple
            accept={ANEXO_ACCEPT}
            className="hidden"
            disabled={enviando}
            onChange={handleFiles}
          />
        </label>
      )}
    </div>
  );
}

export function AnexoMiniCard({ anexo }: { anexo: AnexoRow }) {
  return (
    <button
      onClick={() => abrirAnexo(anexo.storage_path)}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/30 text-[11px] text-foreground hover:bg-secondary transition-colors max-w-full"
    >
      {isImagem(anexo.tipo_arquivo) ? <ImageIcon size={12} /> : <FileText size={12} />}
      <span className="truncate">{anexo.nome_arquivo}</span>
    </button>
  );
}
