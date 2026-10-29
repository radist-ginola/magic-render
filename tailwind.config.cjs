module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#070711',
          panel: '#0d0d1a',
          cyan: '#2cf9ff',
          fuchsia: '#ff38d1',
          violet: '#9b5cff',
        },
      },
      boxShadow: {
        'neon-cyan': '0 0 16px rgba(44, 249, 255, .32)',
        'neon-fuchsia': '0 0 16px rgba(255, 56, 209, .28)',
      },
      fontFamily: {
        display: ['Orbitron', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
