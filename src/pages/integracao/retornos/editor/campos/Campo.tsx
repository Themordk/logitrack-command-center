import type { ReactNode } from "react";

export function Campo({ rotulo, htmlFor, children, dica }: { rotulo: string; htmlFor?: string; children: ReactNode; dica?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</label>
      {children}
      {dica && <p className="text-[11px] text-muted-foreground">{dica}</p>}
    </div>
  );
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-foreground">{titulo}</h4>
      {children}
    </section>
  );
}

export function BlocoCodigo({ children }: { children: ReactNode }) {
  return <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary/40 p-3 font-mono text-xs text-foreground">{children}</pre>;
}
