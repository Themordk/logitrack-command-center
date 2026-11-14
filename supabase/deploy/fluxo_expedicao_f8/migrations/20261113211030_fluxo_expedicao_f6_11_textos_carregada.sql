DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.embarque_fechar_carga'::regproc);
  n := replace(d, 'Carga #%s já estava fechada.', 'Carga #%s já estava carregada.');
  n := replace(n, 'Carga #%s fechada; %s onda(s) concluída(s).', 'Carregamento da carga #%s concluído; %s onda(s) concluída(s).');
  IF n = d THEN RAISE EXCEPTION 'F6.11: textos não encontrados'; END IF;
  EXECUTE n;
END $$;