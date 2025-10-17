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
        'art-blue': '#005ead',
        'art-green': '#51ac3c',
        'aux-red': '#EF4444',
        'aux-maroon': '#9D174D',
        'aux-orange': '#FB923C',
        'aux-yellow': '#FACC15',
        'aux-green': '#a1cd60',
        'aux-blue': '#60A5FA',
        'aux-lavender': '#6366F1',
        'aux-purple': '#6B21A8',
        'aux-gray': '#F8F9FA',
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
