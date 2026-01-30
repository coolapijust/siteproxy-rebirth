// Core Hono Application
// Shared routing logic for both Worker and Node.js

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie } from 'hono/cookie'
import { renderLoginPage, renderHomePage } from './ui'
import { ElementHandler, MetaRefreshHandler, getInterceptorScript } from './proxy'

// Type for environment bindings
export type Bindings = {
    ACCESS_PASSWORD?: string
}

// Create and configure the Hono app
export function createApp(app = new Hono<{ Bindings: Bindings }>()) {

    // CORS middleware
    app.use('/*', cors())

    // Password authentication middleware
    app.use('/*', async (c, next) => {
        const password = c.env?.ACCESS_PASSWORD
        if (!password) return next()

        const authCookie = getCookie(c, '__sp_session')
        if (authCookie === password) return next()

        if (c.req.method === 'POST') {
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
        const newReqHeaders = new Headers(c.req.header())
        newReqHeaders.set('Host', targetUrl.host)
        newReqHeaders.set('Referer', targetUrl.origin)
        newReqHeaders.set('Origin', targetUrl.origin)
        newReqHeaders.delete('cf-connecting-ip')
        newReqHeaders.delete('cf-ipcountry')
        newReqHeaders.delete('cf-ray')
        newReqHeaders.delete('cf-visitor')
        newReqHeaders.delete('Accept-Encoding') // Force identity to avoid compressed responses
        newReqHeaders.set('User-Agent', c.req.header('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        try {
            const res = await fetch(targetUrl.href, {
                method: c.req.method,
                headers: newReqHeaders,
                body: c.req.raw.body,
                redirect: 'manual'
            })

            const resHeaders = new Headers(res.headers)
            resHeaders.set('Access-Control-Allow-Origin', '*')
            resHeaders.delete('Content-Security-Policy')
            resHeaders.delete('X-Frame-Options')
            resHeaders.delete('Referrer-Policy')

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

                // Delete headers that might interfere with transformation or causes mismatches
                resHeaders.delete('Content-Length')
                resHeaders.delete('Content-Encoding')

                // Use global HTMLRewriter (injected by runtime)
                return new (globalThis as any).HTMLRewriter()
                    .on('meta[http-equiv="refresh"]', new MetaRefreshHandler(workerOrigin, targetUrl.origin))
                    .on('meta[name="referrer"]', { element(e: any) { e.remove() } })
                    .on('head', {
                        element(e: any) {
                            e.append(getInterceptorScript(workerOrigin, targetUrl.origin), { html: true })
                        }
                    })
                    .on('a', new ElementHandler('href', workerOrigin, targetUrl.origin))
                    .on('img', new ElementHandler('src', workerOrigin, targetUrl.origin))
                    .on('link', new ElementHandler('href', workerOrigin, targetUrl.origin))
                    .on('script', new ElementHandler('src', workerOrigin, targetUrl.origin))
                    .on('form', new ElementHandler('action', workerOrigin, targetUrl.origin))
                    .on('iframe', new ElementHandler('src', workerOrigin, targetUrl.origin))
                    .on('[data-src]', new ElementHandler('data-src', workerOrigin, targetUrl.origin))
                    .on('[data-href]', new ElementHandler('data-href', workerOrigin, targetUrl.origin))
                    .on('[data-url]', new ElementHandler('data-url', workerOrigin, targetUrl.origin))
                    .transform(new Response(res.body, { status: res.status, headers: resHeaders }))
            }

            return new Response(res.body, { status: res.status, headers: resHeaders })
        } catch (e) {
            return c.text(`代理错误: ${e}`, 500)
        }
    })

    return app
}
