export interface EnderecoParts {
  ruela: string;
  predio: string;
  nivel: string;
  andar: string;
}

const pad = (v: number | string | null | undefined) =>
  v == null || v === "" ? "—" : String(v).padStart(2, "0");

/**
 * Deriva ruela/prédio/nível/andar de um registro de endereço.
 * Prefere as colunas inteiras (rua/predio/nivel/apto). Se ausentes,
 * tenta parsear o padrão `R01-P01-N02-A01` em `descricao`.
 */
export function parseEndereco(end: any): EnderecoParts {
  if (end && end.rua != null) {
    return {
      ruela: pad(end.rua),
      predio: pad(end.predio),
      nivel: pad(end.nivel),
      andar: pad(end.apto),
    };
  }
  const desc: string = end?.descricao || "";
  const m = desc.match(/R(\d+)-P(\d+)-N(\d+)-A(\d+)/i);
  if (m) {
    return {
      ruela: pad(m[1]),
      predio: pad(m[2]),
      nivel: pad(m[3]),
      andar: pad(m[4]),
    };
  }
  return { ruela: "—", predio: "—", nivel: "—", andar: "—" };
}
