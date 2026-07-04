import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* scenario tests only; the engine tests in test/ run via node:test */
    include: ['scenario-tests/**/*.test.js'],
  },
});
