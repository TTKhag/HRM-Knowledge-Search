import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' dùng đường dẫn tương đối: chạy đúng trên GitHub Pages với bất kỳ tên repo nào.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
