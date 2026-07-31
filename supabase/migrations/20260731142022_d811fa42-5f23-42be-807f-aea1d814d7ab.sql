ALTER TABLE public.inventario_tipo_tarefa
  DROP CONSTRAINT IF EXISTS inventario_tipo_tarefa_pkey;

ALTER TABLE public.inventario_tipo_tarefa
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.inventario_tipo_tarefa
  ADD CONSTRAINT inventario_tipo_tarefa_pkey PRIMARY KEY (tenant_id, tipo_execucao);