import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge precisa conhecer a escala tipográfica do design system
 * (tailwind.config.ts → fontSize). Sem isso, `text-caption` seria tratado como cor
 * e apagado quando houver `text-success`, `text-foreground` etc. na mesma chamada.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["caption", "body-sm", "body", "heading-sm", "heading", "metric"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
