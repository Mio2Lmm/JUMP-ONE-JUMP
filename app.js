const state = {
  connected: false,
  running: false,
  targetAvailable: false,
  config: null,
  logCursor: 0,
  logCount: 0,
  confirmAction: null,
  pollBusy: false,
  stopInFlight: false,
};

const elements = {
  connectionBadge: document.getElementById("connectionBadge"),
  connectionText: document.getElementById("connectionText"),
  runtimeBand: document.getElementById("runtimeBand"),
  runtimeIcon: document.getElementById("runtimeIcon"),
  runtimeBadge: document.getElementById("runtimeBadge"),
  runtimeLabel: document.getElementById("runtimeLabel"),
  runtimeCaption: document.getElementById("runtimeCaption"),
  runtimeDescription: document.getElementById("runtimeDescription"),
  runtimePid: document.getElementById("runtimePid"),
  runtimeUptime: document.getElementById("runtimeUptime"),
  startButton: document.getElementById("startButton"),
  stopButton: document.getElementById("stopButton"),
  topStopButton: document.getElementById("topStopButton"),
  sidebarTargetName: document.getElementById("sidebarTargetName"),
  summaryK: document.getElementById("summaryK"),
  summaryB: document.getElementById("summaryB"),
  summarySegments: document.getElementById("summarySegments"),
  summaryRegion: document.getElementById("summaryRegion"),
  logCaption: document.getElementById("logCaption"),
  logOutput: document.getElementById("logOutput"),
  logEmpty: document.getElementById("logEmpty"),
  clearLogsButton: document.getElementById("clearLogsButton"),
  configForm: document.getElementById("configForm"),
  configK: document.getElementById("configK"),
  configB: document.getElementById("configB"),
  segmentRows: document.getElementById("segmentRows"),
  segmentEmpty: document.getElementById("segmentEmpty"),
  configPath: document.getElementById("configPath"),
  configRegion: document.getElementById("configRegion"),
  saveConfigButton: document.getElementById("saveConfigButton"),
  reloadConfigButton: document.getElementById("reloadConfigButton"),
  configSaveHint: document.getElementById("configSaveHint"),
  exitButton: document.getElementById("exitButton"),
  toastRegion: document.getElementById("toastRegion"),
  confirmDialog: document.getElementById("confirmDialog"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmText: document.getElementById("confirmText"),
  confirmAction: document.getElementById("confirmAction"),
  confirmCancel: document.getElementById("confirmCancel"),
};

function icon(name, size = 17) {
  return `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`;
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `请求失败（${response.status}）`);
  }
  return payload;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}时${String(minutes).padStart(2, "0")}分`;
  }
  if (minutes > 0) {
    return `${minutes}分${String(secs).padStart(2, "0")}秒`;
  }
  return `${secs}秒`;
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "--";
}

function regionText(config) {
  const region = config?.GAME_REGION;
  if (!Array.isArray(region) || region.length !== 4) {
    return "未记录";
  }
  return `${region[2]} × ${region[3]}`;
}

function setConnection(connected) {
  state.connected = connected;
  elements.connectionBadge.classList.toggle("is-online", connected);
  elements.connectionBadge.classList.toggle("is-offline", !connected);
  elements.connectionText.textContent = connected ? "面板已连接" : "服务离线";
}

function updateRuntime(status) {
  state.running = Boolean(status.running);
  state.targetAvailable = Boolean(status.target?.available);

  elements.runtimeIcon.classList.toggle("is-running", state.running);
  elements.runtimeIcon.classList.toggle("is-idle", !state.running);
  elements.runtimeBadge.classList.toggle("is-running", state.running);
  elements.runtimeBadge.classList.toggle("is-idle", !state.running);
  elements.runtimeLabel.textContent = state.running ? "正在接管" : "未运行";
  elements.runtimeCaption.textContent = state.running
    ? `已运行 ${formatDuration(status.uptime_seconds)}`
    : state.targetAvailable
      ? "等待启动"
      : "程序未找到";
  elements.runtimeDescription.textContent = state.running
    ? "助手正在监听游戏窗口，右键依次标记起点和目标。"
    : state.targetAvailable
      ? "启动后，助手会在游戏窗口内监听右键操作。"
      : "未找到跳一跳助手程序，请检查原程序位置。";
  elements.runtimePid.textContent = state.running && status.pid ? String(status.pid) : "--";
  elements.runtimeUptime.textContent = state.running
    ? formatDuration(status.uptime_seconds)
    : "--";

  elements.startButton.disabled = state.running || !state.targetAvailable;
  elements.stopButton.disabled = !state.running;
  elements.topStopButton.disabled = !state.running;
  elements.sidebarTargetName.textContent = status.target?.name || "未找到程序";
  elements.sidebarTargetName.title = status.target?.path || "";

  updateConfigAvailability();
}

function updateConfigAvailability() {
  const locked = state.running || !state.config;
  elements.configK.disabled = locked;
  elements.configB.disabled = locked;
  elements.segmentRows.querySelectorAll("input").forEach((input) => {
    input.disabled = locked;
  });
  elements.saveConfigButton.disabled = locked;
  elements.configSaveHint.textContent = state.running
    ? "停止接管后可保存"
    : state.config
      ? "保存后下次启动生效"
      : "参数尚未读取";
}

function createInput(value, field, index, step) {
  const input = document.createElement("input");
  input.className = "ui-input";
  input.type = "number";
  input.step = step;
  input.value = String(value);
  input.dataset.field = field;
  input.dataset.index = String(index);
  input.required = true;
  input.setAttribute("aria-label", `第 ${index + 1} 段 ${field}`);
  return input;
}

function renderSegments(segments) {
  elements.segmentRows.replaceChildren();
  const rows = Array.isArray(segments) ? segments : [];
  rows.forEach((segment, index) => {
    const row = document.createElement("tr");
    ["d_min", "d_max", "k", "b"].forEach((field) => {
      const cell = document.createElement("td");
      const step = field === "k" ? "0.01" : field === "b" ? "0.1" : "1";
      cell.append(createInput(segment[field], field, index, step));
      row.append(cell);
    });
    elements.segmentRows.append(row);
  });
  elements.segmentEmpty.hidden = rows.length > 0;
}

function renderConfig(config, configPath) {
  state.config = config;
  elements.configK.value = Number.isFinite(Number(config.k)) ? String(config.k) : "1.35";
  elements.configB.value = Number.isFinite(Number(config.b)) ? String(config.b) : "0";
  elements.summaryK.textContent = formatNumber(config.k, 2);
  elements.summaryB.textContent = formatNumber(config.b, 2);
  elements.summarySegments.textContent = Array.isArray(config.segments)
    ? `${config.segments.length} 段`
    : "未设置";
  const region = regionText(config);
  elements.summaryRegion.textContent = region;
  elements.configRegion.textContent = region === "未记录" ? "未记录" : `${region} px`;
  elements.configPath.textContent = configPath || "未读取";
  elements.configPath.title = configPath || "";
  renderSegments(config.segments);
  updateConfigAvailability();
}

function collectConfig() {
  const k = Number(elements.configK.value);
  const b = Number(elements.configB.value);
  if (!Number.isFinite(k) || !Number.isFinite(b)) {
    throw new Error("基础参数必须是有效数字");
  }

  const segments = [];
  const rows = Array.from(elements.segmentRows.querySelectorAll("tr"));
  rows.forEach((row) => {
    const segment = {};
    row.querySelectorAll("input").forEach((input) => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) {
        throw new Error("距离分段中存在无效数字");
      }
      segment[input.dataset.field] = value;
    });
    if (segment.d_min >= segment.d_max) {
      throw new Error("距离分段的起始值必须小于结束值");
    }
    segments.push(segment);
  });

  return { k, b, segments };
}

async function refreshConfig(showFeedback = false) {
  try {
    const configPayload = await api("/api/config");
    const statusPayload = await api("/api/status");
    renderConfig(configPayload.config || {}, statusPayload.config_path);
    if (showFeedback) {
      showToast("已重新读取配置文件", "success");
    }
  } catch (error) {
    if (showFeedback) {
      showToast(error.message, "error");
    }
  }
}

async function refreshStatus() {
  try {
    const payload = await api("/api/status");
    setConnection(true);
    updateRuntime(payload);
  } catch {
    setConnection(false);
    state.running = false;
    state.targetAvailable = false;
    elements.topStopButton.disabled = true;
    elements.stopButton.disabled = true;
    elements.startButton.disabled = true;
  }
}

function appendLogs(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return;
  }
  elements.logEmpty?.remove();
  const nearBottom =
    elements.logOutput.scrollHeight - elements.logOutput.scrollTop - elements.logOutput.clientHeight < 72;
  lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = "ui-log-line";
    const time = document.createElement("time");
    time.textContent = line.time || "";
    const text = document.createElement("span");
    text.textContent = line.text || "";
    row.append(time, text);
    elements.logOutput.append(row);
    state.logCount += 1;
  });

  while (elements.logOutput.children.length > 300) {
    elements.logOutput.firstElementChild?.remove();
  }
  elements.logCaption.textContent = `本次打开已显示 ${state.logCount} 行`;
  if (nearBottom) {
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
  }
}

async function refreshLogs() {
  try {
    const payload = await api(`/api/logs?after=${state.logCursor}`);
    appendLogs(payload.lines);
    state.logCursor = Number(payload.next) || state.logCursor;
  } catch {
    // Connection state is handled by the status poll.
  }
}

async function poll() {
  if (state.pollBusy) {
    return;
  }
  state.pollBusy = true;
  await refreshStatus();
  await refreshLogs();
  state.pollBusy = false;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `ui-toast${type === "error" ? " is-error" : type === "success" ? " is-success" : ""}`;
  const iconName = type === "error" ? "circle-alert" : type === "success" ? "circle-check" : "info";
  const mark = document.createElement("span");
  mark.className = "ui-toast-icon";
  mark.innerHTML = icon(iconName);
  const text = document.createElement("span");
  text.textContent = message;
  const close = document.createElement("button");
  close.className = "ui-toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "关闭提示");
  close.innerHTML = "×";
  close.addEventListener("click", () => toast.remove());
  toast.append(mark, text, close);
  elements.toastRegion.append(toast);
  refreshIcons();
  window.setTimeout(() => toast.remove(), 4200);
}

function openConfirm({
  title,
  text,
  action,
  iconName = "square",
  confirmLabel = "确认停止",
  danger = true,
}) {
  state.confirmAction = action;
  elements.confirmTitle.textContent = title;
  elements.confirmText.textContent = text;
  elements.confirmAction.textContent = confirmLabel;
  elements.confirmAction.className = danger ? "ui-btn ui-btn-danger" : "ui-btn ui-btn-primary";
  const iconBox = document.getElementById("confirmIcon");
  iconBox.innerHTML = icon(iconName, 20);
  refreshIcons();
  elements.confirmDialog.showModal();
}

async function startAssistant() {
  elements.startButton.disabled = true;
  try {
    await api("/api/start", { method: "POST", body: "{}" });
    showToast("助手已启动，请在游戏窗口内右键取点", "success");
    await refreshStatus();
    await refreshLogs();
  } catch (error) {
    showToast(error.message, "error");
    await refreshStatus();
  }
}

async function stopAssistant() {
  if (state.stopInFlight) {
    return;
  }
  state.stopInFlight = true;
  try {
    await api("/api/stop", { method: "POST", body: "{}" });
    showToast("助手已停止", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.stopInFlight = false;
  }
  await refreshStatus();
  await refreshLogs();
}

function switchView(view) {
  document.querySelectorAll(".ui-view").forEach((panel) => {
    const active = panel.dataset.panel === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".ui-nav-item[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  const titles = { dashboard: "控制台", parameters: "参数校准", guide: "使用说明" };
  document.title = `${titles[view] || "控制台"} · 跳一跳助手`;
  window.scrollTo({ top: 0, behavior: "auto" });
}

const FLUID_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
let activeFluidMorph = null;
let fluidMorphToken = 0;

function cancelFluidMorph() {
  if (!activeFluidMorph) {
    return;
  }
  activeFluidMorph.animation?.cancel();
  activeFluidMorph.contentAnimation?.cancel();
  activeFluidMorph.element.remove();
  activeFluidMorph = null;
}

function navigateToView(view, trigger) {
  const currentView = document.querySelector(".ui-view.is-active")?.dataset.panel;
  if (view === currentView) {
    switchView(view);
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const source =
    trigger?.closest?.(".ui-nav-item[data-view]") ||
    document.querySelector(`.ui-nav-item[data-view="${view}"]`);
  const targetPanel = document.querySelector(`[data-panel="${view}"]`);

  if (reduceMotion || !source || !targetPanel) {
    switchView(view);
    return;
  }

  cancelFluidMorph();
  const token = ++fluidMorphToken;
  const sourceRect = source.getBoundingClientRect();
  const sourceRadius = getComputedStyle(source).borderRadius;
  const morph = document.createElement("div");
  const label = document.createElement("div");
  morph.className = "ui-fluid-morph";
  label.className = "ui-fluid-morph-label";
  label.innerHTML = source.innerHTML;
  morph.append(label);
  morph.style.left = `${sourceRect.left}px`;
  morph.style.top = `${sourceRect.top}px`;
  morph.style.width = `${sourceRect.width}px`;
  morph.style.height = `${sourceRect.height}px`;
  morph.style.borderRadius = sourceRadius;
  document.body.append(morph);

  switchView(view);
  const targetRect = targetPanel.getBoundingClientRect();
  const targetFrame = {
    left: `${targetRect.left}px`,
    top: `${targetRect.top}px`,
    width: `${targetRect.width}px`,
    height: `${targetRect.height}px`,
    borderRadius: "8px",
  };

  const animation = morph.animate(
    [
      {
        left: `${sourceRect.left}px`,
        top: `${sourceRect.top}px`,
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
        borderRadius: sourceRadius,
        backgroundColor: "rgba(239, 246, 255, 0.92)",
        borderColor: "rgba(191, 219, 254, 0.9)",
        opacity: 1,
      },
      {
        ...targetFrame,
        backgroundColor: "rgba(239, 246, 255, 0.18)",
        borderColor: "rgba(96, 165, 250, 0.24)",
        opacity: 1,
        offset: 0.72,
      },
      {
        ...targetFrame,
        backgroundColor: "rgba(239, 246, 255, 0)",
        borderColor: "rgba(96, 165, 250, 0)",
        opacity: 0,
      },
    ],
    {
      duration: 560,
      easing: FLUID_EASING,
      fill: "both",
    }
  );

  const contentAnimation = targetPanel.animate(
    [
      { opacity: 0.36, transform: "scale(0.997)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    {
      duration: 420,
      easing: FLUID_EASING,
    }
  );

  label.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(-2px)" },
    ],
    {
      duration: 210,
      easing: "ease-out",
      fill: "both",
    }
  );

  activeFluidMorph = { element: morph, animation, contentAnimation };
  animation.finished
    .catch(() => {})
    .finally(() => {
      if (token !== fluidMorphToken) {
        return;
      }
      morph.remove();
      activeFluidMorph = null;
    });
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => navigateToView(button.dataset.view, button));
});

elements.startButton.addEventListener("click", startAssistant);
elements.stopButton.addEventListener("click", () => {
  openConfirm({
    title: "停止接管",
    text: "将先向助手发送 Esc，若未退出再结束进程。",
    action: stopAssistant,
    iconName: "square",
    confirmLabel: "确认停止",
  });
});
elements.topStopButton.addEventListener("click", () => {
  openConfirm({
    title: "停止接管",
    text: "确认停止当前正在运行的助手吗？",
    action: stopAssistant,
    iconName: "square",
    confirmLabel: "确认停止",
  });
});

elements.confirmCancel.addEventListener("click", () => {
  state.confirmAction = null;
  elements.confirmDialog.close();
});
elements.confirmAction.addEventListener("click", async () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  elements.confirmDialog.close();
  if (action) {
    await action();
  }
});
elements.confirmDialog.addEventListener("close", () => {
  state.confirmAction = null;
});

elements.configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = collectConfig();
    const result = await api("/api/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const status = await api("/api/status");
    renderConfig(result.config, status.config_path);
    showToast("参数已保存，下次启动时生效", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
});

elements.reloadConfigButton.addEventListener("click", () => refreshConfig(true));

elements.clearLogsButton.addEventListener("click", () => {
  elements.logOutput.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "ui-log-empty";
  empty.innerHTML = `${icon("terminal")}<span>当前显示已清空，新日志会继续出现。</span>`;
  elements.logOutput.append(empty);
  state.logCount = 0;
  elements.logCaption.textContent = "当前显示已清空";
  refreshIcons();
});

elements.exitButton.addEventListener("click", () => {
  openConfirm({
    title: "退出控制面板",
    text: state.running
      ? "退出前会先停止正在运行的助手。"
      : "退出后将关闭本地控制面板服务。",
    action: async () => {
      try {
        await api("/api/shutdown", { method: "POST", body: "{}" });
      } finally {
        document.body.classList.add("ui-app-closing");
        window.close();
      }
    },
    iconName: "power",
    confirmLabel: "确认退出",
  });
});

window.addEventListener("keydown", (event) => {
  if (
    event.key !== "Escape" ||
    event.repeat ||
    !state.running ||
    elements.confirmDialog.open
  ) {
    return;
  }
  event.preventDefault();
  stopAssistant();
});

async function init() {
  refreshIcons();
  await refreshStatus();
  await refreshConfig(false);
  await refreshLogs();
  window.setInterval(poll, 1200);
}

init();
