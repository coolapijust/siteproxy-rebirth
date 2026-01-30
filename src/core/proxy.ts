// Proxy Logic Helpers
// Reusable handlers for HTMLRewriter across Worker and Node.js

export class ElementHandler {
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

export class MetaRefreshHandler {
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

// Client-side interceptor script injection
export function getInterceptorScript(workerOrigin: string, targetOrigin: string): string {
    return `
        <script>
            window.__SP_ORIGIN__ = "${targetOrigin}";
            window.__SP_WORKER__ = "${workerOrigin}";
            document.addEventListener('click', e => {
                const a = e.target.closest('a');
                if (a && a.href && !a.href.startsWith(window.__SP_WORKER__) && !a.href.startsWith('javascript:')) {
                    e.preventDefault();
                    window.location.href = window.__SP_WORKER__ + '/' + a.href;
                }
            }, true);
            const originalOpen = window.open;
            window.open = function(url, ...args) {
                if (url && typeof url === 'string' && !url.startsWith(window.__SP_WORKER__)) {
                    url = window.__SP_WORKER__ + '/' + url;
                }
                return originalOpen.call(window, url, ...args);
            };
            // Fetch Interceptor
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
                if (typeof input === 'string' && input.startsWith('http') && !input.startsWith(window.__SP_WORKER__)) {
                    input = window.__SP_WORKER__ + '/' + input;
                } else if (input instanceof Request && input.url.startsWith('http') && !input.url.startsWith(window.__SP_WORKER__)) {
                    input = new Request(window.__SP_WORKER__ + '/' + input.url, input);
                }
                return originalFetch(input, init);
            };
            // XHR Interceptor
            const originalXhrOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...args) {
                if (typeof url === 'string' && url.startsWith('http') && !url.startsWith(window.__SP_WORKER__)) {
                    url = window.__SP_WORKER__ + '/' + url;
                }
                return originalXhrOpen.call(this, method, url, ...args);
            };
        </script>
    `
}
