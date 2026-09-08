import { defineConfig } from '@playwright/test';
import native from './functional.config.js';

export default defineConfig({
  ...native,
  testMatch: ['tests/browser/rig-pair-rendered-301.spec.ts'],
  workers: 1,
  timeout: 300_000,
});
