# SiteProxy Node.js 部署指南

项目已针对 Node.js 环境深度优化，支持 GitHub, Reddit 等复杂站点的代理。以下是分析部署步骤：
在开发目录执行：
```bash
npm run build:node
```
这将在 `dist/` 目录下生成生产环境所需的所有文件。我也为你清理了目录，现在只会生成 `.mjs` 模块化文件，不会再有 `.js` 混淆。

## 2. 上传文件
将 `dist/` 目录下的以下**核心文件**上传到您的服务器：
- `server.mjs` (核心逻辑 - **已修复 ESM `require` 报错**)
- `package.json` (生产依赖配置)
- `node.mjs`, `html_rewriter_bg.wasm`, `html_rewriter.js`, `html_rewriter_wrapper.js`, `asyncify.js` (WASM 相关支持文件)

## 3. 安装依赖
在服务器的上传目录执行（确保 `package.json` 也在）：
```bash
npm install
```

## 4. 配置环境变量
确保设置了 `ACCESS_PASSWORD`。

## 5. 启动服务
```bash
node server.mjs
```
*提示：由于使用了原生 ESM，如果您的 Node.js 环境是 v20+，它能完美支持。*

## 注意事项
- **Node.js 版本**：建议使用 Node.js 18 或更高版本（以支持内置 `fetch`）。
- **广告拦截**：如果部署后仍发现部分资源加载失败，请检查浏览器是否开启了加强版跟踪保护。
