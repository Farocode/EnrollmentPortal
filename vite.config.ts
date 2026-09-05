import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this as a project site at
  // https://<user>.github.io/EnrollmentPortal/ — base must match the repo
  // name so built asset URLs resolve correctly under that subpath.
  base: '/EnrollmentPortal/',
})
