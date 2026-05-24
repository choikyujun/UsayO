/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#534AB7',
        deep: '#26215C',
        accent: '#AFA9EC',
        whisper: '#EEEDFE',
        success: '#1D9E75',
        warning: '#EF9F27',
        danger: '#D85A30',
        error: '#E24B4A',
        darkBg: '#0E0C1F',
        darkCard: '#13112A',
        darkNav: '#09081A',
        darkBorder: '#1E1B3A',
      },
    },
  },
  plugins: [],
};
