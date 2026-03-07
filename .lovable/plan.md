
## Diagnosis

The root cause is confirmed from the network logs. The RPC `rpc_coletor_armazenagem_execucao` returns a **404** with error:

```
"relation \"usuario_empresa\" does not exist"
```

The function `fn_usuario_tem_empresa` queries a table `usuario_empresa` that was never created. Since the user confirmed **empresa unica por usuario**, we can fix this function to validate against `usuario.empresa_id` directly.

## Plan

### 1. Fix `fn_usuario_tem_empresa` function (database migration)

Replace the function body to check `usuario.empresa_id` instead of the non-existent `usuario_empresa` table:

```sql
CREATE OR REPLACE FUNCTION public.fn_usuario_tem_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = auth.uid()
      AND empresa_id = p_empresa_id
  );
$$;
```

Using `SECURITY DEFINER` to avoid any RLS recursion on the `usuario` table.

No frontend code changes needed -- the UI logic and RPC call are correct. Once the function is fixed, the RPC will execute successfully and stats will populate.
