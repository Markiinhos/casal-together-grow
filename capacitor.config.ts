import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.casal',
  appName: 'Casal',
  webDir: 'dist',
  server: {
    // Hot-reload do preview do Lovable no celular durante o desenvolvimento.
    // Para gerar o APK final de produção, REMOVA o bloco `server` inteiro
    // e rode `npx cap sync android` novamente.
    url: 'https://33e7c33e-da92-44e5-b7bb-e0e1a998d186.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
