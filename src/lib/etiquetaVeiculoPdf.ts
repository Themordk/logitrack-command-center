/**
 * Fluxo de Expedição · F6.4 — etiqueta de identificação do veículo (100 x 60 mm).
 * Traz só o QR com o código aleatório (sem o código escrito, para o operador não decorar nem digitar),
 * além de descrição, placa e tipo. O embarque no coletor lê o QR para confirmar o veículo da carga.
 */
import jsPDF from "jspdf";
import qrcode from "qrcode-generator";
import { toast } from "sonner";

export interface EtiquetaVeiculo {
  codigo_identificacao: string;
  descricao: string;
  placa: string | null;
  tipo_veiculo: string | null;
  empresa?: string | null;
}

function desenharQr(doc: jsPDF, valor: string, x: number, y: number, tamanho: number) {
  const qr = qrcode(0, "M");
  qr.addData(valor);
  qr.make();
  const n = qr.getModuleCount();
  const cel = tamanho / n;
  doc.setFillColor(0, 0, 0);
  for (let l = 0; l < n; l++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(l, c)) doc.rect(x + c * cel, y + l * cel, cel + 0.02, cel + 0.02, "F");
    }
  }
}

export function gerarEtiquetaVeiculoPdf(veiculos: EtiquetaVeiculo[]): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [60, 100] });
  veiculos.forEach((v, i) => {
    if (i > 0) doc.addPage([60, 100], "landscape");
    doc.setDrawColor(0); doc.setLineWidth(0.4);
    doc.rect(2, 2, 96, 56);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);
    doc.text((v.empresa ?? "CORE LogiTrack").slice(0, 40), 5, 7);
    doc.setFontSize(8);
    doc.text("VEÍCULO", 5, 13);
    doc.setFontSize(13);
    doc.text(doc.splitTextToSize(v.descricao, 52).slice(0, 2), 5, 19);
    doc.setFontSize(8);
    doc.text("PLACA", 5, 33);
    doc.setFont("courier", "bold");
    doc.setFontSize(20);
    doc.text((v.placa ?? "-").toUpperCase(), 5, 41);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (v.tipo_veiculo) doc.text(`Tipo: ${v.tipo_veiculo}`, 5, 48);
    doc.setFontSize(6.5);
    doc.text("Bipe este QR no coletor para iniciar o embarque.", 5, 55);
    desenharQr(doc, v.codigo_identificacao, 60, 12, 35);
  });
  return doc;
}

/** Abre a etiqueta para impressão; se o navegador bloquear a janela, baixa o PDF. */
export function imprimirEtiquetaVeiculo(veiculos: EtiquetaVeiculo[], janela?: Window | null) {
  const doc = gerarEtiquetaVeiculoPdf(veiculos);
  doc.autoPrint();
  const url = doc.output("bloburl") as unknown as string;
  const win = janela && !janela.closed ? janela : window.open(url, "_blank");
  if (win && win === janela) win.location.href = url;
  if (!win) {
    doc.save(`etiqueta_veiculo_${veiculos[0]?.placa ?? "veiculo"}.pdf`);
    toast.info("Pop-up bloqueado — a etiqueta foi baixada para impressão.");
  }
}
