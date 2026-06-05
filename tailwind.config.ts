import type { Config } from 'tailwindcss';

// パレット方針: docs/要件定義.md §3.3
// 「ノスタルジック・ポップ × おもちゃ箱」— 明るく親しみやすい、過剰なネオンを避ける。
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#FAF1E0',
          soft: '#FFFAF0',
          deep: '#E8DCC5',
        },
        ink: {
          DEFAULT: '#3B3024',
          soft: '#6B5A47',
          muted: '#9C8D7A',
        },
        pop: {
          red: '#E55A4C',
          orange: '#F5A623',
          yellow: '#FFD23F',
          green: '#76C25B',
          blue: '#5DA9E9',
          purple: '#A47BC0',
        },
      },
      boxShadow: {
        // Neo-Brutalism 風のズレ影。要件 §3.3「おもちゃ箱」の手触りを強化する。
        // 縦のみの軽影 (旧) からハードな黒影 + 横ズレに刷新。
        toy: '3px 3px 0 0 rgba(59,48,36,0.85)',
        'toy-lg': '5px 5px 0 0 rgba(59,48,36,0.9)',
        // 旧来の縦影を保持したい箇所用 (脈動ボタンなど) は別エイリアス
        'toy-soft': '0 4px 0 0 rgba(59,48,36,0.12)',
      },
      borderRadius: {
        toy: '14px',
      },
      keyframes: {
        'bounce-in': {
          '0%':   { transform: 'translateY(8px) scale(0.96)', opacity: '0' },
          '60%':  { transform: 'translateY(-2px) scale(1.02)', opacity: '1' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        toddle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-2px)' },
        },
        breath: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%':      { transform: 'scale(1.04)' },
        },
      },
      animation: {
        'bounce-in': 'bounce-in 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        toddle: 'toddle 900ms ease-in-out infinite',
        breath: 'breath 2200ms ease-in-out infinite',
      },
      fontFamily: {
        // 全画面 (next/font が --font-rounded を <html> に注入する)
        sans: ['var(--font-rounded)', 'system-ui', 'sans-serif'],
        display: ['var(--font-rounded)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
