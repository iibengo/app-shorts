import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: '#09090b',
          surface: '#18181b',
          text: '#fafafa',
          muted: '#a1a1aa',
          violet: '#a78bfa',
          fuchsia: '#e879f9',
          'violet-deep': '#7c3aed',
          'fuchsia-deep': '#c026d3',
        },
      },
      keyframes: {
        'brand-glow': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.08)' },
        },
      },
      animation: {
        'brand-glow': 'brand-glow 10s ease-in-out infinite',
      },
    },
  },
} satisfies Config
