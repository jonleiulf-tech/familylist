import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // React-pluginen trengs for at .jsx-testene (som rendrer komponenter i
  // jsdom) skal kunne kompileres. Rene lib-tester påvirkes ikke.
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx', 'scripts/**/*.test.js'],
  },
});
