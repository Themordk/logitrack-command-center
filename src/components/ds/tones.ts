/**
 * Design system · tons semânticos.
 *
 * Um tom = um significado, em todo o produto (web, coletor, TV, relatórios):
 *   success  terminou bem / disponível / dentro da meta
 *   warning  precisa de atenção logo: aguardando, reservado, perto do prazo, abaixo da meta
 *   danger   impede a operação: bloqueado, erro, vencido, divergência
 *   info     em andamento / em movimento (use pouco: andamento normal pode ser neutral)
 *   neutral  estado sem urgência: rascunho, inativo, cancelado, etapa intermediária
 *
 * Cor nunca é a única pista: o rótulo sempre diz o estado (daltonismo, luz ruim no armazém).
 * Não use red-400, amber-400, emerald-400 etc. direto em telas; use estes tons.
 */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** Selo discreto: fundo leve, texto no tom, borda suave. */
export const toneSubtle: Record<Tone, string> = {
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  info: "bg-info/10 text-info border-info/25",
  neutral: "bg-neutral/10 text-muted-foreground border-border",
};

/** Ponto de status (6px) ao lado do rótulo. */
export const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
};

/** Só o texto no tom (números fora da meta, mensagens curtas). */
export const toneText: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted-foreground",
};
