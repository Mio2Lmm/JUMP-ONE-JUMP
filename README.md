# JUMP-ONE-JUMP · 跳一跳半自动辅助工具

「跳一跳助手」的桌面控制面板前端：启动助手、查看运行状态、编辑距离分段参数、阅读校准说明。

**在线演示：<https://mio2lmm.github.io/JUMP-ONE-JUMP/>**

## 关于这个仓库

这里是**纯静态演示版**：页面上的运行状态、PID、日志、参数都由 `mock-api.js` 在浏览器里模拟，不会启动任何程序，也不会操作鼠标。左下角常驻「静态演示 · 数据为模拟」标识。

真实版本需要在本机运行 `server.py`（Python 3，监听 `127.0.0.1:8765`）：它服务 `ui/` 目录并提供 `/api/*` 接口，与这个演示站点互不影响。

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 三个视图：控制台 / 参数校准 / 使用说明 |
| `styles.css` | 面板样式，含 ≤1023px 的窄屏适配 |
| `app.js` | 页面交互、状态轮询、日志渲染 |
| `mock-api.js` | 演示层：拦截 `/api/*` 返回模拟数据 |
| `vendor/` | Bootstrap 5.3.3 与 Lucide 0.468.0 的本地副本，页面不发外网请求 |

## 本地打开

直接双击 `index.html` 即可，也可以：

```powershell
python -m http.server 8000
# 打开 http://127.0.0.1:8000/
```

## 更新

源项目在本地 `project24-跳一跳助手UI`：改完 `ui/` 后执行 `node build-static.mjs` 生成 `site/`，再把 `site/` 的内容推到本仓库 `main` 分支。GitHub Pages 从 `main` 根目录发布，`.nojekyll` 已就位。

## 许可

仅用于个人学习与朋友间交流。Bootstrap（MIT）与 Lucide（ISC）的版权归各自作者，详见 `vendor/NOTICE.txt`。
