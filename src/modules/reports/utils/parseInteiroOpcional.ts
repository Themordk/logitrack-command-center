/**
 * Converte o texto de um campo numérico opcional.
 * - `undefined` quando vazio (sem filtro)
 * - `null` quando inválido (não é inteiro >= 0)
 * - o número quando válido
 */
export function parseInteiroOpcional(v: string): number | undefined | null {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

export interface LocalizacaoFiltro {
  rua?: number;
  predio?: number;
  nivel?: number;
  apto?: number;
}

/** Valida os quatro campos; mostra o nome do campo inválido via callback e devolve null. */
export function parseLocalizacao(
  campos: { rua: string; predio: string; nivel: string; apto: string },
  onErro: (msg: string) => void,
): LocalizacaoFiltro | null {
  const nomes = { rua: "Rua", predio: "Prédio", nivel: "Nível", apto: "Apto" } as const;
  const out: LocalizacaoFiltro = {};
  for (const k of Object.keys(nomes) as (keyof typeof nomes)[]) {
    const r = parseInteiroOpcional(campos[k]);
    if (r === null) {
      onErro(`${nomes[k]} deve ser um número inteiro.`);
      return null;
    }
    if (r !== undefined) out[k] = r;
  }
  return out;
}
