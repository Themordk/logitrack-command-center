import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// Pré-visualizações da Vercel (VERCEL_ENV=preview) usam o banco de homologação (branch-qa do Supabase),
// para testes de UI nunca gravarem na produção. Variáveis configuradas na Vercel têm prioridade.
// Produção (VERCEL_ENV=production) e o Lovable não são afetados: continuam usando o .env.
const SUPABASE_HOMOLOGACAO = {
  url: "https://pwynobnbftqcqygjtrdk.supabase.co",
  projectId: "pwynobnbftqcqygjtrdk",
  // Chave pública (anon) da branch-qa — mesma natureza da chave pública já presente no .env.
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eW5vYm5iZnRxY3F5Z2p0cmRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMDMwOTcsImV4cCI6MjEwNzU3OTA5N30.q_L7fKn9EtZMQ5TwRF4Ud5zA7Ndp5a0Rr6hQwn8kxpM",
};
if (process.env.VERCEL_ENV === "preview" && !process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = SUPABASE_HOMOLOGACAO.url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = SUPABASE_HOMOLOGACAO.key;
  process.env.VITE_SUPABASE_PROJECT_ID = SUPABASE_HOMOLOGACAO.projectId;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        name: "CORE LogiTrack",
        short_name: "CORE Coletor",
        description: "Sistema WMS para operações logísticas",
        theme_color: "#1a56db",
        background_color: "#0f1117",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/#/coletor/login",
        scope: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/dcpmykhxysvxnpgmlyli\.supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
