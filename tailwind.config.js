/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/popup/index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#0c1018',
        raised: '#121826',
        surface: '#161d2a',
        inset: '#1c2433',
        lift: '#243044',
        line: '#2c3546',
        ink: '#e8ebf2',
        mute: '#9aa4b5',
        faint: '#7a8494',
        brand: {
          DEFAULT: '#2F6FE4',
          hover: '#3d7aeb',
          ring: '#82A9EF',
          fg: '#d5e3fb',
        },
        ok: {
          DEFAULT: '#6ea57c',
          fg: '#b5dcc3',
          dim: '#102018',
        },
        warn: {
          DEFAULT: '#c4a056',
          fg: '#e8d5a3',
          dim: '#1c1810',
        },
        danger: {
          DEFAULT: '#c46b6b',
          fg: '#ecc8c8',
          dim: '#1c1214',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
