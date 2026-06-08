import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn {
  key: string;
  label: string;
  format?: (row: any) => string;
  align?: "left" | "right" | "center";
  width?: number;
}

const safeFormat = (col: ExportColumn, row: any): string => {
  try {
    if (col.format) return col.format(row);
    const v = row[col.key];
    if (v === null || v === undefined || v === "") return "";
    return String(v);
  } catch {
    return "";
  }
};

const stamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

export function exportToExcel(filename: string, columns: ExportColumn[], rows: any[]) {
  const headers = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => safeFormat(c, row)));
  const aoa = [headers, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c, i) => ({
    wch: Math.max(c.label.length, ...body.map((r) => (r[i] || "").length)) + 2,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, `${filename}_${stamp()}.xlsx`);
}

export interface PdfMeta {
  title: string;
  generatedAt: string;
  usuario?: string;
  total?: number;
  filters?: Record<string, string>;
}

export function exportToPdf(
  filename: string,
  columns: ExportColumn[],
  rows: any[],
  meta: PdfMeta,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("CORE LogiTrack", 14, 14);
  doc.setFontSize(12);
  doc.text(meta.title, pageWidth - 14, 14, { align: "right" });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const metaLine1 = `Gerado em: ${meta.generatedAt}    Usuário: ${meta.usuario || "—"}    Registros: ${meta.total ?? rows.length}`;
  doc.text(metaLine1, 14, 20);

  const filterEntries = Object.entries(meta.filters || {}).filter(([, v]) => v);
  const filterLine = filterEntries.length
    ? "Filtros: " + filterEntries.map(([k, v]) => `${k}: ${v}`).join("  |  ")
    : "Filtros: nenhum";
  doc.text(filterLine, 14, 25);

  // Table
  autoTable(doc, {
    startY: 30,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => safeFormat(c, row))),
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      overflow: "linebreak",
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: columns.reduce((acc, c, i) => {
      const style: any = {};
      if (c.align) style.halign = c.align;
      if (c.width) style.cellWidth = c.width;
      acc[i] = style;
      return acc;
    }, {} as Record<number, any>),
    margin: { left: 8, right: 8, bottom: 14 },
    didDrawPage: () => {
      const pageNumber = (doc as any).internal.getNumberOfPages
        ? doc.getNumberOfPages()
        : (doc as any).internal.pages.length - 1;
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Página ${pageNumber}  ·  CORE LogiTrack — Confidencial`,
        pageWidth / 2,
        pageHeight - 6,
        { align: "center" },
      );
    },
  });

  doc.save(`${filename}_${stamp()}.pdf`);
}

// ===== Helpers =====
export const fmtNumberBR = (v: any): string => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "";
  return n.toLocaleString("pt-BR");
};

export const fmtDateBR = (v: any): string => {
  if (!v || v === "1900-01-01") return "";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
  } catch {
    return String(v);
  }
};

export const fmtDateTimeBR = (v: any): string => {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
  } catch {
    return String(v);
  }
};
