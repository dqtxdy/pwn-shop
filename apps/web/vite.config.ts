import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('@cloudscape-design')) return 'vendor-cloudscape';
          if (
            id.includes('ethers') ||
            id.includes('wagmi') ||
            id.includes('viem') ||
            id.includes('/ox/') ||
            id.includes('@reown') ||
            id.includes('@walletconnect') ||
            id.includes('@coinbase') ||
            id.includes('@ant-design/web3')
          ) {
            return 'vendor-web3';
          }

          return undefined;
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    exclude: ['**/e2e/**', '**/node_modules/**', '**/dist/**']
  }
});
