# SiteProxy rebirth - 您的私人极速网络入口

SiteProxy rebirth是一个部署在 Cloudflare workers 上的轻量级网络访问助手。它无需安装任何插件或客户端，只要有一个浏览器，您就能自由、安全地访问全球互联网。

## ✨ 核心亮点

-   🚀 **零门槛使用**：打开网页即可使用，无需下载、安装或配置任何复杂的代理软件。
-   �️ **隐私优先**：内置隐私保护机制，自动移除追踪代码，隐藏您的真实 IP 地址。
-   ⚡ **极速体验**：基于 Cloudflare 全球边缘网络，无论您身在何处，都能获得极快的加载速度。
-   🔒 **安全访问**：支持设置个人访问密码，防止陌生人滥用您的服务。

## 🌍 推荐浏览场景

我们针对以下站点进行了深度优化，提供近乎原生的浏览体验：

-   **� 新一代搜索**：
    -   **Brave Search**：无追踪、无广告的纯净搜索体验。
    -   **Duck AI**：免费、快速的 AI 对话助手。
-   **📚 知识与资讯**：
    -   **Wikipedia**：畅游人类知识库。
    -   **Time.com**：阅读深度全球资讯。
    -   **GitHub**：浏览热门开源项目 (Trending) 和代码库。
-   **� 社区与讨论**：
    -   **Reddit**：浏览全球最热话题 。

此外，你可以浏览大多数新闻网站，如 BBC,CNN,TIME等。

不推荐：
-使用**Google**搜索，因为Google对数据中心IP（如Cloudflare）非常敏感，容易封锁workers的ip。建议使用内置的Brave Search，体验更佳。
-使用**Netflix**，**Youtube**，**Disney+**等视频网站，大量的流媒体请求易产生错误，项目因维护成本过高不对此修复。
-使用**Gemini**,**ChatGPT**,**Grok**等AI网站，这些网站对ip纯净度要求高，会屏蔽反代的源服务器。您可以使用**Duck AI**，**Brave Search AI**等更透明的AI网站。
-使用**Instagram**，**Facebook**等社交媒体，这些网站的js实现逻辑极为复杂，显示效果不佳。本项目已对**Reddit**做了深度优化。

1.  **访问首页**：打开您的 SiteProxy 部署地址。
2.  **输入目标**：在搜索框直接输入网址（如 `reddit.com`）或关键词。
3.  **开始浏览**：点击“立即前往”，SiteProxy 会自动处理所有中间环节。

> **小技巧**：直接在浏览器地址栏输入 `https://您的域名/https://目标网站` 也可以快速跳转！

## 🛠️ 部署指南

### 方法一：极速部署 (推荐)

1.  **获取代码**：
    直接下载项目根目录中的 [worker.js](./worker.js) 文件（这是已经编译好的单文件版本）。

2.  **上传到 Cloudflare**：
    -   登录 Cloudflare Dashboard。
    -   进入 **Workers & Pages** -> **Create Application** -> **Connect to Git**。
    -   选择您 Fork 的仓库，保存并部署。
3.  **配置密码**：
    在部署后的 Settings -> Variables 中添加 `ACCESS_PASSWORD`。

### 方法二：手动构建上传 (Cloudflare Workers)

如果您不使用 Git 集成，可以手动构建产物：

1.  **安装依赖与构建**：
    ```bash
    npm install
    ```
    -   生成单文件代码：`npm run build:file` (输出为 `dist/worker.js`)
2.  **复制上传**：
    将生成的 `dist/worker.js` 内容复制到 Cloudflare Worker 的代码编辑器中保存。

3.  **配置密码与安全 (重要!)**：
    为了保护您的代理不被滥用，**强烈建议**配置访问密码。
    -   在 Cloudflare Worker 详情页，点击 **Settings** -> **Variables and Secrets**。
    -   点击 **Add** 添加变量：
        -   **Variable name**: `ACCESS_PASSWORD`
        -   **Value**: 输入您想设置的密码
        -   **Encrypt**: 点击右侧的 **Encrypt** 按钮（如果是敏感密码，务必加密）。
    -   点击 **Save and deploy** 重启 Worker 生效。

### 方法三：Node.js 虚拟主机/私有服务器 (✨新内核)

SiteProxy 现已深度支持 Node.js 环境，提供更强的性能和更灵活的资源处理：

1.  **打包构建**：运行 `npm run build:node` 生成生产环境 bundle。
2.  **部署**：将 `dist/` 文件夹上传至您的服务器。
3.  **安装 & 运行**：详见 [Node.js 部署指南](./DEPLOYMENT.md)。

## ⚙️ 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `ACCESS_PASSWORD` | 否 | 访问验证密码。设置后，访问首页将要求输入密码。建议开启加密存储。 |
| `PORT` | 否 | (仅 Node.js) 服务监听端口，默认 `2568`。 |

## 💻 开发者模式 (源码部署)
如果您想自己修改源码：

1.  **安装依赖**：
    ```bash
    npm install
    ```
2.  **本地调试**：
    ```bash
    npm run dev
    ```
3.  **命令行部署**：
    ```bash
    npx wrangler secret put ACCESS_PASSWORD # 设置密码
    npm run deploy
    ```

## 📜 许可协议
MIT License
