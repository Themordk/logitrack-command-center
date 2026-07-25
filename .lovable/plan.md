# Substituição da Logo do Produto CORE LogiTrack

## Contexto

Hoje a "logo do produto" é representada pelo ícone `Boxes` (lucide-react) dentro de um quadrado com `bg-primary`, acompanhado do texto "CORE LogiTrack". Isso aparece em 5 pontos do sistema, além dos ícones do PWA/favicon. O arquivo enviado (`pasted-...txt`) contém a nova logo em base64 (PNG).

As logos configuráveis por tenant em etiquetas (`EtiquetaHUPreview`, `EtiquetaEnderecoPreview`, `EtiquetaVolumePreview`) **não** serão alteradas — são logos do cliente, não do produto.

## Passos

### 1. Preparar o arquivo da logo
- Decodificar o base64 do `user-uploads://pasted-2026-07-25T16-03-37-278Z.txt` para um PNG local em `/tmp/corelogitrack-logo.png`.
- Fazer upload via `lovable-assets create` para `src/assets/corelogitrack-logo.png.asset.json` (CDN).
- Gerar variações do favicon/PWA a partir do mesmo PNG (192x192, 512x512, favicon.ico) usando ImageMagick/PIL e substituir em `public/`.

### 2. Substituir a logo nos 5 pontos de UI
Em cada local, trocar o bloco `<div className="... bg-primary"><Boxes/></div>` por um `<img src={logoAsset.url} alt="CORE LogiTrack" />` com **exatamente** as mesmas dimensões atuais (sem redimensionar o layout):

| Arquivo | Local atual | Tamanho preservado |
|---|---|---|
| `src/components/TopNav.tsx` (L177-180) | Header administrativo | 28×28px (`w-7 h-7`) |
| `src/pages/LoginPage.tsx` (L235-245) | Tela de login (dentro do orbital) | 46×46px (inset 8 de 62) |
| `src/components/tenant/TenantBootScreens.tsx` (L13, L104) | Splash screens de boot | 56×56px |
| `src/components/suporte/SupportLayout.tsx` (L36) | Header módulo suporte | 28×28px |
| `src/pages/coletor/ColetorLoginPage.tsx` (L181) | Login do Coletor | 40×40px |

O container arredondado com `bg-primary` será mantido apenas onde faz sentido visual (fundo do ícone); a imagem será encaixada dentro com `object-contain` para não distorcer.

### 3. Favicon e PWA
- Substituir `public/favicon.ico`, `public/pwa-192x192.png`, `public/pwa-512x512.png` pelas versões geradas a partir da nova logo.
- Nenhuma alteração necessária em `vite.config.ts` ou `index.html` — os caminhos permanecem.

## Fora de escopo
- Etiquetas térmicas (logos configuráveis por template do cliente).
- Textos "CORE LogiTrack" e cores da marca — permanecem inalterados.
- Tela de splash / WarehouseCanvas do login (animação 3D lateral) — não usa a logo.

## Verificação
- `bun run build` para confirmar que os imports/`.asset.json` resolvem.
- Inspeção visual dos 5 pontos após o restart.
