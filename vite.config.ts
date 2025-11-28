import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Basic declaration to avoid TypeScript errors if @types/node is missing
declare const process: { env: { [key: string]: string | undefined } };

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', 
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: parseInt(process.env.PORT || '5173'), // Use Render's PORT or default to 5173
    allowedHosts: true, // Allow all hosts (fixes the "Blocked request" error on Render)
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '4173'),
    allowedHosts: true, // Allow all hosts in preview mode as well
  },
  build: {
    outDir: 'dist',
  }
})