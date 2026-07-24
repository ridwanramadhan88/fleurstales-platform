import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [fileURLToPath(new URL('./src/test/setupTests.ts', import.meta.url))],
    css: false,
    pool: 'forks',
    fileParallelism: false,
    poolOptions: {
      forks: { singleFork: true },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/domain/orderWorkflowDomain.ts',
        'src/domain/orderFinanceMathDomain.ts',
        'src/domain/orderPaymentGateDomain.ts',
        'src/domain/notificationDomain.ts',
        'src/store/ordersStoreFinanceActions.ts',
        'src/store/ordersStoreChangeRequestActions.ts',
        'src/components/orders/useNewOrderValidation.ts',
        'src/components/orders/useNewOrderPricing.ts',
      ],
      thresholds: {
        'src/domain/orderWorkflowDomain.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/domain/orderFinanceMathDomain.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/domain/orderPaymentGateDomain.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/domain/notificationDomain.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
})
