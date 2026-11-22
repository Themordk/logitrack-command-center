import { useCallback, useEffect, useState } from "react";

/**
 * Favoritos e recentes do menu, por usuário, no localStorage deste navegador.
 * São só atalhos: o que aparece continua filtrado pelas permissões do menu.
 */
const MAX_RECENTES = 5;
const chave = (usuarioId: string) => `core_menu_prefs_${usuarioId}`;

interface Preferencias {
  favoritos: string[];
  recentes: string[];
}

function ler(usuarioId: string | null): Preferencias {
  if (!usuarioId) return { favoritos: [], recentes: [] };
  try {
    const raw = localStorage.getItem(chave(usuarioId));
    const p = raw ? (JSON.parse(raw) as Partial<Preferencias>) : {};
    return {
      favoritos: Array.isArray(p.favoritos) ? p.favoritos : [],
      recentes: Array.isArray(p.recentes) ? p.recentes : [],
    };
  } catch {
    return { favoritos: [], recentes: [] };
  }
}

function gravar(usuarioId: string | null, p: Preferencias) {
  if (!usuarioId) return;
  try {
    localStorage.setItem(chave(usuarioId), JSON.stringify(p));
  } catch {
    // storage indisponível: segue só em memória
  }
}

export function useMenuPreferencias(usuarioId: string | null) {
  const [prefs, setPrefs] = useState<Preferencias>(() => ler(usuarioId));

  useEffect(() => { setPrefs(ler(usuarioId)); }, [usuarioId]);

  const atualizar = useCallback((fn: (p: Preferencias) => Preferencias) => {
    setPrefs((atual) => {
      const next = fn(atual);
      gravar(usuarioId, next);
      return next;
    });
  }, [usuarioId]);

  const alternarFavorito = useCallback((path: string) => {
    atualizar((p) => ({
      ...p,
      favoritos: p.favoritos.includes(path) ? p.favoritos.filter((f) => f !== path) : [...p.favoritos, path],
    }));
  }, [atualizar]);

  const registrarVisita = useCallback((path: string) => {
    atualizar((p) => {
      if (p.recentes[0] === path) return p;
      return { ...p, recentes: [path, ...p.recentes.filter((r) => r !== path)].slice(0, MAX_RECENTES) };
    });
  }, [atualizar]);

  return { favoritos: prefs.favoritos, recentes: prefs.recentes, alternarFavorito, registrarVisita };
}
