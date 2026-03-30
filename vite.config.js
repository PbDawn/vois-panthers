import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: Change 'vois-panthers' to your actual GitHub repo name
export default defineConfig({
  plugins: [react()],
  base: '/vois-panthers/',
})
