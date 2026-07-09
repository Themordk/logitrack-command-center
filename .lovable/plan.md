## Remoção completa do módulo Rastreabilidade

### Frontend
1. **`src/components/TopNav.tsx`** — remover item de menu "Rastreabilidade".
2. **`src/App.tsx`** — remover import `RastreabilidadePage`, entrada de breadcrumb `/rastreabilidade` e `case "/rastreabilidade"` do roteador.
3. **`src/hooks/useRoutePermission.ts`** — remover `"/rastreabilidade": "web.rastreabilidade"` de `routeToModuleMap`.
4. **`src/pages/PerfisAcessoPage.tsx`** — remover label `"web.rastreabilidade": "Rastreabilidade"`.
5. **`src/pages/RastreabilidadePage.tsx`** — deletar arquivo.

### Banco (via insert tool, DELETE data)
Módulo alvo: `web.rastreabilidade` (id `0129461f-3a7f-4927-84cf-ecb34ff60917`).

- `DELETE FROM perfil_permissao` das permissões desse módulo.
- `DELETE FROM permissao WHERE modulo_id = <id>`.
- `DELETE FROM modulo WHERE codigo = 'web.rastreabilidade'`.

### Fora do escopo
- Textos genéricos "Rastreabilidade" (ex.: subtítulo do relatório de Cancelamentos) permanecem — não fazem referência ao módulo removido.
