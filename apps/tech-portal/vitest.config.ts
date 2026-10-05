import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include all test files under src/**/*.test.tsx
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'jsdom',
    // Vitest v5 uses top‑level `threads` option instead of `poolOptions`
    threads: { singleThread: true },
  },
});
