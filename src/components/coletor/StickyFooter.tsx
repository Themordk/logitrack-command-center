interface Props { children: React.ReactNode; }

/** Rodapé fixo dentro da área de conteúdo do ColetorLayout (main com p-3). */
export function StickyFooter({ children }: Props) {
  return (
    <div className="sticky bottom-0 -mx-3 -mb-3 mt-auto px-2.5 py-2 bg-[#0f1117] border-t border-[hsl(222,35%,22%)] z-10 shrink-0 text-[14.5px]">
      {children}
    </div>
  );
}
