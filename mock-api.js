/* 静态演示适配层（仅用于静态部署版）
 * 原控制面板的所有数据都来自本地 Python 服务 /api/*。
 * 静态页没有后端，这里拦截 fetch，用内存中的模拟数据顶替。
 * 真实使用请运行 server.py，它直接服务 ui/ 目录，不加载本文件。
 */
(function () {
  "use strict";

  const STORAGE_KEY = "jump-assist-ui.demo.config.v1";
  const TICK_MS = 2600;
  const DEFAULT_CONFIG = {
    k: 1.35,
    b: 0,
    GAME_REGION: [0, 0, 2560, 1600],
    segments: [
      { d_min: 120, d_max: 360, k: 1.42, b: -2.5 },
      { d_min: 360, d_max: 720, k: 1.33, b: 1.8 },
      { d_min: 720, d_max: 1200, k: 1.28, b: 4.2 },
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadConfig() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return { ...clone(DEFAULT_CONFIG), ...parsed };
        }
      }
    } catch {
      /* 隐私模式下 localStorage 不可用，回落到默认值 */
    }
    return clone(DEFAULT_CONFIG);
  }

  function saveConfig(config) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* 忽略写入失败，演示页不要求持久化 */
    }
  }

  const store = {
    running: false,
    startedAt: 0,
    pid: null,
    logs: [],
    seq: 0,
    lastTick: 0,
    config: loadConfig(),
  };

  function stamp(offsetSeconds) {
    const date = new Date(Date.now() + (offsetSeconds || 0) * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function push(text, offsetSeconds) {
    store.seq += 1;
    store.logs.push({ id: store.seq, time: stamp(offsetSeconds), text });
    if (store.logs.length > 800) {
      store.logs.splice(0, store.logs.length - 800);
    }
  }

  const JUMP_POINTS = [
    [812, 642, 1046, 498],
    [1046, 498, 1204, 690],
    [1204, 690, 1024, 838],
    [1024, 838, 1188, 986],
    [1188, 986, 902, 1042],
  ];

  let jumpIndex = 0;

  function stepJump(offsetSeconds) {
    const point = JUMP_POINTS[jumpIndex % JUMP_POINTS.length];
    jumpIndex += 1;
    const distance = Math.round(Math.hypot(point[2] - point[0], point[3] - point[1]));
    const press = Math.round(distance * store.config.k + Number(store.config.b || 0));
    push(`识别起点 (${point[0]}, ${point[1]})`, offsetSeconds);
    push(`锁定目标 (${point[2]}, ${point[3]})`, offsetSeconds + 0.4);
    push(`距离 ${distance} px → 按住 ${press} ms`, offsetSeconds + 0.7);
    push("跳跃完成，等待下一次标记", offsetSeconds + 1.4);
  }

  function advance() {
    if (!store.running) {
      store.lastTick = Date.now();
      return;
    }
    const now = Date.now();
    if (!store.lastTick) {
      store.lastTick = now;
      return;
    }
    let ticks = Math.floor((now - store.lastTick) / TICK_MS);
    if (ticks <= 0) {
      return;
    }
    if (ticks > 4) {
      ticks = 4;
      store.lastTick = now - TICK_MS * 4;
    }
    for (let i = 0; i < ticks; i += 1) {
      stepJump(-(ticks - i) * (TICK_MS / 1000));
    }
    store.lastTick += ticks * TICK_MS;
  }

  function statusPayload() {
    return {
      ok: true,
      app: "jump-assist-ui",
      running: store.running,
      pid: store.running ? store.pid : null,
      exit_code: null,
      uptime_seconds: store.running
        ? Math.round((Date.now() - store.startedAt) / 100) / 10
        : 0,
      target: {
        name: "跳一跳助手.exe",
        path: "静态演示 · 未连接本机程序",
        available: true,
      },
      config_path: "演示模式 · 配置文件不会写入",
    };
  }

  function apiResponse(payload, status) {
    return new Response(JSON.stringify(payload), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  function handle(method, pathname, search, body) {
    if (pathname === "/api/health") {
      return apiResponse({ ok: true, app: "jump-assist-ui", demo: true });
    }
    if (pathname === "/api/status") {
      advance();
      return apiResponse(statusPayload());
    }
    if (pathname === "/api/config") {
      if (method === "POST") {
        if (store.running) {
          return apiResponse({ ok: false, error: "请先停止接管，再保存参数" }, 409);
        }
        const incoming = body && typeof body === "object" ? body : {};
        if (incoming.segments && Array.isArray(incoming.segments)) {
          for (const item of incoming.segments) {
            if (Number(item.d_min) >= Number(item.d_max)) {
              return apiResponse(
                { ok: false, error: "距离分段的起始值必须小于结束值" },
                400
              );
            }
          }
          store.config.segments = incoming.segments.map((item) => ({
            d_min: Number(item.d_min),
            d_max: Number(item.d_max),
            k: Number(item.k),
            b: Number(item.b),
          }));
        }
        if (incoming.k !== undefined) {
          store.config.k = Number(incoming.k);
        }
        if (incoming.b !== undefined) {
          store.config.b = Number(incoming.b);
        }
        saveConfig(store.config);
        return apiResponse({ ok: true, config: clone(store.config) });
      }
      return apiResponse({ ok: true, config: clone(store.config) });
    }
    if (pathname === "/api/logs") {
      advance();
      const after = Number(new URLSearchParams(search).get("after") || 0);
      const lines = store.logs.filter((item) => item.id > after);
      return apiResponse({ ok: true, lines, next: store.seq });
    }
    if (pathname === "/api/start") {
      if (store.running) {
        return apiResponse({ ok: false, error: "助手已在运行" }, 409);
      }
      store.running = true;
      store.startedAt = Date.now();
      store.pid = 1000 + Math.floor(Math.random() * 8000);
      store.lastTick = Date.now();
      push("演示模式：静态页面不会启动本机程序");
      push("已启动 跳一跳助手.exe");
      push("助手已就绪，等待在游戏窗口内右键取点");
      return apiResponse(statusPayload());
    }
    if (pathname === "/api/stop") {
      const stopped = store.running;
      if (stopped) {
        push("正在发送 Esc 停止信号");
        push("进程已退出（代码 0）");
      }
      store.running = false;
      store.lastTick = 0;
      return apiResponse({ ok: true, stopped, ...statusPayload() });
    }
    if (pathname === "/api/shutdown") {
      store.running = false;
      return apiResponse({ ok: true });
    }
    return apiResponse({ ok: false, error: "未知接口" }, 404);
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    const request = typeof input === "string" ? input : input && input.url;
    if (!request) {
      return originalFetch(input, init);
    }
    let url;
    try {
      url = new URL(request, window.location.href);
    } catch {
      return originalFetch(input, init);
    }
    if (url.origin !== window.location.origin || !/\/api(\/|$)/.test(url.pathname)) {
      return originalFetch(input, init);
    }
    const apiPath = "/api/" + url.pathname.split("/api/")[1];
    const method = String((init && init.method) || "GET").toUpperCase();
    let body = null;
    if (init && typeof init.body === "string" && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = null;
      }
    }
    return Promise.resolve(handle(method, apiPath, url.search, body));
  };

  function injectBanner() {
    const banner = document.createElement("div");
    banner.setAttribute(
      "style",
      [
        "position:fixed",
        "left:16px",
        "bottom:16px",
        "z-index:2147483000",
        "display:flex",
        "align-items:center",
        "gap:8px",
        "padding:8px 14px",
        "border-radius:999px",
        "background:rgba(15,23,42,.86)",
        "color:#e2e8f0",
        "font:500 12px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif",
        "box-shadow:0 8px 24px rgba(15,23,42,.28)",
        "backdrop-filter:blur(6px)",
        "pointer-events:none",
      ].join(";")
    );
    banner.innerHTML =
      '<span style="width:7px;height:7px;border-radius:50%;background:#38bdf8"></span>' +
      "<span>静态演示 · 数据为模拟，不会操作真实程序</span>";
    const attach = () => document.body.appendChild(banner);
    if (document.body) {
      attach();
    } else {
      document.addEventListener("DOMContentLoaded", attach);
    }
  }

  injectBanner();
})();
