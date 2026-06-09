/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        wmi: {
          deep: '#020818',
          dark: '#050A1F',
          navy: '#0A1628',
          mid: '#0D1B3E',
          elevated: '#111D40',
        },
        blue: {
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          900: '#1E3A8A',
        },
        cyan: {
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
          glow: '#00D4FF',
        },
      },
      borderRadius: {
        lg: '14px',
        xl: '20px',
        '2xl': '28px',
      },
      boxShadow: {
        'blue-sm': '0 0 15px rgba(37,99,235,0.2)',
        'blue-md': '0 0 30px rgba(37,99,235,0.3)',
        'blue-lg': '0 0 60px rgba(37,99,235,0.4)',
        'button': '0 4px 20px rgba(37,99,235,0.4)',
        'button-hover': '0 8px 30px rgba(37,99,235,0.6)',
      },
    },
  },
  plugins: [],
}
