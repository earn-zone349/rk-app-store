/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#141821',
        paper: '#F6F5F1',
        brand: {
          50: '#EEF4FF',
          100: '#D9E6FF',
          300: '#8FB4FF',
          500: '#3D6EFF',
          600: '#2C54DB',
          700: '#213FAA',
          900: '#152352',
        },
        signal: {
          amber: '#E8A33D',
          green: '#2FA36B',
          red: '#D64545',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
}
