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
        toy: '0 4px 0 0 rgba(59,48,36,0.12)', // 「ポンッ」感を出す軽い影
        'toy-lg': '0 6px 0 0 rgba(59,48,36,0.16)',
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
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
