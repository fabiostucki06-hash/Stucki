/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        'apple-blue': '#007AFF',
        'apple-green': '#34C759',
        'apple-orange': '#FF9500',
        'apple-red': '#FF3B30',
        'apple-purple': '#AF52DE',
        'apple-teal': '#32ADE6',
        'apple-yellow': '#FFCC00',
        'apple-indigo': '#5856D6',
      },
    },
  },
  plugins: [],
}
