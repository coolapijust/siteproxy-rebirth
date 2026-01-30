// Node.js Entry Point
// Uses the same logic as Worker but with htmlrewriter polyfill for Node.js

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { html } from 'hono/html'
import { getCookie, setCookie } from 'hono/cookie'
import { config } from 'dotenv'
// Use the htmlrewriter package - a proper Cloudflare HTMLRewriter polyfill for Node.js
import { HTMLRewriter } from 'htmlrewriter'

// Load environment variables
config()


type Bindings = {
    ACCESS_PASSWORD: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Inject process.env into c.env for compatibility with Hono's Worker-style API
app.use('/*', async (c, next) => {
    c.env = {
        ACCESS_PASSWORD: process.env.ACCESS_PASSWORD || ''
    } as Bindings
    return next()
})

// Enable CORS
app.use('/*', cors())

// Password authentication middleware
app.use('/*', async (c, next) => {
    const password = c.env.ACCESS_PASSWORD
    if (!password) return next()

    const authCookie = getCookie(c, '__sp_session')
    if (authCookie === password) return next()

    if (c.req.method === 'POST' && new URL(c.req.url).pathname === '/') {
        const formData = await c.req.parseBody()
        if (formData['password'] === password) {
            setCookie(c, '__sp_session', password, {
                path: '/', secure: true, httpOnly: true, sameSite: 'Lax', maxAge: 86400 * 7
            })
            return c.redirect('/')
        }
    }

    return c.html(renderLoginPage())
})

// Main proxy route
app.all('/*', async (c) => {
    const urlStr = c.req.url
    const urlObj = new URL(urlStr)
    const workerOrigin = urlObj.origin

    const path = urlObj.pathname + urlObj.search
    let targetUrlStr = urlStr.replace(workerOrigin + '/', '')

    // Homepage
    if (targetUrlStr === '' || targetUrlStr === '/') {
        return c.html(renderHomePage(workerOrigin))
    }

    // Referer / Cookie fallback
    if (!targetUrlStr.startsWith('http')) {
        let fallbackOrigin = ''
        const referer = c.req.header('Referer')

        if (referer && referer.startsWith(workerOrigin)) {
            const refPath = referer.replace(workerOrigin + '/', '')
            const originMatch = refPath.match(/^https?:\/\/[^\/]+/)
            if (originMatch) fallbackOrigin = originMatch[0]
        }

        if (!fallbackOrigin) {
            const cookieOrigin = getCookie(c, '__sp_origin')
            if (cookieOrigin && cookieOrigin.startsWith('http')) fallbackOrigin = cookieOrigin
        }

        if (fallbackOrigin) {
            targetUrlStr = `${fallbackOrigin}${path}`
        } else if (targetUrlStr.includes('.')) {
            targetUrlStr = 'https://' + targetUrlStr
        } else {
            return c.text('无法解析目标 URL', 400)
        }
    }

    let targetUrl: URL
    try {
        targetUrl = new URL(targetUrlStr)
    } catch (e) {
        return c.text('无效的目标 URL', 400)
    }

    // Build request headers
    const newReqHeaders = new Headers()
    const originalHeaders = c.req.header()

    // Copy allow-listed headers from original request
    const preservedHeaders = ['user-agent', 'accept', 'accept-language', 'cookie', 'authorization', 'content-type']
    preservedHeaders.forEach(h => {
        const val = originalHeaders[h]
        if (val) newReqHeaders.set(h, val)
    })

    newReqHeaders.set('Host', targetUrl.host)
    newReqHeaders.set('Referer', targetUrl.origin)
    newReqHeaders.set('Origin', targetUrl.origin)
    // !! CRITICAL: Force identity encoding for ALL requests to prevent compressed responses
    newReqHeaders.set('Accept-Encoding', 'identity')

    try {
        const fetchOptions: any = {
            method: c.req.method,
            headers: newReqHeaders,
            redirect: 'manual',
            duplex: 'half', // Required for streaming body in Node.js
            signal: c.req.raw.signal // !! CRITICAL: Free resources immediately if client disconnects
        }

        // Body is only allowed for methods other than GET/HEAD
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
            fetchOptions.body = c.req.raw.body
        }

        const res = await fetch(targetUrl.href, fetchOptions)

        const resHeaders = new Headers(res.headers)
        resHeaders.set('Access-Control-Allow-Origin', '*')
        resHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
        resHeaders.set('Access-Control-Allow-Headers', '*')
        resHeaders.delete('Content-Security-Policy')
        resHeaders.delete('Content-Security-Policy-Report-Only')
        resHeaders.delete('X-Frame-Options')
        resHeaders.delete('Referrer-Policy')
        resHeaders.delete('X-Content-Type-Options')
        // !! CRITICAL: Remove encoding header from response as well to prevent browser from trying to decompress identity data
        resHeaders.delete('Content-Encoding')
        // Remove SRI related headers
        resHeaders.delete('Source-Map')
        resHeaders.delete('X-SourceMap')

        // Handle redirects
        if (resHeaders.has('Location')) {
            const loc = resHeaders.get('Location')
            if (loc) {
                if (loc.startsWith('http')) resHeaders.set('Location', `${workerOrigin}/${loc}`)
                else if (loc.startsWith('//')) resHeaders.set('Location', `${workerOrigin}/https:${loc}`)
                else if (loc.startsWith('/')) resHeaders.set('Location', `${workerOrigin}/${targetUrl.origin}${loc}`)
            }
        }

        // Rewrite cookie domains
        const setCookies = res.headers.getSetCookie()
        if (setCookies.length > 0) {
            resHeaders.delete('Set-Cookie')
            for (const cookie of setCookies) {
                resHeaders.append('Set-Cookie', cookie.replace(/Domain=[^;]+;?/gi, ''))
            }
        }

        const contentType = resHeaders.get('content-type')
        if (contentType && contentType.includes('text/html')) {
            setCookie(c, '__sp_origin', targetUrl.origin, {
                path: '/', secure: true, httpOnly: true, sameSite: 'None', maxAge: 864000
            })

            // Clean up headers that might cause issues during/after transformation
            resHeaders.delete('Content-Length')
            resHeaders.delete('Content-Encoding')

            return new HTMLRewriter()
                .on('meta[http-equiv="refresh"]', new MetaRefreshHandler(workerOrigin, targetUrl.origin))
                .on('meta[name="referrer"]', { element(e: any) { e.remove() } })
                .on('head', {
                    element(e: any) {
                        e.append(`
                        <script>
                            (function() {
                                const worker = "${workerOrigin}";
                                const target = "${targetUrl.origin}";
                                function rewriteUrl(url) {
                                    if (!url || typeof url !== 'string' || url.startsWith(worker) || url.startsWith('javascript:') || url.startsWith('data:')) return url;
                                    if (url.startsWith('http')) return worker + '/' + url;
                                    if (url.startsWith('//')) return worker + '/https:' + url;
                                    if (url.startsWith('/')) return worker + '/' + target + url;
                                    return url;
                                }
                                document.addEventListener('click', e => {
                                    const a = e.target.closest('a');
                                    if (a && a.href) {
                                        const rewritten = rewriteUrl(a.getAttribute('href'));
                                        if (rewritten !== a.getAttribute('href')) {
                                            const absoluteHref = a.href;
                                            if (absoluteHref.startsWith('http') && !absoluteHref.startsWith(worker)) {
                                                e.preventDefault();
                                                window.location.href = worker + '/' + absoluteHref;
                                            }
                                        }
                                    }
                                }, true);
                                const originalOpen = window.open;
                                window.open = function(url, ...args) { return originalOpen.call(window, rewriteUrl(url), ...args); };
                                const originalFetch = window.fetch;
                                window.fetch = function(input, init) {
                                    if (typeof input === 'string') input = rewriteUrl(input);
                                    else if (input instanceof Request) {
                                        const newUrl = rewriteUrl(input.url);
                                        if (newUrl !== input.url) input = new Request(newUrl, input);
                                    }
                                    return originalFetch(input, init);
                                };
                                const originalXhrOpen = XMLHttpRequest.prototype.open;
                                XMLHttpRequest.prototype.open = function(method, url, ...args) {
                                    return originalXhrOpen.call(this, method, rewriteUrl(url), ...args);
                                };
                                if (navigator.sendBeacon) {
                                    const originalSendBeacon = navigator.sendBeacon;
                                    navigator.sendBeacon = function(url, data) {
                                        return originalSendBeacon.call(navigator, rewriteUrl(url), data);
                                    };
                                }
                            })();
                        </script>
                        `, { html: true })
                    }
                })
                .on('a', new ElementHandler('href', workerOrigin, targetUrl.origin))
                .on('img', new ElementHandler('src', workerOrigin, targetUrl.origin))
                .on('img', new ElementHandler('srcset', workerOrigin, targetUrl.origin))
                .on('link', new ElementHandler('href', workerOrigin, targetUrl.origin))
                .on('script', new ElementHandler('src', workerOrigin, targetUrl.origin))
                .on('form', new ElementHandler('action', workerOrigin, targetUrl.origin))
                .on('iframe', new ElementHandler('src', workerOrigin, targetUrl.origin))
                .on('source', new ElementHandler('src', workerOrigin, targetUrl.origin))
                .on('source', new ElementHandler('srcset', workerOrigin, targetUrl.origin))
                .on('video', new ElementHandler('src', workerOrigin, targetUrl.origin))
                .on('audio', new ElementHandler('src', workerOrigin, targetUrl.origin))
                .on('track', new ElementHandler('src', workerOrigin, targetUrl.origin))
                .on('[data-src]', new ElementHandler('data-src', workerOrigin, targetUrl.origin))
                .on('[data-href]', new ElementHandler('data-href', workerOrigin, targetUrl.origin))
                .on('[data-url]', new ElementHandler('data-url', workerOrigin, targetUrl.origin))
                .on('script[integrity], link[integrity], img[integrity]', {
                    element(e: any) {
                        e.removeAttribute('integrity');
                    }
                })
                .on('script[crossorigin], link[crossorigin], img[crossorigin]', {
                    element(e: any) {
                        e.removeAttribute('crossorigin');
                    }
                })
                .transform(new Response(res.body, { status: res.status, headers: resHeaders }))
        }

        return new Response(res.body, { status: res.status, headers: resHeaders })
    } catch (e) {
        console.error(`[Proxy Error] ${targetUrlStr}:`, e)
        return c.text(`代理错误: ${e}`, 500)
    }
})

// Helper Classes (copied from Worker version for direct compatibility)
class ElementHandler {
    constructor(private attr: string, private workerOrigin: string, private targetOrigin: string) { }
    element(e: any) {
        const val = e.getAttribute(this.attr)
        if (val) {
            if (val.startsWith(this.workerOrigin)) return
            if (val.startsWith('http')) e.setAttribute(this.attr, `${this.workerOrigin}/${val}`)
            else if (val.startsWith('//')) e.setAttribute(this.attr, `${this.workerOrigin}/https:${val}`)
            else if (val.startsWith('/')) e.setAttribute(this.attr, `${this.workerOrigin}/${this.targetOrigin}${val}`)
        }
    }
}

class MetaRefreshHandler {
    constructor(private workerOrigin: string, private targetOrigin: string) { }
    element(e: any) {
        const content = e.getAttribute('content')
        if (content) {
            const parts = content.split(/url=/i)
            if (parts.length === 2) {
                let target = parts[1].trim()
                if (target.startsWith('http')) target = `${this.workerOrigin}/${target}`
                else if (target.startsWith('/')) target = `${this.workerOrigin}/${this.targetOrigin}${target}`
                e.setAttribute('content', `${parts[0]}url=${target}`)
            }
        }
    }
}

// Page Renderers
function renderLoginPage() {
    return html`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SiteProxy - 验证</title>
        <style>
            body { margin: 0; font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #0f172a, #1e1b4b); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
            .box { background: rgba(255,255,255,0.05); padding: 40px; border-radius: 16px; text-align: center; max-width: 360px; }
            h1 { margin-bottom: 20px; }
            input { width: 100%; padding: 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: transparent; color: white; font-size: 1rem; margin-bottom: 16px; box-sizing: border-box; }
            button { width: 100%; padding: 12px; background: #6366f1; border: none; color: white; font-weight: bold; border-radius: 8px; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="box">
            <h1>🔒 访问验证</h1>
            <form method="POST">
                <input type="text" name="username" value="admin" style="display:none" autocomplete="username">
                <input type="password" name="password" placeholder="请输入访问密码" required autofocus autocomplete="current-password">
                <button type="submit">验证</button>
            </form>
        </div>
    </body>
    </html>
    `
}

function renderHomePage(origin: string) {
    const sites = [
        { name: 'Brave Search', url: 'https://search.brave.com', icon: '🦁' },
        { name: 'Wikipedia', url: 'https://www.wikipedia.org', icon: '📖' },
        { name: 'Duck AI', url: 'https://duckduckgo.com/?ia=chat', icon: '🦆' },
        { name: 'GitHub Trending', url: 'https://github.com/trending', icon: '📈' },
        { name: 'Time', url: 'https://time.com', icon: '⏱️' },
        { name: 'Reddit', url: 'https://www.reddit.com', icon: '🔥' }
    ]

    return html`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SiteProxy - 极速导航</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            :root { --primary: #6366f1; }
            body { margin: 0; font-family: 'Outfit', sans-serif; background: linear-gradient(135deg, #0f172a, #1e1b4b); color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
            .container { max-width: 800px; width: 100%; text-align: center; animation: fadeIn 0.8s ease-out; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            h1 { font-size: 3.5rem; font-weight: 600; margin-bottom: 0.5rem; background: linear-gradient(to right, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #94a3b8; font-size: 1.1rem; margin-bottom: 2.5rem; }
            .search-box { background: rgba(255,255,255,0.05); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); padding: 10px; border-radius: 20px; display: flex; margin-bottom: 3rem; transition: all 0.3s; }
            .search-box:focus-within { border-color: var(--primary); box-shadow: 0 0 20px rgba(99,102,241,0.3); transform: scale(1.02); }
            input { background: transparent; border: none; color: white; flex: 1; padding: 15px 25px; font-size: 1.1rem; outline: none; }
            button { background: var(--primary); border: none; color: white; padding: 0 30px; border-radius: 12px; font-weight: 600; cursor: pointer; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 20px; }
            .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 25px 15px; border-radius: 24px; text-decoration: none; color: white; transition: all 0.4s; display: flex; flex-direction: column; align-items: center; gap: 12px; }
            .card:hover { transform: translateY(-8px); border-color: rgba(99,102,241,0.5); background: rgba(255,255,255,0.1); }
            .card-icon { font-size: 2rem; }
            footer { margin-top: auto; padding: 40px; color: #64748b; font-size: 0.9rem; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>SiteProxy</h1>
            <p>自由、安全、隐私的全球网络访问入口</p>
            <div class="search-box">
                <input type="text" id="urlInput" placeholder="输入网址 (例如: reddit.com)" onkeypress="if(event.keyCode==13) go()">
                <button onclick="go()">立即前往</button>
            </div>
            <div class="grid">
                ${sites.map(site => html`
                    <a href="${origin}/${site.url}" class="card">
                        <span class="card-icon">${site.icon}</span>
                        <span class="card-name">${site.name}</span>
                    </a>
                `)}
            </div>
        </div>
        <footer>&copy; 2026 SiteProxy</footer>
        <script>
            function go() {
                const v = document.getElementById('urlInput').value.trim();
                if (!v) return;
                window.location.href = '${origin}/' + (v.startsWith('http') ? v : 'https://' + v);
            }
        </script>
    </body>
    </html>
    `
}

// Start the server
const port = parseInt(process.env.PORT || '2568', 10)

console.log(`🚀 SiteProxy Node.js server starting on port ${port}...`)

try {
    serve({
        fetch: app.fetch,
        port
    })
    console.log(`✅ Server running at http://localhost:${port}`)
} catch (err) {
    console.error('❌ Failed to start server:', err)
    process.exit(1)
}
