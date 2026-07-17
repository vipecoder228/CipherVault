import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ciphervault.app',
  appName: 'CipherVault',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Biometric: {
      title: 'Авторизация CipherVault',
      subtitle: 'Используйте отпечаток пальца или Face ID',
      reason: 'Для доступа к вашим паролям',
      cancelTitle: 'Отмена',
    },
    SecureStorage: {
      // Настройки безопасного хранилища
    },
  },
  android: {
    backgroundColor: '#0f0f14',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    overrideUserAgent: undefined,
    appendUserAgent: undefined,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
};

export default config;
