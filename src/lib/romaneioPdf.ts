/**
 * Fluxo de Expedição · F6 — Romaneio de carga (A4 retrato) para assinatura.
 * Segue o padrão de PDF dos relatórios (jsPDF + autoTable, janela reservada no clique).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import type { Romaneio } from "@/lib/cargaService";
import { CARGA_STATUS_LABEL, MODALIDADE_LABEL, UNIDADE_EMBARQUE_LABEL, formatarNumero } from "@/lib/cargaExibicao";

const dataHora = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

export function gerarRomaneioPdf(r: Romaneio): jsPDF {
  const c = r.carga;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();

  // Cabeçalho
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text(r.empresa.razaosocial ?? "CORE LogiTrack", 14, 15);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  if (r.empresa.cnpj) doc.text(`CNPJ ${r.empresa.cnpj}`, 14, 20);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text(`ROMANEIO DE CARGA #${c.numero_carga}`, larg - 14, 15, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Situação: ${CARGA_STATUS_LABEL[c.status]}  -  Emitido em ${dataHora(r.emitido_em)}`, larg - 14, 20, { align: "right" });

  // Bloco da carga
  const terceiro = c.modalidade === "TERCEIRO";
  const transporte: [string, string][] = terceiro
    ? [
        ["Transporte", MODALIDADE_LABEL.TERCEIRO],
        ["Transportadora", c.transportadora
          ? `${c.transportadora.razaosocial}${c.transportadora.cnpj ? ` - CNPJ ${c.transportadora.cnpj}` : ""}` : "-"],
        ["Placa", c.placa ?? "-"],
      ]
    : [
        ["Transporte", MODALIDADE_LABEL.PROPRIA],
        ["Veículo", c.veiculo ? `${c.veiculo.descricao}${c.veiculo.placa ? ` - ${c.veiculo.placa}` : ""}` : "-"],
      ];
  const linhas: [string, string][] = [
    ...transporte,
    ["Motorista", [c.motorista, c.motorista_documento ? `doc. ${c.motorista_documento}` : null].filter(Boolean).join(" - ") || "-"],
    ["Box / doca", c.box?.descricao ?? "—"],
    ["Unidade de embarque", c.unidade_embarque ? UNIDADE_EMBARQUE_LABEL[c.unidade_embarque] : "—"],
    ["Liberada em", dataHora(c.liberada_em)],
    ["Carregada em", dataHora(c.fechada_em)],
    ["Peso total (kg)", formatarNumero(c.peso_total, 2)],
    ["Volume (m3)", formatarNumero(c.m3_total, 3)],
    ["Volumes", String(r.volumes_total ?? c.volumes_total)],
    ["HUs (paletes)", String(c.pallets_total)],
    ["Montado por", c.montada_por_nome ?? "-"],
  ];
  autoTable(doc, {
    startY: 25,
    body: linhas,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 1.2, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 } },
    margin: { left: 14, right: 14 },
  });

  // Pedidos na ordem de embarque
  const yTabela = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  autoTable(doc, {
    startY: yTabela,
    head: [["Ordem", "Pedido", "NF-e", "Cliente", "Cidade/UF", "Onda", "Volumes", "Valor (R$)"]],
    body: c.documentos.map((d) => [
      String(d.sequencia),
      d.numero_pedido != null ? String(d.numero_pedido) : "—",
      d.nfe ?? "-",
      d.parceiro ?? "—",
      [d.cidade, d.uf].filter(Boolean).join("/") || "—",
      String(d.numero_onda),
      d.volumes != null ? `${d.volumes}${d.volumes_origem === "NFE" ? "*" : ""}` : "-",
      formatarNumero(d.valor_pedido, 2),
    ]),
    foot: [[
      "", `${c.documentos.length} pedido(s)`, "", "", "", "", String(r.volumes_total ?? ""),
      formatarNumero(c.documentos.reduce((s, d) => s + Number(d.valor_pedido ?? 0), 0), 2),
    ]],
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak", textColor: [30, 41, 59] },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { halign: "center", cellWidth: 12 }, 5: { halign: "center" }, 6: { halign: "center" }, 7: { halign: "right" } },
    margin: { left: 14, right: 14, bottom: 40 },
  });

  // Notas sobre a origem dos volumes
  let yNota = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  const notas: string[] = [];
  if (c.documentos.some((d) => d.volumes_origem === "NFE")) notas.push("* Volumes informados na NF-e (sem volume de expedição gerado na conferência).");
  for (const o of r.volumes_ondas ?? []) {
    notas.push(`Onda ${o.numero_onda}: ${o.volumes} volume(s) de expedição gerados para a onda inteira (vários pedidos), incluídos no total.`);
  }
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  for (const n of notas) { doc.text(n, 14, yNota); yNota += 4; }

  // Assinaturas (sempre na última página, com espaço garantido)
  let y = Math.max((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22, yNota + 14);
  if (y > alt - 30) { doc.addPage(); y = 40; }
  const colunas = [
    { x: 14, titulo: "Responsável pela expedição" },
    { x: larg / 2 + 4, titulo: "Motorista (nome e documento)" },
  ];
  doc.setDrawColor(100, 116, 139);
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  for (const col of colunas) {
    doc.line(col.x, y, col.x + larg / 2 - 18, y);
    doc.text(col.titulo, col.x, y + 4);
  }
  doc.text("Declaro que recebi as mercadorias listadas acima, em perfeitas condições, na data ____/____/________ às ____:____.", 14, y + 14);

  // Rodapé com paginação
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Carga #${c.numero_carga}  -  Página ${p} de ${paginas}  -  CORE LogiTrack`, larg / 2, alt - 6, { align: "center" });
  }
  return doc;
}

/** Abre o romaneio para impressão; se o navegador bloquear a janela, baixa o PDF. */
export function imprimirRomaneio(r: Romaneio, janela?: Window | null) {
  const doc = gerarRomaneioPdf(r);
  doc.autoPrint();
  const url = doc.output("bloburl") as unknown as string;
  const win = janela && !janela.closed ? janela : window.open(url, "_blank");
  if (win && win === janela) win.location.href = url;
  if (!win) {
    doc.save(`romaneio_carga_${r.carga.numero_carga}.pdf`);
    toast.info("Pop-up bloqueado — o romaneio foi baixado para impressão.");
  }
}
