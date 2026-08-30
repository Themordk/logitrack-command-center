import { useEffect } from "react";
import { X } from "lucide-react";
import { useFeedback } from "@/hooks/useFeedback";

export interface CancelamentoOverlayProps {
  titulo: string;
  mensagem: string;
  detalhes: {
    numeroNota: string;
    motivo: string;
    origem: string;
    infoAdicional?: { label: string; valor: string };
  };
  textoBotao?: string;
  redirectPath: string;
  onNavigate: (path: string) => void;
}

export function CancelamentoOverlay({
  titulo,
  mensagem,
  detalhes,
  textoBotao = "ENTENDIDO",
  redirectPath,
  onNavigate,
}: CancelamentoOverlayProps) {
  const { error } = useFeedback();

  useEffect(() => {
    error();
  }, [error]);

  const linhas: { label: string; valor: string }[] = [
    { label: "Motivo", valor: detalhes.motivo },
    { label: "Origem", valor: detalhes.origem },
    ...(detalhes.infoAdicional
      ? [{ label: detalhes.infoAdicional.label, valor: detalhes.infoAdicional.valor }]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-4 px-6"
      style={{ backgroundColor: "rgba(15, 17, 23, 0.92)" }}
      role="alertdialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: "rgba(239, 83, 80, 0.12)",
          border: "1px solid rgba(239, 83, 80, 0.35)",
        }}
      >
        <X size={32} color="#ef5350" strokeWidth={3} />
      </div>

      <h2 className="text-[18px] font-bold text-white text-center">{titulo}</h2>

      <p className="text-[13px] text-center" style={{ color: "#7a8899", maxWidth: 260 }}>
        {detalhes.numeroNota
          ? mensagem.split(detalhes.numeroNota).flatMap((parte, i) =>
              i === 0
                ? [parte]
                : [
                    <b key={`nf-${i}`} className="text-white font-mono">
                      {detalhes.numeroNota}
                    </b>,
                    parte,
                  ],
            )
          : mensagem}
      </p>

      <div
        className="w-full"
        style={{
          maxWidth: 280,
          backgroundColor: "#1a1e2a",
          border: "1px solid #2a3346",
          borderRadius: 6,
          padding: "10px 14px",
        }}
      >
        {linhas.map((l) => (
          <div key={l.label} className="flex items-start justify-between gap-3 py-1">
            <span className="text-[12px]" style={{ color: "#7a8899" }}>
              {l.label}
            </span>
            <span className="text-[12px] font-mono text-right" style={{ color: "#e8ecf2" }}>
              {l.valor}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => onNavigate(redirectPath)}
        className="w-full font-bold uppercase text-white"
        style={{
          maxWidth: 280,
          minHeight: 48,
          backgroundColor: "#ef5350",
          borderRadius: 8,
        }}
      >
        {textoBotao}
      </button>
    </div>
  );
}
