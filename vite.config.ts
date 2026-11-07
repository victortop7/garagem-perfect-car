import { defineConfig } from 'vite';

// base relativa: o site funciona em qualquer endereço (GitHub Pages em subpasta, Cloudflare Pages, domínio próprio).
export default defineConfig({
  base: './',
});
