/**
 * Suporte multi-linguagem de etiquetas: ZPL / EPL / TSPL.
 * - Dados de exemplo para preview
 * - Snippets de inserção rápida
 * - Geradores automáticos EPL e TSPL a partir da configuração visual
 */
import { dadosExemploDoCatalogo } from "./etiquetaVariaveis";
import type { EtiquetaConfig, TipoEtiquetaConfig } from "@/hooks/useEtiquetaTemplate";

export type LinguagemEtiqueta = "ZPL" | "EPL" | "TSPL";

export const LINGUAGENS: LinguagemEtiqueta[] = ["ZPL", "EPL", "TSPL"];

export const COR_LINGUAGEM: Record<LinguagemEtiqueta, string> = {
  ZPL: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  EPL: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  TSPL: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

export function getTipoLabel(tipo: string): string {
  const map: Record<string, string> = {
    ENDERECO: "ENDERECO",
    PRODUTO: "PRODUTO",
    HU: "HANDLING UNIT",
    VOLUME: "VOLUME",
  };
  return map[tipo] || tipo || "";
}

export const DADOS_EXEMPLO: Record<string, Record<string, string>> = {
  ENDERECO: dadosExemploDoCatalogo("ENDERECO"),
  PRODUTO: {
    sku: "SKU-001234",
    codigo: "SKU-001234",
    descricao: "PARAFUSO SEXTAVADO 10X25MM",
    ean: "7891234567890",
    lote: "LT-2026-001",
    validade: "31/12/2027",
    unidade: "CX",
    embalagem: "CAIXA",
    marca: "MARCA X",
    referencia: "REF-001",
  },
  HU: {
    codigo_hu: "HU-000001",
    tipo_hu: "PALLET",
    tamanho: "M",
    origem: "RECEBIMENTO",
    destino: "ARM-01 R01-P01",
    qtd_itens: "48",
    peso_total: "1250.00 kg",
    parceiro_nome: "FORNECEDOR EXEMPLO LTDA",
    numero_movimento: "131",
    numero_nota: "250",
    data_entrada: "21/07/2026",
    lote_principal: "L2026-A",
    validade_proxima: "15/12/2026",
    total_quantidade: "150",
    total_itens: "3",
    peso_bruto: "45.5",
  },
  VOLUME: {
    codigo_volume: "VOL-000001",
    pedido: "PED-12345",
    cliente: "DISTRIBUIDORA CENTRAL LTDA",
    parceiro_nome: "DISTRIBUIDORA CENTRAL LTDA",
    volumes: "1/3",
    transportadora: "TRANSP. RAPIDA",
    numero_onda: "42",
    numero_volume: "01",
    total_volumes: "05",
    destino_carga: "SAO PAULO / SP",
  },
};

export function dadosExemploPara(tipo: string): Record<string, string> {
  return DADOS_EXEMPLO[tipo] || {};
}

export interface SnippetEtiqueta {
  label: string;
  code: string;
  description: string;
}

export const SNIPPETS: Record<LinguagemEtiqueta, SnippetEtiqueta[]> = {
  ZPL: [
    { label: "Texto", code: "^FO{x},{y}^CF0,{tamanho}^FD{texto}^FS", description: "Campo de texto posicionado" },
    { label: "Barcode 128", code: "^FO{x},{y}^BY2^BC,{altura},Y,N^FD{dados}^FS", description: "Código de barras Code 128" },
    { label: "QR Code", code: "^FO{x},{y}^BQN,2,{tamanho}^FDQA,{dados}^FS", description: "QR Code" },
    { label: "Linha", code: "^FO{x},{y}^GB{largura},{altura},{espessura}^FS", description: "Linha ou retângulo" },
    {
      label: "Field Block",
      code: "^FO{x},{y}^FB{largura},{linhas},0,{alinhamento},0^FD{texto}^FS",
      description: "Bloco de texto com quebra de linha (L/C/R)",
    },
  ],
  EPL: [
    { label: "Texto", code: 'A{x},{y},0,{fonte},1,1,N,"{texto}"', description: "Texto (fonte 1-5)" },
    { label: "Barcode 128", code: 'B{x},{y},0,1,2,2,{altura},B,"{dados}"', description: "Código de barras Code 128" },
    { label: "Barcode 39", code: 'B{x},{y},0,3,2,4,{altura},B,"{dados}"', description: "Código de barras Code 39" },
    { label: "Linha", code: "LO{x},{y},{largura},{altura}", description: "Linha ou retângulo preenchido" },
    { label: "Retângulo", code: "LO{x},{y},{largura},2", description: "Barra horizontal" },
  ],
  TSPL: [
    { label: "Texto", code: 'TEXT {x},{y},"{fonte}",0,1,1,"{texto}"', description: 'Texto posicionado (fonte "0"-"8")' },
    { label: "Barcode 128", code: 'BARCODE {x},{y},"128",{altura},1,0,2,2,"{dados}"', description: "Código de barras Code 128" },
    { label: "QR Code", code: 'QRCODE {x},{y},L,{tamanho},A,0,"{dados}"', description: "QR Code" },
    { label: "Caixa", code: "BOX {x},{y},{largura},{altura},{espessura}", description: "Retângulo/caixa" },
  ],
};

function camposAtivosOrdenados(template: EtiquetaConfig) {
  return (template.campos || [])
    .filter((c) => c.ativo)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

export function gerarEplAutomatico(template: EtiquetaConfig): string {
  const larguraDots = Math.round((Number(template.largura_mm) || 100) * 8);
  const alturaDots = Math.round((Number(template.altura_mm) || 40) * 8);
  const escala = Number(template.escala_fonte) || 1.0;
  const ml = 16;
  const areaUtil = larguraDots - 32;

  let epl = "";
  let y = 8;

  epl += "N\n";
  epl += `q${larguraDots}\n`;
  epl += `Q${alturaDots},24\n`;
  epl += "D7\n";
  epl += "ZT\n";

  if (template.com_cabecalho) {
    epl += `A${ml},${y},0,3,1,1,N,"CORE LogiTrack"\n`;
    const tipoLabel = getTipoLabel(template.tipo);
    const xTipo = larguraDots - 16 - tipoLabel.length * 10;
    epl += `A${Math.max(xTipo, ml + 200)},${y + 2},0,2,1,1,N,"${tipoLabel}"\n`;
    y += 24;
    epl += `LO${ml},${y},${areaUtil},2\n`;
    y += 8;
  }

  const fontCampo = escala >= 1.5 ? 4 : 3;
  const fontAltura = fontCampo === 4 ? 24 : 20;

  for (const campo of camposAtivosOrdenados(template)) {
    if (y + fontAltura > alturaDots - 8) break;
    epl += `A${ml},${y},0,${fontCampo},1,1,N,"${campo.label}: {{${campo.chave}}}"\n`;
    y += fontAltura + 4;
  }

  epl += "P1\n";
  return epl;
}

export function gerarTsplAutomatico(template: EtiquetaConfig): string {
  const larguraMm = Number(template.largura_mm) || 100;
  const alturaMm = Number(template.altura_mm) || 40;
  const alturaDots = Math.round(alturaMm * 8);

  let tspl = "";
  let y = 20;

  tspl += `SIZE ${larguraMm} mm,${alturaMm} mm\n`;
  tspl += "GAP 3 mm,0 mm\n";
  tspl += "DIRECTION 1\n";
  tspl += "CLS\n";

  if (template.com_cabecalho) {
    tspl += `TEXT 16,${y},"3",0,1,1,"CORE LogiTrack"\n`;
    y += 28;
    tspl += `TEXT 16,${y},"2",0,1,1,"${getTipoLabel(template.tipo)}"\n`;
    y += 24;
  }

  for (const campo of camposAtivosOrdenados(template)) {
    if (y + 32 > alturaDots - 8) break;
    tspl += `TEXT 16,${y},"3",0,1,1,"${campo.label}: {{${campo.chave}}}"\n`;
    y += 32;
  }

  tspl += "PRINT 1\n";
  return tspl;
}

export function gerarAutomatico(
  linguagem: LinguagemEtiqueta,
  tipo: TipoEtiquetaConfig,
  template: EtiquetaConfig,
  gerarZpl: (tipo: TipoEtiquetaConfig, cfg: EtiquetaConfig) => string,
): string {
  if (linguagem === "EPL") return gerarEplAutomatico(template);
  if (linguagem === "TSPL") return gerarTsplAutomatico(template);
  return gerarZpl(tipo, template);
}
