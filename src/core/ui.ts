// UI Templates (Login + Home Page)
import { html } from 'hono/html'

export function renderLoginPage() {
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

export function renderHomePage(origin: string) {
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
