import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': process.env.DELTAGATE_API ?? 'http://localhost:8000' } }, // dev only: uvicorn deltagate.api:app --port 8000 (or set DELTAGATE_API)
})
