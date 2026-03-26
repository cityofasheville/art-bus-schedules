/** @type {import('tailwindcss').Config} */

export default {
  content: ['./src/**/*.{html,js,pug}'],
  theme: {
    extend: {
      spacing: {
        128: '32rem',
      },
      colors: {
        transparent: 'transparent',
        current: 'currentColor',
        'art-blue': '#005daa',
        'art-green': '#4AA91E',
        'aux-red': '#DB3C02',
        'aux-yellow': '#EFFF77',
        'aux-green': '#a0cf67',
        'aux-gray': '#E2ECF6',
        'aux-black': '#1C2634',
        'aux-white': '#F1F5FB',
      },
      hocus: ['&:hover', '&:focus'],
    },
  },
  variants: {
    extend: {
      backgroundColor: ['hover', 'focus', 'group-hover', 'hocus'],
      textColor: ['hover', 'focus', 'group-hover', 'hocus'],
      fontSize: ['hover', 'focus', 'group-hover', 'hocus'],
      textDecoration: ['hover', 'focus', 'group-hover', 'hocus'],
      opacity: ['hover', 'focus', 'group-hover', 'hocus'],
    },
  },
  plugins: [
    function ({ addVariant }) {
      addVariant('hocus', ['&:hover', '&:focus']);
    },
  ],
};
