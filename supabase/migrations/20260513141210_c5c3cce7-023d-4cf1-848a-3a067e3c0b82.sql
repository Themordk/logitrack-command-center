ALTER TABLE middleware.sync_config
  ADD COLUMN IF NOT EXISTS data_inicio date NULL,
  ADD COLUMN IF NOT EXISTS data_fim    date NULL;

COMMENT ON COLUMN middleware.sync_config.data_inicio IS
  'Filtro de data inicial (somente Movimentos). NULL = sem limite inferior.';
COMMENT ON COLUMN middleware.sync_config.data_fim IS
  'Filtro de data final (somente Movimentos). NULL = sem limite superior.';