import next from 'eslint-config-next/core-web-vitals'

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**'],
  },
  ...next,
]

export default config
