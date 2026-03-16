import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['supabase/tests/rls/**/*.test.ts'],
    setupFiles: ['supabase/tests/rls/setup.ts'],
    testTimeout: 30000,
  },
});
