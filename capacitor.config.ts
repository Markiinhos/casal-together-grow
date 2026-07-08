import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL ?? 'https://casal-together-grow.lovable.app';
const usesClearText = serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'app.lovable.casal',
  appName: 'Casal',
  // TanStack Start + Nitro gera uma aplicação server-rendered, não um SPA estático em `dist/`.
  // Para Android/Capacitor, este projeto usa um shell nativo que abre a URL publicada.
  // `mobile-web` existe apenas para satisfazer o requisito do Capacitor de haver um index.html local.
  webDir: 'mobile-web',
  server: {
    url: serverUrl,
    cleartext: usesClearText,
  },
  android: {
    allowMixedContent: usesClearText,
  },
};

export default config;
