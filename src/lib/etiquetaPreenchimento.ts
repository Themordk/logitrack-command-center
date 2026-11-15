/**
 * Preenchimento de {{variáveis}} nos templates de etiqueta — mesma regra do agente de impressão 1.1.0
 * (renderer.js: substituirZpl / substituirTexto), para a prévia mostrar o que a impressora vai imprimir.
 *
 * ZPL: em cada campo ^FD…^FS com variável, insere ^FH_ antes do ^FD e escreve os valores em hexadecimal
 *   para ^, ~ e _ (assim uma razão social com "^XA" vira texto, não comando). Se o template já declarou
 *   ^FH no campo, respeita o indicador dele e só remove ^ e ~ dos valores.
 * EPL/TSPL: o valor fica entre aspas; aspas viram apóstrofo e barra invertida vira barra.
 * Variável sem valor vira o texto `faltante` (padrão "---") para aparecer na prévia.
 */
type Dados = Record<string, string | number | null | undefined>;

const valorTexto = (v: unknown) => (v == null ? "" : String(v).replace(/[\r\n\t]+/g, " "));

/** ^, ~ e _ em hexadecimal para uso com ^FH_. */
export const hexZpl = (texto: string) =>
  texto.replace(/[_^~]/g, (c) => "_" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));

export function preencherZpl(corpo: string, dados: Dados = {}, faltante = "---"): string {
  const valor = (chave: string) => (chave in dados && dados[chave] != null ? valorTexto(dados[chave]) : faltante);
  return corpo.split("^FS").map((seg) => {
    const fd = seg.lastIndexOf("^FD");
    if (fd < 0 || seg.indexOf("{{", fd) < 0) return seg;
    const cabeca = seg.slice(0, fd);
    const conteudo = seg.slice(fd + 3);
    const inicioCampo = cabeca.lastIndexOf("^FO");
    const temFhProprio = /\^FH/.test(cabeca.slice(inicioCampo >= 0 ? inicioCampo : 0));
    if (temFhProprio) {
      return cabeca + "^FD" + conteudo.replace(/\{\{([^}]+)\}\}/g, (_m, chave: string) => valor(chave.trim()).replace(/[\^~]/g, " "));
    }
    const novo = conteudo.split(/(\{\{[^}]+\}\})/).map((p) => {
      const m = p.match(/^\{\{([^}]+)\}\}$/);
      if (m) return hexZpl(valor(m[1].trim()));
      return p.replace(/_/g, "_5F");
    }).join("");
    return cabeca + "^FH_^FD" + novo;
  }).join("^FS")
    // variável fora de ^FD (raro, ex.: em comentário): só troca pelo texto
    .replace(/\{\{([^}]+)\}\}/g, (_m, chave: string) => valor(chave.trim()).replace(/[\^~]/g, " "));
}

export function preencherTexto(corpo: string, dados: Dados = {}, faltante = "---"): string {
  return corpo.replace(/\{\{([^}]+)\}\}/g, (_m, chave: string) => {
    const k = chave.trim();
    const v = k in dados && dados[k] != null ? valorTexto(dados[k]) : faltante;
    return v.replace(/"/g, "'").replace(/\\/g, "/");
  });
}
