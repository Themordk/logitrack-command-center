-- F4.3 (2026-11-14): critérios de produto no N3 (Marca, Grupo, Subgrupo). Valores de enum ficam numa migration própria.
ALTER TYPE public.enum_criterio_roteiro_saida ADD VALUE IF NOT EXISTS 'MARCA';
ALTER TYPE public.enum_criterio_roteiro_saida ADD VALUE IF NOT EXISTS 'GRUPO_PRODUTO';
ALTER TYPE public.enum_criterio_roteiro_saida ADD VALUE IF NOT EXISTS 'SUBGRUPO_PRODUTO';