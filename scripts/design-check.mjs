#!/usr/bin/env node
/**
 * Catraca do design system (CORE LogiTrack).
 *
 * Conta, em src/, os padrões visuais que o design system proíbe em código novo
 * e compara com a linha de base (scripts/design-check.baseline.json).
 *  - Se algum número SUBIU → falha (exit 1) e lista os arquivos que mais contribuem.
 *  - Se caiu → passa e sugere `npm run design:check -- --atualizar` para travar o ganho.
 *
 * Não exige refatorar tudo de uma vez: só impede piorar. Vale para Lovable, Claude e pessoas.
 * Regras completas: src/AGENTS.md
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const raiz = process.cwd();
const pastaSrc = join(raiz, "src");
const arquivoBase = join(raiz, "scripts", "design-check.baseline.json");
const atualizar = process.argv.includes("--atualizar");

// Pastas fora da regra: primitivos do shadcn, o próprio design system e testes.
const ignorar = [/^src\/components\/ui\//, /^src\/components\/ds\//, /__tests__\//, /\.test\.tsx?$/, /^src\/integrations\//];

const paleta = "red|green|blue|yellow|amber|emerald|orange|purple|violet|indigo|pink|rose|teal|cyan|sky|lime|fuchsia|slate|gray|zinc|neutral|stone";
const regras = {
  cores_de_paleta: { re: new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder)-(?:${paleta})-\\d{2,3}(?:\\/\\d+)?\\b`, "g"), dica: "use tons semânticos: text-success, bg-warning/10, border-danger/25…" },
  cor_fixa_em_classe: { re: /\b(?:bg|text|border|fill|stroke|ring)-\[(?:#|hsl|rgb)[^\]]*\]/g, dica: "use tokens (bg-card, text-muted-foreground, bg-primary…)" },
  texto_minusculo: { re: /\btext-\[(?:[0-9]|10|11)px\]/g, dica: "mínimo text-caption (12px) na web; 14px no coletor" },
  cantos_exagerados: { re: /\brounded-(?:2xl|3xl)\b/g, dica: "controles rounded-md, cartões rounded-lg" },
  emoji_na_interface: { re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, dica: "use ícone lucide ou texto" },
  efeito_decorativo: { re: /\b(?:bg-gradient-to-\w+|backdrop-blur(?:-\w+)?|hover:scale-[\w.[\]]+|shadow-(?:xl|2xl)|animate-(?:bounce|ping))\b/g, dica: "sem gradiente, vidro, zoom no hover ou animação chamativa" },
  titulo_solto: { re: /<h1\b/g, dica: "use <PageHeader title=…> de @/components/ds" },
};

function listar(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...listar(caminho));
    else if (/\.(tsx?|css)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

const totais = Object.fromEntries(Object.keys(regras).map((k) => [k, 0]));
const porArquivo = Object.fromEntries(Object.keys(regras).map((k) => [k, {}]));

for (const caminho of listar(pastaSrc)) {
  const rel = relative(raiz, caminho).split("\\").join("/");
  if (ignorar.some((re) => re.test(rel))) continue;
  const texto = readFileSync(caminho, "utf8");
  for (const [nome, { re }] of Object.entries(regras)) {
    const n = (texto.match(re) || []).length;
    if (n) {
      totais[nome] += n;
      porArquivo[nome][rel] = n;
    }
  }
}

const base = existsSync(arquivoBase) ? JSON.parse(readFileSync(arquivoBase, "utf8")) : null;

if (!base || atualizar) {
  if (base && !atualizar) process.exit(0);
  const novo = { gerado_em: new Date().toISOString().slice(0, 10), totais, por_arquivo: porArquivo };
  if (base && atualizar) {
    for (const k of Object.keys(totais)) {
      if (totais[k] > (base.totais[k] ?? Infinity)) {
        console.error(`Não atualizei: "${k}" subiu (${base.totais[k]} → ${totais[k]}). Corrija antes.`);
        process.exit(1);
      }
    }
  }
  writeFileSync(arquivoBase, JSON.stringify(novo, null, 2) + "\n");
  console.log("Linha de base gravada:", totais);
  process.exit(0);
}

let piorou = false;
const linhas = [];
for (const [nome, atual] of Object.entries(totais)) {
  const antes = base.totais[nome] ?? 0;
  const sinal = atual > antes ? "▲ PIOROU" : atual < antes ? "▼ melhorou" : "=";
  linhas.push(`${nome.padEnd(22)} ${String(antes).padStart(5)} → ${String(atual).padStart(5)}  ${sinal}`);
  if (atual > antes) {
    piorou = true;
    // Mostra só os arquivos que pioraram em relação à linha de base (arquivo novo conta inteiro).
    const antesArq = (base.por_arquivo && base.por_arquivo[nome]) || {};
    const culpados = Object.entries(porArquivo[nome])
      .map(([arq, n]) => [arq, n - (antesArq[arq] ?? 0)])
      .filter(([, d]) => d > 0)
      .sort((a, b) => b[1] - a[1]);
    linhas.push(`   dica: ${regras[nome].dica}`);
    for (const [arq, d] of culpados) linhas.push(`   +${String(d).padStart(3)}  ${arq}`);
  }
}
console.log("Design system — catraca (linha de base de " + base.gerado_em + ")\n" + linhas.join("\n"));
if (piorou) {
  console.error("\nO código novo trouxe padrões fora do design system. Veja src/AGENTS.md.");
  process.exit(1);
}
const melhorou = Object.keys(totais).some((k) => totais[k] < (base.totais[k] ?? 0));
if (melhorou) console.log("\nMelhorou. Trave o ganho com: npm run design:check -- --atualizar");
