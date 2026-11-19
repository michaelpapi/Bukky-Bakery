import { defineConfig } from 'astro/config';
import { CLIENT } from './config/active-client.mjs';

export default defineConfig({
  // each client's images live in clients/<slug>/public and are served from the site root (/images/...)
  publicDir: `./clients/${CLIENT}/public`,
  // one inline <style> instead of a CSS request: fewer round trips on slow networks
  build: { inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
});
