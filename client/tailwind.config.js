/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F1F3EE',
        panel: '#F8F9F6',
        ink: '#12303B',
        muted: '#5B6E72',
        rule: '#C8D0C9',
        accent: '#2438C9',
        good: '#1F8A5B',
        warn: '#B98100',
        poor: '#C23B22',
      },
      fontFamily: {
        // Serif for headings and measured values (reads like a lab report); plain sans for the interface.
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', '"Book Antiqua"', 'Georgia', 'serif'],
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '4px' },
    },
  },
  plugins: [],
};
