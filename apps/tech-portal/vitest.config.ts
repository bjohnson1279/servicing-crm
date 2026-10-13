import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include all test files under src/**/*.test.tsx
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./setup.ts'],
    pool: 'forks',
    fileParallelism: false,
  },
});
