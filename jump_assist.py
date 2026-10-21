import json, time, threading, ctypes, sys, os
from ctypes import wintypes

import numpy as np
import pyautogui, mss
from pynput import keyboard, mouse

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0
BASE_W = 720
MIN_LOGIC_DISTANCE = 20.0
MAX_LOGIC_DISTANCE = 820.0
MAX_PRESS_MS = 1800.0
BASE_DIR = os.path.dirname(
    os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__)
)
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
CAL_PATH = os.path.join(BASE_DIR, "cal.json")

WM_RBUTTONDOWN = 0x0204
WM_RBUTTONUP = 0x0205


def load_json(p, default):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        try:
            with open(p, encoding="utf-8") as f:
                rows = [json.loads(line) for line in f if line.strip()]
            return rows if rows else default
        except Exception:
            return default


def save_json(p, obj):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


def find_game_window():
    import pygetwindow as gw
    candidates = []
    for w in gw.getAllWindows():
        t = w.title or ""
        if ("跳一跳" in t or "微信" in t) and w.width > 200 and w.height > 200:
            candidates.append(w)
    if not candidates:
        return None

    def score(window):
        title = " ".join((window.title or "").split())
        value = 0
        if title in ("跳一跳", "微信"):
            value += 1000
        elif title.startswith("跳一跳") or title.startswith("微信"):
            value += 300
        lowered = title.lower()
        if any(
            browser in lowered
            for browser in ("microsoft edge", "google chrome", "firefox", "mozilla")
        ):
            value -= 800
        return value, window.width * window.height

    return max(candidates, key=score)


def get_region(cfg):
    window = find_game_window()
    if window is not None:
        return [window.left, window.top, window.width, window.height]
    r = cfg.get("GAME_REGION")
    if r and len(r) == 4 and r[2] > 50 and r[3] > 50:
        return r
    import cv2

    with mss.mss() as sct:
        img = np.array(sct.grab(sct.monitors[1]))[:, :, :3]
    print("未找到游戏窗口，请框选游戏画布后按回车")
    r = cv2.selectROI("select game region", img, showCrosshair=False)
    cv2.destroyAllWindows()
    return [int(r[0]), int(r[1]), int(r[2]), int(r[3])]


def press_ms(d_logic, cfg):
    for s in cfg.get("segments", []):
        if s["d_min"] <= d_logic < s["d_max"]:
            return s["k"] * d_logic + s["b"]
    return cfg.get("k", 1.35) * d_logic + cfg.get("b", 0)


def activate_game_window():
    try:
        from ctypes import wintypes

        window = find_game_window()
        if window is None:
            return False
        hwnd = window._hWnd
        user32 = ctypes.windll.user32
        user32.SetWindowPos.argtypes = [
            wintypes.HWND,
            wintypes.HWND,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            wintypes.UINT,
        ]
        user32.SetWindowPos(
            hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040
        )
        foreground = user32.GetForegroundWindow()
        foreground_thread = user32.GetWindowThreadProcessId(foreground, None)
        target_thread = user32.GetWindowThreadProcessId(hwnd, None)
        user32.AttachThreadInput(foreground_thread, target_thread, True)
        user32.SetForegroundWindow(hwnd)
        user32.BringWindowToTop(hwnd)
        user32.AttachThreadInput(foreground_thread, target_thread, False)
        time.sleep(0.03)
        return window
    except Exception:
        return False


def fit_from_cal():
    data = load_json(CAL_PATH, [])
    valid = []
    for x in data:
        try:
            if abs(float(x["offset"])) <= 50 and float(x["d"]) > 0:
                valid.append(x)
        except Exception:
            pass
    data = valid
    cfg = load_json(CONFIG_PATH, {})
    k_old = cfg.get("k", 1.35)
    b_old = cfg.get("b", 0)
    if len(data) < 20:
        print(f"cal.json 有效样本不足（{len(data)}<20），保持 k={k_old}, b={b_old}")
        print("可先跑几跳，手动微调 config.json 的 k：跳过头就减小，没到就增大")
        return
    ds = np.array([x["d"] for x in data], dtype=float)
    offs = np.array([x["offset"] for x in data], dtype=float)
    slope, intercept = np.polyfit(ds, offs, 1)
    dk = float(np.clip(-slope, -0.05, 0.05))
    db = float(np.clip(-intercept, -10, 10))
    k_new = round(float(np.clip(k_old + dk, 0.8, 2.5)), 4)
    b_new = round(float(np.clip(b_old + db, -50, 50)), 2)
    cfg["k"] = k_new
    cfg["b"] = b_new
    segs = []
    for lo, hi in [(0, 200), (200, 420), (420, 720)]:
        m = (ds >= lo) & (ds < hi)
        if m.sum() >= 8:
            s_sl, s_int = np.polyfit(ds[m], offs[m], 1)
            segs.append(
                {
                    "d_min": lo,
                    "d_max": hi,
                    "k": round(float(np.clip(k_old - s_sl, 0.8, 2.5)), 4),
                    "b": round(float(np.clip(b_old - s_int, -50, 50)), 2),
                }
            )
    if len(segs) == 3:
        cfg["segments"] = segs
    save_json(CONFIG_PATH, cfg)
    print(
        f"拟合完成：k={k_new}, b={b_new}, segments={'已写入' if 'segments' in cfg else '未启用'}"
    )
    print(f"样本数 {len(data)}，斜率 {slope:.4f}，截距 {intercept:.2f}")


def main():
    cfg = load_json(CONFIG_PATH, {})
    if "--fit" in sys.argv:
        fit_from_cal()
        return

    region = get_region(cfg)
    cfg["GAME_REGION"] = region
    save_json(CONFIG_PATH, cfg)
    window = activate_game_window()
    scale = BASE_W / (window.width if window else region[2])

    print(f"游戏区域 {region}，缩放 {scale:.3f}")
    print(f"当前参数 k={cfg.get('k', 1.35)}, b={cfg.get('b', 0)}")
    print("操作：右键点棋子底部中心 → 再右键点目标平台中心；Esc 退出")

    state = {
        "start": None,
        "hwnd": window._hWnd if window else None,
        "last_click": 0.0,
    }
    lock = threading.Lock()
    executing = threading.Event()

    def do_press(sx, sy, mx, my):
        pressed = False
        try:
            d_screen = ((mx - sx) ** 2 + (my - sy) ** 2) ** 0.5
            live_window = activate_game_window()
            if live_window:
                state["hwnd"] = live_window._hWnd
            live_scale = (
                BASE_W / live_window.width if live_window else scale
            )
            d_logic = d_screen * live_scale
            ms = press_ms(d_logic, cfg)
            if not (MIN_LOGIC_DISTANCE <= d_logic <= MAX_LOGIC_DISTANCE):
                print(f"忽略异常距离：{d_logic:.1f}px")
                return
            if not (0 < ms <= MAX_PRESS_MS):
                print(f"忽略异常按压时长：{ms:.0f}ms")
                return
            print(f"[终点] ({mx},{my}) 逻辑距离 {d_logic:.1f}px → 按压 {ms:.0f}ms")
            time.sleep(0.03)
            pyautogui.mouseDown(button="left")
            pressed = True
            time.sleep(max(0.02, ms / 1000.0))
            print("已执行，右键点下一跳起点")
        except Exception as exc:
            print(f"执行异常：{exc}")
        finally:
            if pressed:
                try:
                    pyautogui.mouseUp(button="left")
                except Exception:
                    previous = pyautogui.FAILSAFE
                    pyautogui.FAILSAFE = False
                    try:
                        pyautogui.mouseUp(button="left")
                    except Exception:
                        pass
                    finally:
                        pyautogui.FAILSAFE = previous
            executing.clear()

    def handle_right_click(x, y):
        if executing.is_set():
            return
        now = time.monotonic()
        if now - state["last_click"] < 0.2:
            return
        state["last_click"] = now
        if not lock.acquire(blocking=False):
            return
        try:
            if state["start"] is None:
                state["start"] = (x, y)
                print(f"[起点] ({x},{y}) → 右键点目标中心")
            else:
                sx, sy = state["start"]
                state["start"] = None
                executing.set()
                threading.Thread(
                    target=do_press, args=(sx, sy, x, y), daemon=True
                ).start()
        finally:
            lock.release()

    started_at = time.monotonic()
    stop_event = threading.Event()

    def on_press(key):
        if key == keyboard.Key.esc and time.monotonic() - started_at > 0.8:
            stop_event.set()

    listener_ref = {"listener": None}

    def win32_event_filter(msg, data):
        if msg in (WM_RBUTTONDOWN, WM_RBUTTONUP):
            hwnd = state.get("hwnd")
            if not hwnd:
                return True
            rect = wintypes.RECT()
            if not ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                return True
            x = int(data.pt.x)
            y = int(data.pt.y)
            inside = (
                rect.left <= x < rect.right
                and rect.top <= y < rect.bottom
            )
            if not inside:
                return True
            if msg == WM_RBUTTONDOWN:
                handle_right_click(x, y)
            listener = listener_ref.get("listener")
            if listener is not None:
                listener.suppress_event()
        return True

    keyboard_listener = keyboard.Listener(on_press=on_press)
    keyboard_listener.start()
    mouse_listener = mouse.Listener(
        on_click=lambda *args: None,
        win32_event_filter=win32_event_filter,
    )
    listener_ref["listener"] = mouse_listener
    mouse_listener.start()
    mouse_listener.wait()
    stop_event.wait()
    mouse_listener.stop()
    keyboard_listener.stop()
    print("已退出")


if __name__ == "__main__":
    main()
