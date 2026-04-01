/**
 * UBOT Default Theme
 *
 * The base system theme used when no custom app provides its own.
 * Colors match the shadcn dark mode defaults used in globals.css.
 * Override by setting a `theme` block in config.json or by deploying
 * a custom app with a theme() export.
 */

import type { AppTheme } from '../src/lib/custom-app.js';

const defaultTheme: AppTheme = {
  appName: 'UBOT',
  logoUrl: undefined,
  faviconUrl: undefined,

  fonts: {
    heading: 'Geist',
    body:    'Geist',
  },
};

export default defaultTheme;
