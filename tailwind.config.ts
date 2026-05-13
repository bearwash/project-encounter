import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ENCOUNTER ネオン UI 用の暫定カラー
        neon: {
          DEFAULT: '#39ff14',
          pink: '#ff2bd6',
          cyan: '#00f0ff',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
