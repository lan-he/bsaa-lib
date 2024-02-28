import { defineConfig } from 'vite'
import inject from '@rollup/plugin-inject'

export default defineConfig({
    build: {
        rollupOptions: {
            plugins: [inject({ Buffer: ['Buffer', 'Buffer'] })],
        },
        lib: {
            entry: './lib/main.ts',
            name: 'Counter',
            fileName: 'counter',
        },
    },
})
