/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // OmniFeed dark-first palette
        ink: {
          950: '#07070b',  // app background
          900: '#0d0d14',  // base surface
          850: '#13131d',  // card
          800: '#1a1a26',  // elevated card
          700: '#24242f',  // hover / input
          600: '#30303d',  // border strong
          500: '#4a4a57',
        },
        line: 'rgba(255,255,255,0.08)',
        brand: {
          DEFAULT: '#7c5cff',
          50: '#f1eeff', 100: '#e4ddff', 200: '#cbbcff', 300: '#ad96ff',
          400: '#9375ff', 500: '#7c5cff', 600: '#6b45f5', 700: '#5a34d6',
          800: '#4a2cae', 900: '#3d278a',
        },
        accent: { pink: '#ff5c8a', amber: '#ffb15c', teal: '#2fd4c4' },
        txt: {
          primary: '#f4f4f6',
          secondary: '#a1a1b0',
          muted: '#6c6c7d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,0.4), 0 8px 30px -8px rgba(124,92,255,0.5)',
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 10px 30px -12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'slide-up': { '0%': { opacity: 0, transform: 'translateY(12px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'scale-in': { '0%': { opacity: 0, transform: 'scale(0.96)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.3)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16,1,0.3,1)',
        pop: 'pop 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
