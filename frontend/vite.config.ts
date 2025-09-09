import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    // Default to FastAPI dev port if not provided
    const target = env.VITE_API_URL || 'http://localhost:3001'
    return {
        plugins: [react()],
        server: {
            port: 5173,
            host: true,
            open: false,
            proxy: {
                '/api': {
                    target,
                    changeOrigin: true,
                    secure: false,
                },
                '/health': {
                    target,
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
        build: {
            outDir: 'dist',
            sourcemap: process.env.NODE_ENV !== 'production',
            minify: 'terser',
            target: 'es2020',
            rollupOptions: {
                output: {
                    manualChunks: {
                        vendor: ['react', 'react-dom'],
                    },
                    chunkFileNames: 'assets/js/[name]-[hash].js',
                    entryFileNames: 'assets/js/[name]-[hash].js',
                    assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
                },
            },
            chunkSizeWarningLimit: 1000,
            assetsInlineLimit: 4096,
        },
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: './src/test/setup.ts',
        },
    }
})
