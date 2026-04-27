# Plano de revisão e correção de consultas com `armazem_id='null'`

## Diagnóstico confirmado

A falha não está apenas na tela de Endereços. A causa raiz é que o sistema pode gravar o valor literal `"null"` no `localStorage` quando o usuário não possui `armazem_id` no cadastro.

Exemplo atual:

```ts
localStorage.setItem("core_armazem_id", usuario.armazem_id)
```

Quando `usuario.armazem_id` vem como `null` do banco, o navegador salva a string `"null"`. Depois o `TenantContext` lê isso como se fosse um ID válido:

```ts
setArmazemId(localStorage.getItem("core_armazem_id"))
```

Como `"null"` é uma string preenchida, várias consultas executam:

```ts
.eq("armazem_id", "null")
```

Isso gera a URL que você trouxe:

```text
armazem_id=eq.null
```

E o Postgres retorna:

```text
invalid input syntax for type uuid: "null"
```

Também confirmei no banco que existem usuários com `armazem_id` nulo, então esse cenário é real e recorrente.

## Correção proposta

### 1. Sanitizar o contexto global de armazém

Ajustar `TenantContext` para nunca expor `armazemId = "null"`, `"undefined"` ou string vazia.

Regras:

```text
null, undefined, "", "null", "undefined" => null
UUID válido => mantém o valor
valor inválido => null
```

Também limpar o `localStorage` se encontrar valor inválido, evitando que o erro volte ao recarregar a página.

Arquivo:

```text
src/contexts/TenantContext.tsx
```

### 2. Corrigir gravação no login web e coletor

Alterar os logins para só salvar `core_armazem_id` quando houver um UUID real. Caso contrário, remover a chave.

Arquivos:

```text
src/pages/LoginPage.tsx
src/pages/coletor/ColetorLoginPage.tsx
```

Resultado esperado:

```ts
if (usuario.armazem_id) {
  localStorage.setItem("core_armazem_id", usuario.armazem_id);
} else {
  localStorage.removeItem("core_armazem_id");
}
```

### 3. Blindar o helper `fetchOptions`

Ajustar `fetchOptions` para ignorar filtros inválidos antes de montar a query.

Hoje ele ignora apenas valores falsy, mas `"null"` é truthy. Será ajustado para ignorar:

```text
null, undefined, "", "all", "null", "undefined"
```

Arquivo:

```text
src/hooks/useCrud.ts
```

Isso corrige dropdowns como:

```text
setor
box
tipo_box
turnos
motivo_ocorrencia
rotas
```

quando algum filtro opcional vier contaminado.

### 4. Blindar o `useCrud` para listagens

Mesmo que algum componente envie contexto inválido, o `useCrud` deve tratar `armazemId` e `empresaId` sanitizados antes de filtrar.

Correções:

- Se a tabela exige armazém e o armazém não é válido, não consultar a tabela inteira.
- Retornar lista vazia com segurança.
- Nunca montar `.eq("armazem_id", "null")`.

Arquivo:

```text
src/hooks/useCrud.ts
```

Esse ponto cobre listagens como:

```text
Localizações / Endereços
Box
Turnos
Motivos de Ocorrência
Zonas de Atividade
Picking Produto
Rotas
```

### 5. Revisar consultas diretas com `.eq("armazem_id", armazemId)`

Além do `useCrud` e `fetchOptions`, há consultas diretas que podem sofrer o mesmo erro se receberem `"null"`.

Cenários identificados para revisão:

```text
src/pages/ProdutosPage.tsx
- carrega endereços para picking por armazém

src/pages/NovoInventarioPage.tsx
- estima endereços
- busca endereços
- busca zonas por armazém
- cria inventário com p_armazem_id

src/pages/ZonasAtividadePage.tsx
- carrega endereços vinculáveis à zona

src/pages/IntegracaoPage.tsx
- carrega/salva configuração ERP por armazém

src/pages/EntradasPage.tsx
- filtra documentos/boxes/armazéns em geração de entrada

src/pages/MovimentoEntradaPage.tsx
- carrega motivos por armazém

src/pages/MovimentoSaidaPage.tsx
- carrega motivos por armazém
- gera abastecimento usando armazém do localStorage

src/pages/SaidasPage.tsx
- carrega box/rotas para gerar onda

src/modules/reports/*
- filtros de relatórios por armazém, especialmente Estoque, Validade/Lote, Ocupação e Ciclo do Pedido

src/pages/coletor/*
- telas que ainda leem `core_armazem_id` diretamente do localStorage
```

Aplicar o mesmo padrão: antes de qualquer `.eq("armazem_id", valor)` ou `p_armazem_id`, validar que o valor é um UUID real. Se for inválido, bloquear a ação com mensagem clara ou não executar a consulta.

### 6. Mensagem amigável quando não houver armazém ativo

Em telas que dependem obrigatoriamente de armazém, evitar erro técnico e exibir orientação operacional:

```text
Nenhum armazém ativo selecionado para a empresa atual. Cadastre/ative um armazém ou vincule um armazém ao usuário.
```

Aplicar prioritariamente em:

```text
Localizações / Endereços
Box
Turnos
Motivos
Zonas de Atividade
Integração ERP
Novo Inventário
Movimentos operacionais
```

### 7. Ajuste opcional de dados existentes

Sem migração obrigatória. Porém, como existem usuários com `armazem_id` nulo, a correção de código impedirá erro técnico, mas esses usuários continuarão sem armazém operacional.

Depois da correção, será necessário revisar no cadastro de Usuários quais usuários devem ter armazém vinculado.

## Arquivos principais a alterar

```text
src/contexts/TenantContext.tsx
src/hooks/useCrud.ts
src/pages/LoginPage.tsx
src/pages/coletor/ColetorLoginPage.tsx
src/pages/EnderecosPage.tsx
src/pages/EnderecosBatchPage.tsx
src/pages/BoxPage.tsx
src/pages/SaidasPage.tsx
src/pages/ProdutosPage.tsx
src/pages/NovoInventarioPage.tsx
src/pages/ZonasAtividadePage.tsx
src/pages/IntegracaoPage.tsx
src/pages/MovimentoEntradaPage.tsx
src/pages/MovimentoSaidaPage.tsx
src/modules/reports/* onde houver filtro direto por armazém
```

## Validação após implementação

1. Entrar com usuário que tem `armazem_id` nulo.
2. Confirmar que o `localStorage` não grava `core_armazem_id = "null"`.
3. Abrir **Armazém > Localizações / Endereços**.
4. Confirmar que a UI não faz request com `armazem_id=eq.null`.
5. Abrir dropdowns de **Setor**, **Tipo de Estoque**, **Box**, **Rotas**, **Turnos** e **Motivos**.
6. Trocar empresa no TopNav como ADMINISTRADOR.
7. Confirmar que o armazém ativo é recalculado, e se não existir armazém na empresa, nenhuma query inválida é enviada.
8. Revisar no Network que não existe mais nenhum request contendo:

```text
armazem_id=eq.null
armazem_id=eq.undefined
```

## Resultado esperado

Após a correção, o sistema não enviará mais `armazem_id='null'` para o Supabase. As telas dependentes de armazém passarão a ter comportamento seguro: carregar dados quando houver armazém válido ou exibir estado vazio/mensagem clara quando não houver armazém ativo.