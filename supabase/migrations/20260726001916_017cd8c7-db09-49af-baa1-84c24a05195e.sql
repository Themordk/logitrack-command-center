-- Move Etiquetas module from Armazém to Configurações grouping.
-- Only the codigo changes; permissions and RBAC relations remain intact.
UPDATE public.modulo
SET codigo = 'web.config.etiquetas'
WHERE codigo = 'web.armazem.etiquetas';

-- Remove Regras de Armazenagem module (page unified into Cadastro de Armazém > Configurações).
-- Cascade will clean perfil_permissao rows referencing this module.
DELETE FROM public.modulo
WHERE codigo = 'web.armazem.regras_armazenagem';
