import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://weiyu.dev',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
