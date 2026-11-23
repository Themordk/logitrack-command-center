/**
 * Fase 7.5 · Faixas de classificação configuráveis.
 * O conjunto (nome, cor, "a partir de", meta) vem do banco (fn_lms_faixas);
 * aqui ficam só a paleta (classes estáticas para o Tailwind) e a classificação
 * para exibição, que segue a mesma regra de fn_lms_classificar.
 */

export type CorFaixa = "verde" | "azul" | "ciano" | "roxo" | "amarelo" | "laranja" | "vermelho" | "cinza";

export interface FaixaLms {
  ordem: number;
  codigo: string;
  nome: string;
  cor: CorFaixa;
  a_partir_de_pct: number;
  eh_meta: boolean;
}

export interface EstiloCor {
  rotulo: string;
  hex: string;
  texto: string;
  fundo: string;
  borda: string;
  barra: string;
}

export const PALETA: Record<CorFaixa, EstiloCor> = {
  verde:    { rotulo: "Verde",    hex: "#22c55e", texto: "text-green-400",  fundo: "bg-green-500/15",  borda: "border-green-500/30",  barra: "bg-green-500/70" },
  azul:     { rotulo: "Azul",     hex: "#3b82f6", texto: "text-blue-400",   fundo: "bg-blue-500/15",   borda: "border-blue-500/30",   barra: "bg-blue-500/70" },
  ciano:    { rotulo: "Ciano",    hex: "#06b6d4", texto: "text-cyan-400",   fundo: "bg-cyan-500/15",   borda: "border-cyan-500/30",   barra: "bg-cyan-500/70" },
  roxo:     { rotulo: "Roxo",     hex: "#a855f7", texto: "text-purple-400", fundo: "bg-purple-500/15", borda: "border-purple-500/30", barra: "bg-purple-500/70" },
  amarelo:  { rotulo: "Amarelo",  hex: "#eab308", texto: "text-yellow-400", fundo: "bg-yellow-500/15", borda: "border-yellow-500/30", barra: "bg-yellow-500/70" },
  laranja:  { rotulo: "Laranja",  hex: "#f97316", texto: "text-orange-400", fundo: "bg-orange-500/15", borda: "border-orange-500/30", barra: "bg-orange-500/70" },
  vermelho: { rotulo: "Vermelho", hex: "#ef4444", texto: "text-red-400",    fundo: "bg-red-500/15",    borda: "border-red-500/30",    barra: "bg-red-500/70" },
  cinza:    { rotulo: "Cinza",    hex: "#6b7280", texto: "text-muted-foreground", fundo: "bg-muted/40", borda: "border-border", barra: "bg-gray-500/60" },
};

export const CORES: CorFaixa[] = ["verde", "azul", "ciano", "roxo", "amarelo", "laranja", "vermelho", "cinza"];

export const FAIXAS_PADRAO_LISTA: FaixaLms[] = [
  { ordem: 1, codigo: "EXCELENTE", nome: "Excelente", cor: "verde", a_partir_de_pct: 110, eh_meta: false },
  { ordem: 2, codigo: "BOM", nome: "Bom", cor: "azul", a_partir_de_pct: 90, eh_meta: true },
  { ordem: 3, codigo: "ATENCAO", nome: "Atenção", cor: "amarelo", a_partir_de_pct: 70, eh_meta: false },
  { ordem: 4, codigo: "CRITICO", nome: "Crítico", cor: "vermelho", a_partir_de_pct: 0, eh_meta: false },
];

export const SEM_DADOS: FaixaLms = { ordem: 99, codigo: "SEM_DADOS", nome: "Sem dados", cor: "cinza", a_partir_de_pct: 0, eh_meta: false };

export function estiloCor(cor: string | null | undefined): EstiloCor {
  return PALETA[(cor as CorFaixa) ?? "cinza"] ?? PALETA.cinza;
}

function ordenadas(lista: FaixaLms[] | null | undefined): FaixaLms[] {
  const l = lista && lista.length > 0 ? lista : FAIXAS_PADRAO_LISTA;
  return [...l].sort((a, b) => Number(b.a_partir_de_pct) - Number(a.a_partir_de_pct));
}

/** Mesma regra de fn_lms_classificar: maior faixa com "a partir de" <= pct; abaixo de todas, a mais baixa. */
export function classificar(pct: number | null | undefined, lista?: FaixaLms[] | null): FaixaLms {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return SEM_DADOS;
  const l = ordenadas(lista);
  return l.find((f) => Number(f.a_partir_de_pct) <= Number(pct)) ?? l[l.length - 1];
}

export function metaDe(lista?: FaixaLms[] | null): number {
  const l = ordenadas(lista);
  return Number((l.find((f) => f.eh_meta) ?? l[0]).a_partir_de_pct);
}

/** Texto do intervalo de cada faixa, da mais alta para a mais baixa ("≥ 110%", "90–110%", "< 70%"). */
export function intervalos(lista?: FaixaLms[] | null): Array<{ faixa: FaixaLms; texto: string }> {
  const l = ordenadas(lista);
  return l.map((f, i) => {
    const lim = Number(f.a_partir_de_pct);
    if (i === 0) return { faixa: f, texto: `≥ ${lim}%` };
    const acima = Number(l[i - 1].a_partir_de_pct);
    return { faixa: f, texto: lim === 0 ? `< ${acima}%` : `${lim}–${acima}%` };
  });
}

/** Estilo de uma faixa vinda do banco por código (+ cor/nome quando o conjunto é personalizado). */
const LEGADO: Record<string, { cor: CorFaixa; nome: string }> = {
  EXCELENTE: { cor: "verde", nome: "Excelente" },
  BOM: { cor: "azul", nome: "Bom" },
  ATENCAO: { cor: "amarelo", nome: "Atenção" },
  CRITICO: { cor: "vermelho", nome: "Crítico" },
  SEM_DADOS: { cor: "cinza", nome: "Sem dados" },
};

export function estiloFaixa(codigo: string | null | undefined, cor?: string | null, nome?: string | null): EstiloCor & { nome: string } {
  const leg = codigo ? LEGADO[codigo] : undefined;
  const c = (cor as CorFaixa) || leg?.cor || "cinza";
  return { ...estiloCor(c), nome: nome || leg?.nome || (codigo ?? "—") };
}
