// Esbuild configuration for Node.js bundle
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

async function build() {
    console.log('🔨 Building Node.js bundle...')

    const builtinModules = require('module').builtinModules;

    await esbuild.build({
        entryPoints: ['src/node.ts'],
        bundle: true,
        platform: 'node',
        target: 'node18',
        outfile: 'dist/server.mjs',
        format: 'esm',
        minify: true, // Let's minify now to save space
        sourcemap: false,
        external: ['htmlrewriter', ...builtinModules, ...builtinModules.map(m => `node:${m}`)],
        banner: {
            js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`
        }
    })

    // Clean up old .js files to avoid confusion
    const oldFiles = ['server.js', 'server.js.map', 'index.js', 'index.js.map'];
    oldFiles.forEach(f => {
        const p = path.join(__dirname, 'dist', f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    // Copy required files from htmlrewriter package to dist
    const libDist = path.join(__dirname, 'node_modules', 'htmlrewriter', 'dist')
    const filesToCopy = ['html_rewriter_bg.wasm', 'html_rewriter.js', 'html_rewriter_wrapper.js', 'asyncify.js']

    filesToCopy.forEach(file => {
        const src = path.join(libDist, file)
        const dest = path.join(__dirname, 'dist', file)
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest)
            console.log(`✅ Copied ${file} to dist/`)
        } else {
            console.warn(`⚠️ File not found at: ${src}`)
        }
    })

    // Also copy node.mjs for proper initialization
    const nodeMjs = path.join(__dirname, 'node_modules', 'htmlrewriter', 'node.mjs')
    if (fs.existsSync(nodeMjs)) {
        fs.copyFileSync(nodeMjs, path.join(__dirname, 'dist', 'node.mjs'))
        console.log('✅ Copied node.mjs to dist/')
    }

    // Generate a minimal production package.json
    const prodPackageJson = {
        name: "siteproxy-prod",
        version: "1.0.0",
        type: "module",
        main: "server.mjs",
        scripts: {
            start: "node server.mjs"
        },
        dependencies: {
            "htmlrewriter": "*"
        }
    }
    fs.writeFileSync(
        path.join(__dirname, 'dist', 'package.json'),
        JSON.stringify(prodPackageJson, null, 2)
    )
    console.log('✅ Generated minimal package.json in dist/')

    console.log('✅ Build complete! Output: dist/server.js, dist/package.json, dist/html_rewriter_bg.wasm')
}

build().catch(err => {
    console.error('Build failed:', err)
    process.exit(1)
})
