## Objetivo

Substituir todos os `toast.error(<var>.message)` crus restantes por `parseError` + `parsed.title`, seguindo o padrão já usado no `LoginPage` (com preservação de fallback em português quando existente).

## Padrão a aplicar

```tsx
import { parseError } from "@/lib/errorMapper"; // adicionar se ausente

// Caso sem fallback:
const parsed = parseError(err, "<contexto>");
toast.error(parsed.title);

// Caso com fallback pt-BR já escrito (ex.: || "Erro ao salvar."):
const parsed = parseError(err, "<contexto>");
const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
toast.error(fallbackToRaw ? "Erro ao salvar." : parsed.title);
```

Escolha do `contexto` = ação em minúsculo/kebab (ex.: `"carregar usuarios"`, `"salvar produto"`, `"gerar abastecimento"`).

## Arquivos e ocorrências

### Prioridade 1
- `src/hooks/useCrud.ts` L169: substituir `toast.error(\`Erro ao carregar dados: ${err.message}\`)` por `parseError(err, \`carregar ${table}\`)` + `toast.error(parsed.title)`. `parseError` já importado.

### Prioridade 2 (31 ocorrências, 16 arquivos)
- `src/pages/UsuariosPage.tsx` — L102, L177
- `src/pages/ProdutosPage.tsx` — L189
- `src/pages/PerfisAcessoPage.tsx` — L139
- `src/pages/EnderecosBatchPage.tsx` — L215, L230
- `src/pages/CadastroDocEntradaPage.tsx` — L151
- `src/pages/CadastroDocSaidaPage.tsx` — L149
- `src/pages/integracao/CredenciaisDinamicasTab.tsx` — L136 (fallback: "Erro ao salvar")
- `src/pages/integracao/SincronizacaoTab.tsx` — L138, L163, L184
- `src/pages/zonas/ZonaEnderecosSheet.tsx` — L91, L111
- `src/pages/zonas/AddEnderecosDialog.tsx` — L56, L111, L164
- `src/pages/AbastecimentoGeracaoPage.tsx` — L91, L228
- `src/pages/TiposTarefaPage.tsx` — L50, L154 (usa `error.message` — mesmo tratamento; renomear var local para `err` se necessário ou aplicar `parseError(error, ...)`)
- `src/pages/OcorrenciasOperacionaisPage.tsx` — L183
- `src/components/ocorrencia/RegistrarOcorrenciaColetorButton.tsx` — L125
- `src/modules/reports/produtividade/TarefasColaboradorPage.tsx` — L132

## Regras

- Adicionar `import { parseError } from "@/lib/errorMapper";` somente se ainda não estiver presente no arquivo.
- Onde há fallback em português (`|| "Erro ao X."`), usar a lógica `fallbackToRaw` preservando a string original.
- **Não alterar** layout, lógica de negócio, tipos, nem instalar dependências.
- Nenhuma outra linha do `useCrud.ts` deve ser tocada.

## Validação

Após as edições, rodar `rg "toast\.error\(.*\.message"` nos diretórios afetados para confirmar zero ocorrências restantes.
