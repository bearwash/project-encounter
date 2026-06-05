import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'src-tauri/**',
      '.playwright-mcp/**',
      '*.png',
      '*.jpg',
      '*.jpeg',
      '*.obj',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
];

export default config;
