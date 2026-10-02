import RFB from "@novnc/novnc";
import {
  ChevronRight,
  Download,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Keyboard,
  Maximize2,
  Monitor,
  Pencil,
  Power,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Undo2,
  Upload,
  Usb,
  Volume2,
  VolumeX,
  X,
  createIcons,
} from "lucide";
import "./styles.css";

const iconSet = {
  ChevronRight,
  Download,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Keyboard,
  Maximize2,
  Monitor,
  Pencil,
  Power,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Undo2,
  Upload,
  Usb,
  Volume2,
  VolumeX,
  X,
};

function renderIcons() {
  createIcons({ icons: iconSet });
}

renderIcons();

const screen = document.querySelector("#screen");
const screenState = document.querySelector("#screen-state");
const statusText = document.querySelector("#status-text");
const statusNode = document.querySelector(".connection-state");
const powerButton = document.querySelector("#device-power");
const reconnectButton = document.querySelector("#reconnect");
const fullscreenButton = document.querySelector("#fullscreen");
const deviceFrame = document.querySelector("#device-frame");
const audioElement = document.querySelector("#audio-stream");
const audioToggle = document.querySelector("#audio-toggle");
const audioVolume = document.querySelector("#audio-volume");
const audioVolumeValue = document.querySelector("#audio-volume-value");
const usbConnectedToggle = document.querySelector("#usb-connected");
const usbState = document.querySelector("#usb-state");
const keyboardDeck = document.querySelector("#keyboard-deck");
const keyboardState = document.querySelector("#keyboard-state");

const keyMap = {
  up: { keysym: 0xff52, code: "ArrowUp" },
  down: { keysym: 0xff54, code: "ArrowDown" },
  left: { keysym: 0xff51, code: "ArrowLeft" },
  right: { keysym: 0xff53, code: "ArrowRight" },
  enter: { keysym: 0xff0d, code: "Enter" },
  escape: { keysym: 0xff1b, code: "Escape" },
};
for (const digit of "1234567890") {
  keyMap[digit] = {
    keysym: digit.charCodeAt(0),
    code: `Digit${digit}`,
  };
}
for (const letter of "abcdefghijklmnopqrstuvwxyz") {
  keyMap[letter] = {
    keysym: letter.charCodeAt(0),
    code: `Key${letter.toUpperCase()}`,
  };
}
Object.assign(keyMap, {
  directory: { keysym: 0xffc9, code: "F12" },
  pronounce: { keysym: 0xffbe, code: "F1" },
  shift: { keysym: 0xffe1, code: "ShiftLeft" },
  pageUp: { keysym: 0xff55, code: "PageUp" },
  pageDown: { keysym: 0xff56, code: "PageDown" },
  help: { keysym: 0xffc8, code: "F11" },
  start: { keysym: 0xffc2, code: "F5" },
  systemMenu: { keysym: 0xffc3, code: "F6" },
  exit9288: { keysym: 0xff1b, code: "Escape" },
  delete: { keysym: 0xffff, code: "Delete" },
  inputMethod: { keysym: 0xff67, code: "ContextMenu" },
  space: { keysym: 0x20, code: "Space" },
});

const matrixPhysicalActions = {
  Escape: "exit9288",
  F1: "pronounce",
  F5: "start",
  F6: "systemMenu",
  F11: "help",
  Delete: "delete",
  ContextMenu: "inputMethod",
  Space: "space",
  Enter: "enter",
  NumpadEnter: "enter",
  PageUp: "pageUp",
  PageDown: "pageDown",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  F12: "directory",
};
for (const digit of "1234567890") {
  matrixPhysicalActions[`Digit${digit}`] = digit;
  matrixPhysicalActions[`Numpad${digit}`] = digit;
}
for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  matrixPhysicalActions[`Key${letter}`] = letter.toLowerCase();
}

const matrixRows = [
  [..."12345"].map((key) => ({ label: key, key })),
  [..."67890"].map((key) => ({ label: key, key })),
  [
    ..."QWERTYUIOP".split("").map((key) => ({
      label: key,
      key: key.toLowerCase(),
    })),
    { label: "删除", key: "delete", weight: 1.25, role: "function" },
  ],
  [
    ..."ASDFGHJKL".split("").map((key) => ({
      label: key,
      key: key.toLowerCase(),
    })),
    { label: "空格", key: "space", weight: 1.25 },
  ],
  [
    {
      label: "Shift",
      key: "shift",
      weight: 1.35,
      role: "function",
      shiftToggle: true,
    },
    ..."ZXCVBNM".split("").map((key) => ({
      label: key,
      key: key.toLowerCase(),
    })),
    { label: "上翻", key: "pageUp", weight: 1.25, role: "function" },
    { label: "下翻", key: "pageDown", weight: 1.25, role: "function" },
  ],
  [
    { label: "目录", key: "directory", weight: 1.2, role: "function" },
    { label: "开始", key: "start", weight: 1.2, role: "function" },
    { label: "菜单", key: "systemMenu", weight: 1.2, role: "function" },
    { label: "发音", key: "pronounce", weight: 1.2, role: "function" },
    { label: "输入法", key: "inputMethod", weight: 1.35, role: "function" },
    { label: "帮助", key: "help", weight: 1.2, role: "function" },
    { label: "跳出", key: "exit9288", weight: 1.5, role: "exit" },
    { label: "输入", key: "enter", weight: 1.5, role: "confirm" },
    { label: "↑", key: "up", role: "direction" },
    { label: "←", key: "left", role: "direction" },
    { label: "↓", key: "down", role: "direction" },
    { label: "→", key: "right", role: "direction" },
  ],
];

function buildMatrixKeyboard() {
  let keyCount = 0;
  for (const rowDefinition of matrixRows) {
    const row = document.createElement("div");
    row.className = "matrix-row";
    for (const definition of rowDefinition) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "matrix-key";
      button.textContent = definition.label;
      button.dataset.key = definition.key;
      button.dataset.role = definition.role || "key";
      button.title = definition.label;
      button.setAttribute("aria-label", definition.label);
      button.style.setProperty("--key-weight", String(definition.weight || 1));
      if (definition.shiftToggle) {
        button.dataset.shiftToggle = "true";
        button.setAttribute("aria-pressed", "false");
      }
      row.append(button);
      keyCount++;
    }
    keyboardDeck.append(row);
  }
  if (keyCount !== 53) {
    throw new Error(`9288 Web keyboard must have 53 keys, got ${keyCount}`);
  }
}

buildMatrixKeyboard();
// The firmware scans the physical key matrix at a relatively slow cadence.
// Keep quick Web taps asserted long enough to cross a complete scan window.
const minimumKeyHoldMs = 180;

let rfb = null;
let reconnectTimer = null;
let manualDisconnect = false;
let powerBusy = false;
let audioEnabled = false;
let audioReconnectTimer = null;
let audioSession = 0;
let audioOffset = 0;
let audioAbortController = null;
let audioMediaSource = null;
let audioSourceBuffer = null;
let audioObjectUrl = null;
let matrixShiftArmed = false;
let keyboardStateTimer = null;
const keyboardPresses = new Map();
const deviceKeyResetters = new Set();

function setMatrixShiftArmed(armed) {
  matrixShiftArmed = armed;
  const shiftButton = keyboardDeck.querySelector("[data-shift-toggle]");
  shiftButton?.classList.toggle("is-armed", armed);
  shiftButton?.setAttribute("aria-pressed", String(armed));
  keyboardState.textContent = armed
    ? "Shift 已锁定：请选择一个字母或数字"
    : "点击按键或直接使用电脑键盘";
}

function announceMatrixKey(label) {
  window.clearTimeout(keyboardStateTimer);
  keyboardState.textContent = `已发送：${label}`;
  keyboardStateTimer = window.setTimeout(() => {
    if (!matrixShiftArmed) {
      keyboardState.textContent = "点击按键或直接使用电脑键盘";
    }
  }, 1400);
}

const savedVolume = Number.parseFloat(
  window.localStorage.getItem("bbk9288.audioVolume") || "0.8",
);
audioElement.volume = Number.isFinite(savedVolume)
  ? Math.min(1, Math.max(0, savedVolume))
  : 0.8;
audioVolume.value = String(audioElement.volume);

function audioStreamUrl(offset) {
  return `/api/audio/stream?offset=${offset}&session=${Date.now()}`;
}

function setAudioState() {
  const muted = audioElement.muted || audioElement.volume === 0;
  audioToggle.dataset.enabled = String(audioEnabled);
  audioToggle.dataset.muted = String(muted);
  audioToggle.title = !audioEnabled
    ? "启用声音"
    : muted
      ? "取消静音"
      : "静音";
  audioToggle.setAttribute("aria-label", audioToggle.title);
  audioVolumeValue.value = `${Math.round(audioElement.volume * 100)}%`;
}

function closeAudioPipeline() {
  audioAbortController?.abort();
  audioAbortController = null;
  if (audioSourceBuffer?.updating) {
    try {
      audioSourceBuffer.abort();
    } catch {
      // The MediaSource may already be closing.
    }
  }
  audioSourceBuffer = null;
  audioMediaSource = null;
  audioElement.pause();
  audioElement.removeAttribute("src");
  audioElement.load();
  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = null;
  }
}

function waitForMediaSourceOpen(mediaSource) {
  if (mediaSource.readyState === "open") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const opened = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("浏览器音频缓冲初始化失败"));
    };
    const cleanup = () => {
      mediaSource.removeEventListener("sourceopen", opened);
      mediaSource.removeEventListener("sourceclose", failed);
    };
    mediaSource.addEventListener("sourceopen", opened, { once: true });
    mediaSource.addEventListener("sourceclose", failed, { once: true });
  });
}

function runSourceBufferOperation(operation) {
  return new Promise((resolve, reject) => {
    const sourceBuffer = audioSourceBuffer;
    if (!sourceBuffer || audioMediaSource?.readyState !== "open") {
      reject(new Error("浏览器音频缓冲已关闭"));
      return;
    }
    const completed = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("浏览器无法追加音频码流"));
    };
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", completed);
      sourceBuffer.removeEventListener("error", failed);
    };
    sourceBuffer.addEventListener("updateend", completed, { once: true });
    sourceBuffer.addEventListener("error", failed, { once: true });
    try {
      operation(sourceBuffer);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function appendAudioChunk(chunk, session) {
  if (session !== audioSession || !audioSourceBuffer) {
    return;
  }
  await runSourceBufferOperation((sourceBuffer) => {
    sourceBuffer.appendBuffer(chunk);
  });
  if (
    audioElement.currentTime > 30 &&
    audioSourceBuffer?.buffered.length > 0
  ) {
    const removeBefore = audioElement.currentTime - 20;
    if (audioSourceBuffer.buffered.start(0) < removeBefore) {
      await runSourceBufferOperation((sourceBuffer) => {
        sourceBuffer.remove(0, removeBefore);
      });
    }
  }
}

async function pumpAudioStream(session) {
  while (audioEnabled && session === audioSession) {
    let received = 0;
    audioAbortController = new AbortController();
    const response = await fetch(audioStreamUrl(audioOffset), {
      cache: "no-store",
      signal: audioAbortController.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`音频流连接失败 (${response.status})`);
    }

    const reader = response.body.getReader();
    while (audioEnabled && session === audioSession) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      audioOffset += value.byteLength;
      await appendAudioChunk(value, session);
      if (audioElement.paused && !audioElement.muted) {
        audioElement.play().catch((error) => {
          if (error.name !== "AbortError") {
            console.error("audio playback failed", error);
          }
        });
      }
    }

    if (received === 0 && audioEnabled && session === audioSession) {
      const status = await apiRequest("/api/status");
      if ((Number(status.audioBytes) || 0) < audioOffset) {
        audioOffset = 0;
      }
    }
  }
}

async function openAudioStream() {
  if (!audioEnabled) {
    return;
  }
  window.clearTimeout(audioReconnectTimer);
  const session = ++audioSession;
  closeAudioPipeline();
  try {
    const status = await apiRequest("/api/status");
    if (!audioEnabled || session !== audioSession) {
      return;
    }
    audioOffset = Math.max(0, Number(status.audioBytes) || 0);

    if (
      typeof MediaSource === "undefined" ||
      !MediaSource.isTypeSupported("audio/mpeg")
    ) {
      audioElement.src = audioStreamUrl(audioOffset);
      audioElement.load();
      audioElement.play().catch((error) => {
        if (error.name !== "AbortError") {
          console.error("audio playback failed", error);
        }
      });
      return;
    }

    audioMediaSource = new MediaSource();
    audioObjectUrl = URL.createObjectURL(audioMediaSource);
    audioElement.src = audioObjectUrl;
    audioElement.load();
    const playing = audioElement.play();
    if (playing) {
      playing.catch((error) => {
        if (error.name !== "AbortError") {
          console.error("audio playback failed", error);
        }
      });
    }
    await waitForMediaSourceOpen(audioMediaSource);
    if (!audioEnabled || session !== audioSession) {
      return;
    }
    audioSourceBuffer = audioMediaSource.addSourceBuffer("audio/mpeg");
    audioSourceBuffer.mode = "sequence";
    await pumpAudioStream(session);
  } catch (error) {
    if (error.name !== "AbortError" && session === audioSession) {
      console.error("audio stream connection failed", error);
      scheduleAudioReconnect();
    }
  }
}

function scheduleAudioReconnect() {
  window.clearTimeout(audioReconnectTimer);
  if (!audioEnabled) {
    return;
  }
  audioReconnectTimer = window.setTimeout(openAudioStream, 1200);
}

audioToggle.addEventListener("click", () => {
  if (!audioEnabled) {
    audioEnabled = true;
    audioElement.muted = false;
    openAudioStream();
  } else {
    audioElement.muted = !audioElement.muted;
    if (!audioElement.muted && audioElement.paused) {
      openAudioStream();
    }
  }
  setAudioState();
});

audioVolume.addEventListener("input", () => {
  audioElement.volume = Number(audioVolume.value);
  audioElement.muted = audioElement.volume === 0;
  window.localStorage.setItem(
    "bbk9288.audioVolume",
    String(audioElement.volume),
  );
  if (!audioEnabled && audioElement.volume > 0) {
    audioEnabled = true;
    openAudioStream();
  }
  setAudioState();
});

audioElement.addEventListener("ended", scheduleAudioReconnect);
audioElement.addEventListener("error", scheduleAudioReconnect);
setAudioState();

function websocketUrl() {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("ws");
  if (explicit) {
    return explicit;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = params.get("host") || window.location.hostname;
  const port =
    params.get("wsPort") || managerStatus?.websocketPort || "6081";
  return `${protocol}//${host}:${port}`;
}

function setConnectionState(state, text) {
  statusNode.dataset.state = state;
  statusText.textContent = text;
  screenState.textContent = text;
  screenState.hidden = state === "connected";
}

function setPowerState(status) {
  const maintenance = Boolean(status?.maintenance);
  const running = Boolean(status?.emulatorRunning);
  const label = maintenance
    ? "NAND 维护中"
    : running
      ? "重启设备"
      : "启动设备";

  powerButton.title = powerBusy ? "正在启动设备" : label;
  powerButton.setAttribute("aria-label", powerButton.title);
  powerButton.disabled = powerBusy || maintenance;
  powerButton.classList.toggle("is-busy", powerBusy);
  powerButton.dataset.running = String(running);
}

function scheduleReconnect() {
  window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(connect, 1500);
}

function connect() {
  window.clearTimeout(reconnectTimer);
  manualDisconnect = false;
  if (rfb) {
    const previous = rfb;
    resetInputState(previous);
    rfb = null;
    previous.disconnect();
  } else {
    resetInputState(null);
  }

  setConnectionState("connecting", "正在连接");
  try {
    const connection = new RFB(screen, websocketUrl(), { shared: true });
    rfb = connection;
    connection.scaleViewport = true;
    connection.resizeSession = false;
    connection.clipViewport = false;
    connection.dragViewport = false;
    connection.focusOnClick = true;
    connection.showDotCursor = false;
    connection.background = "#f7f7f4";

    connection.addEventListener("connect", () => {
      if (rfb !== connection) {
        connection.disconnect();
        return;
      }
      resetInputState(connection);
      setConnectionState("connected", "已连接");
      screen.focus({ preventScroll: true });
    });
    connection.addEventListener("disconnect", (event) => {
      if (rfb !== connection) {
        return;
      }
      resetInputState(connection);
      rfb = null;
      if (manualDisconnect) {
        setConnectionState("offline", "已断开");
        return;
      }
      setConnectionState("offline", event.detail.clean ? "已断开" : "连接中断");
      scheduleReconnect();
    });
    connection.addEventListener("securityfailure", () => {
      if (rfb !== connection) {
        return;
      }
      setConnectionState("error", "连接被拒绝");
    });
    connection.addEventListener("credentialsrequired", () => {
      if (rfb !== connection) {
        return;
      }
      setConnectionState("error", "需要凭据");
    });
  } catch (error) {
    console.error(error);
    rfb = null;
    setConnectionState("error", "无法连接");
    scheduleReconnect();
  }
}

function sendKey(name, down, connection = rfb) {
  const key = keyMap[name];
  if (!connection || !key) {
    return;
  }
  try {
    connection.sendKey(key.keysym, key.code, down);
  } catch (error) {
    console.warn(`Unable to ${down ? "press" : "release"} ${name}`, error);
  }
}

function resetInputState(connection = rfb) {
  for (const state of keyboardPresses.values()) {
    window.clearTimeout(state.releaseTimer);
  }
  keyboardPresses.clear();

  for (const action of Object.keys(keyMap)) {
    sendKey(action, false, connection);
    setKeyboardActionPressed(action, false);
  }
  setMatrixShiftArmed(false);
  for (const reset of deviceKeyResetters) {
    reset();
  }
}

function setKeyboardActionPressed(action, pressed) {
  for (const button of document.querySelectorAll(`[data-key="${action}"]`)) {
    button.classList.toggle("is-pressed", pressed);
  }
}

function releaseKeyboardPress(code, immediate = false) {
  const state = keyboardPresses.get(code);
  if (!state) {
    return;
  }
  if (immediate && state.releaseTimer !== null) {
    window.clearTimeout(state.releaseTimer);
    state.releaseTimer = null;
  } else if (state.releaseTimer !== null) {
    return;
  }

  const finishRelease = () => {
    sendKey(state.action, false, state.connection);
    setKeyboardActionPressed(state.action, false);
    keyboardPresses.delete(code);
  };
  const heldFor = window.performance.now() - state.pressedAt;
  const remaining = immediate
    ? 0
    : Math.max(0, minimumKeyHoldMs - heldFor);

  if (remaining === 0) {
    finishRelease();
  } else {
    state.releaseTimer = window.setTimeout(finishRelease, remaining);
  }
}

function releaseAllKeyboardPresses() {
  for (const code of [...keyboardPresses.keys()]) {
    releaseKeyboardPress(code, true);
  }
}

function isTextInput(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  );
}

function handleMappedKeyDown(event) {
  if (
    event.isComposing ||
    isTextInput(event.target) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }

  const action = matrixPhysicalActions[event.code];
  if (!action) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.repeat || keyboardPresses.has(event.code)) {
    return;
  }

  keyboardPresses.set(event.code, {
    action,
    connection: rfb,
    pressedAt: window.performance.now(),
    releaseTimer: null,
  });
  sendKey(action, true);
  setKeyboardActionPressed(action, true);
}

function handleMappedKeyUp(event) {
  const mapped = matrixPhysicalActions[event.code];
  const state = keyboardPresses.get(event.code);
  if (!state && !mapped) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  releaseKeyboardPress(event.code);
}

window.addEventListener("keydown", handleMappedKeyDown, true);
window.addEventListener("keyup", handleMappedKeyUp, true);
window.addEventListener("blur", () => resetInputState());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resetInputState();
  }
});
window.addEventListener("pagehide", () => resetInputState());

for (const button of document.querySelectorAll("[data-shift-toggle]")) {
  button.addEventListener("click", (event) => {
    setMatrixShiftArmed(!matrixShiftArmed);
    event.preventDefault();
  });
  deviceKeyResetters.add(() => setMatrixShiftArmed(false));
}

for (const button of document.querySelectorAll(
  "[data-key]:not([data-shift-toggle])",
)) {
  let activePointer = null;
  let pressedAt = 0;
  let releaseTimer = null;
  let chordShift = false;

  const release = (event) => {
    if (activePointer === null || releaseTimer !== null) {
      return;
    }
    const finishRelease = () => {
      sendKey(button.dataset.key, false);
      if (chordShift) {
        sendKey("shift", false);
        chordShift = false;
        setMatrixShiftArmed(false);
      }
      button.classList.remove("is-pressed");
      announceMatrixKey(button.textContent.trim());
      activePointer = null;
      releaseTimer = null;
    };
    const heldFor = window.performance.now() - pressedAt;
    const remaining = Math.max(0, minimumKeyHoldMs - heldFor);
    releaseTimer = window.setTimeout(finishRelease, remaining);
    event?.preventDefault();
  };

  button.addEventListener("pointerdown", (event) => {
    if (activePointer !== null) {
      return;
    }
    activePointer = event.pointerId;
    pressedAt = window.performance.now();
    button.setPointerCapture(event.pointerId);
    button.classList.add("is-pressed");
    chordShift =
      matrixShiftArmed && /^[a-z0-9]$/.test(button.dataset.key);
    if (chordShift) {
      sendKey("shift", true);
    }
    sendKey(button.dataset.key, true);
    event.preventDefault();
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  deviceKeyResetters.add(() => {
    window.clearTimeout(releaseTimer);
    if (chordShift) {
      sendKey("shift", false);
      chordShift = false;
    }
    activePointer = null;
    releaseTimer = null;
    button.classList.remove("is-pressed");
  });
}

reconnectButton.addEventListener("click", () => {
  manualDisconnect = true;
  if (rfb) {
    const previous = rfb;
    resetInputState(previous);
    rfb = null;
    previous.disconnect();
  }
  connect();
});

powerButton.addEventListener("click", async () => {
  if (powerBusy) {
    return;
  }

  const wasRunning = Boolean(managerStatus?.emulatorRunning);
  powerBusy = true;
  setPowerState();
  window.clearTimeout(reconnectTimer);
  manualDisconnect = true;
  if (rfb) {
    const previous = rfb;
    resetInputState(previous);
    rfb = null;
    previous.disconnect();
  } else {
    resetInputState(null);
  }
  setConnectionState("connecting", "正在启动");

  try {
    const status = await apiRequest("/api/emulator/restart", {
      method: "POST",
    });
    managerStatus = status;
    setPowerState(status);
    showToast(wasRunning ? "设备已重启" : "设备已启动");
    connect();
    openAudioStream();
  } catch (error) {
    console.error(error);
    setConnectionState("error", "启动失败");
    showToast(error.message || "设备启动失败", true);
  } finally {
    powerBusy = false;
    setPowerState(managerStatus);
  }
});

fullscreenButton.addEventListener("click", async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await deviceFrame.requestFullscreen();
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.title = document.fullscreenElement ? "退出全屏" : "全屏";
  fullscreenButton.setAttribute("aria-label", fullscreenButton.title);
});

window.addEventListener("beforeunload", () => {
  manualDisconnect = true;
  resetInputState(rfb);
  rfb?.disconnect();
  window.clearTimeout(audioReconnectTimer);
  audioSession++;
  closeAudioPipeline();
});

const viewTabs = document.querySelectorAll("[data-view]");
const viewPanels = document.querySelectorAll("[data-view-panel]");
const filesView = document.querySelector("#files-view");
const maintenanceGate = document.querySelector("#maintenance-gate");
const fileBrowser = document.querySelector("#file-browser");
const fileActions = document.querySelector("#file-actions");
const fileList = document.querySelector("#file-list");
const emptyState = document.querySelector("#empty-state");
const breadcrumbs = document.querySelector("#breadcrumbs");
const operationState = document.querySelector("#operation-state");
const operationText = document.querySelector("#operation-text");
const capacityUsed = document.querySelector("#capacity-used");
const capacityFree = document.querySelector("#capacity-free");
const capacityProgress = document.querySelector("#capacity-progress");
const changeState = document.querySelector("#change-state");
const fileInput = document.querySelector("#file-input");
const nameDialog = document.querySelector("#name-dialog");
const nameDialogTitle = document.querySelector("#name-dialog-title");
const nameInput = document.querySelector("#name-input");
const nameSubmit = document.querySelector("#name-submit");
const confirmDialog = document.querySelector("#confirm-dialog");
const confirmTitle = document.querySelector("#confirm-title");
const confirmMessage = document.querySelector("#confirm-message");
const toast = document.querySelector("#toast");
const gateTitle = maintenanceGate.querySelector("h2");

let managerBusy = false;
let managerStatus = null;
let currentPath = "/";
let currentEntries = [];
let toastTimer = null;

function renderUsbSetting(status) {
  const connected = status?.usbConnected !== false;
  usbConnectedToggle.checked = connected;
  usbState.value = connected ? "已连接" : "未连接";
  usbState.textContent = usbState.value;
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (
    options.body &&
    typeof options.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `请求失败 (${response.status})`);
  }
  return payload;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KiB", "MiB", "GiB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** index;
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function formatTimestamp(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function joinPath(parent, name) {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

function showToast(message, error = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function setManagerBusy(busy, message = "") {
  managerBusy = busy;
  operationText.textContent = message;
  operationState.hidden = !busy;
  for (const button of filesView.querySelectorAll("button")) {
    button.disabled = busy;
  }
}

async function runManagerOperation(message, operation) {
  if (managerBusy) {
    return;
  }
  setManagerBusy(true, message);
  try {
    return await operation();
  } catch (error) {
    console.error(error);
    showToast(error.message || "操作失败", true);
    return null;
  } finally {
    setManagerBusy(false);
  }
}

function requestName(title, initialValue, submitText) {
  nameDialogTitle.textContent = title;
  nameInput.value = initialValue;
  nameSubmit.textContent = submitText;
  nameDialog.returnValue = "cancel";
  nameDialog.showModal();
  nameInput.focus();
  nameInput.select();
  return new Promise((resolve) => {
    nameDialog.addEventListener(
      "close",
      () => {
        resolve(
          nameDialog.returnValue === "default" ? nameInput.value.trim() : null,
        );
      },
      { once: true },
    );
  });
}

function requestConfirmation(title, message) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmDialog.returnValue = "cancel";
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmDialog.addEventListener(
      "close",
      () => resolve(confirmDialog.returnValue === "confirm"),
      { once: true },
    );
  });
}

function makeIcon(name) {
  const icon = document.createElement("i");
  icon.dataset.lucide = name;
  return icon;
}

function makeRowAction(label, iconName, action, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `row-action${danger ? " danger-action" : ""}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(makeIcon(iconName));
  button.addEventListener("click", action);
  return button;
}

function renderBreadcrumbs(path) {
  breadcrumbs.replaceChildren();
  const rootButton = document.createElement("button");
  rootButton.type = "button";
  rootButton.textContent = "根目录";
  rootButton.addEventListener("click", () => openDirectory("/"));
  breadcrumbs.append(rootButton);

  let accumulated = "";
  for (const segment of path.split("/").filter(Boolean)) {
    accumulated += `/${segment}`;
    const separator = document.createElement("span");
    separator.className = "breadcrumb-separator";
    separator.append(makeIcon("chevron-right"));
    breadcrumbs.append(separator);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = segment;
    const target = accumulated;
    button.addEventListener("click", () => openDirectory(target));
    breadcrumbs.append(button);
  }
}

function renderFileList(payload) {
  currentPath = payload.path;
  currentEntries = payload.entries;
  fileList.replaceChildren();

  for (const entry of payload.entries) {
    const path = joinPath(payload.path, entry.name);
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "file-name";
    nameButton.append(
      makeIcon(entry.directory ? "folder" : "file"),
      document.createTextNode(entry.name),
    );
    if (entry.directory) {
      nameButton.addEventListener("click", () => openDirectory(path));
    }
    nameCell.append(nameButton);

    const sizeCell = document.createElement("td");
    sizeCell.textContent = entry.directory ? "—" : formatBytes(entry.size);
    sizeCell.className = "file-size";

    const modifiedCell = document.createElement("td");
    modifiedCell.textContent = formatTimestamp(entry.modified);
    modifiedCell.className = "file-modified";

    const actionCell = document.createElement("td");
    actionCell.className = "row-actions";
    if (!entry.directory) {
      const download = document.createElement("a");
      download.className = "row-action";
      download.title = "下载";
      download.setAttribute("aria-label", `下载 ${entry.name}`);
      download.href = `/api/nand/download?path=${encodeURIComponent(path)}`;
      download.append(makeIcon("download"));
      actionCell.append(download);
    }
    actionCell.append(
      makeRowAction("重命名", "pencil", async () => {
        const name = await requestName("重命名", entry.name, "重命名");
        if (!name || name === entry.name) {
          return;
        }
        await runManagerOperation("正在重命名", async () => {
          await apiRequest("/api/nand/rename", {
            method: "POST",
            body: JSON.stringify({ path, name }),
          });
          await loadDirectory();
          showToast("重命名完成");
        });
      }),
      makeRowAction(
        "删除",
        "trash-2",
        async () => {
          const confirmed = await requestConfirmation(
            "删除文件",
            entry.directory
              ? `删除目录“${entry.name}”及其中全部内容？`
              : `删除文件“${entry.name}”？`,
          );
          if (!confirmed) {
            return;
          }
          await runManagerOperation("正在删除", async () => {
            await apiRequest("/api/nand/delete", {
              method: "POST",
              body: JSON.stringify({ path }),
            });
            await loadDirectory();
            showToast("删除完成");
          });
        },
        true,
      ),
    );

    row.append(nameCell, sizeCell, modifiedCell, actionCell);
    fileList.append(row);
  }

  const used = payload.capacityBytes - payload.freeBytes;
  const percentage =
    payload.capacityBytes > 0 ? (used / payload.capacityBytes) * 100 : 0;
  capacityUsed.textContent = `${formatBytes(used)} 已用`;
  capacityFree.textContent = `${formatBytes(payload.freeBytes)} 可用`;
  capacityProgress.value = percentage;
  capacityProgress.textContent = `${percentage.toFixed(0)}%`;
  changeState.textContent = payload.dirty ? "有未应用更改" : "未修改";
  changeState.classList.toggle("is-dirty", payload.dirty);
  emptyState.hidden = payload.entries.length !== 0;
  renderBreadcrumbs(payload.path);
  renderIcons();
}

async function loadDirectory(path = currentPath) {
  const payload = await apiRequest(
    `/api/nand/list?path=${encodeURIComponent(path)}`,
  );
  renderFileList(payload);
}

async function openDirectory(path) {
  await runManagerOperation("正在读取目录", () => loadDirectory(path));
}

function renderManagerStatus(status) {
  managerStatus = status;
  setPowerState(status);
  renderUsbSetting(status);
  maintenanceGate.hidden = status.maintenance;
  fileBrowser.hidden = !status.maintenance;
  fileActions.hidden = !status.maintenance;
  gateTitle.textContent = status.emulatorRunning
    ? "NAND 正由模拟器使用"
    : "模拟器当前未运行";
  changeState.textContent = status.dirty ? "有未应用更改" : "未修改";
  changeState.classList.toggle("is-dirty", status.dirty);
}

async function refreshManagerStatus(loadFiles = false) {
  if (managerBusy) {
    return;
  }
  try {
    const previousMaintenance = managerStatus?.maintenance;
    const status = await apiRequest("/api/status");
    renderManagerStatus(status);
    if (
      status.maintenance &&
      (loadFiles || previousMaintenance !== status.maintenance)
    ) {
      await loadDirectory(currentPath);
    }
  } catch (error) {
    console.error(error);
    showToast("文件管理服务不可用", true);
  }
}

function disconnectForMaintenance() {
  window.clearTimeout(reconnectTimer);
  manualDisconnect = true;
  resetInputState(rfb);
  rfb?.disconnect();
  rfb = null;
  setConnectionState("offline", "NAND 维护");
}

async function switchView(view) {
  releaseAllKeyboardPresses();
  for (const tab of viewTabs) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const panel of viewPanels) {
    panel.hidden = panel.dataset.viewPanel !== view;
  }
  if (view === "files") {
    await refreshManagerStatus(true);
  } else if (view === "settings") {
    await refreshManagerStatus(false);
  }
}

for (const tab of viewTabs) {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
}

usbConnectedToggle.addEventListener("change", async () => {
  const connected = usbConnectedToggle.checked;
  const previous = managerStatus?.usbConnected !== false;
  const wasRunning = Boolean(managerStatus?.emulatorRunning);
  usbConnectedToggle.disabled = true;
  usbState.value = "正在应用";
  usbState.textContent = usbState.value;

  if (wasRunning) {
    window.clearTimeout(reconnectTimer);
    manualDisconnect = true;
    resetInputState(rfb);
    rfb?.disconnect();
    rfb = null;
    setConnectionState("connecting", "正在重启");
  }

  try {
    const status = await apiRequest("/api/settings", {
      method: "POST",
      body: JSON.stringify({ usbConnected: connected }),
    });
    renderManagerStatus(status);
    showToast(
      `USB 已${connected ? "连接" : "断开"}${wasRunning ? "，设备已重启" : ""}`,
    );
    if (status.emulatorRunning) {
      connect();
      openAudioStream();
    }
  } catch (error) {
    console.error(error);
    renderUsbSetting({ usbConnected: previous });
    showToast(error.message || "USB 设置失败", true);
    if (wasRunning) {
      connect();
    }
  } finally {
    usbConnectedToggle.disabled = false;
  }
});

document.querySelector("#open-nand").addEventListener("click", async () => {
  disconnectForMaintenance();
  const result = await runManagerOperation("正在停止 QEMU 并提取 NAND", () =>
    apiRequest("/api/nand/open", { method: "POST" }),
  );
  if (!result) {
    connect();
    return;
  }
  renderManagerStatus(result);
  await runManagerOperation("正在读取目录", () => loadDirectory("/"));
});

document.querySelector("#apply-nand").addEventListener("click", async () => {
  const confirmed = await requestConfirmation(
    "应用 NAND 更改",
    "将暂存文件回包为原始 NAND，并重新启动模拟器？",
  );
  if (!confirmed) {
    return;
  }
  const result = await runManagerOperation("正在回包并重启 QEMU", () =>
    apiRequest("/api/nand/apply", { method: "POST" }),
  );
  if (!result) {
    return;
  }
  renderManagerStatus(result);
  showToast("NAND 更改已应用");
  await switchView("emulator");
  connect();
});

document.querySelector("#discard-nand").addEventListener("click", async () => {
  const confirmed = await requestConfirmation(
    "放弃 NAND 更改",
    "放弃维护模式中的全部更改，并重新启动模拟器？",
  );
  if (!confirmed) {
    return;
  }
  const result = await runManagerOperation("正在放弃更改并重启 QEMU", () =>
    apiRequest("/api/nand/cancel", { method: "POST" }),
  );
  if (!result) {
    return;
  }
  renderManagerStatus(result);
  showToast("更改已放弃");
  await switchView("emulator");
  connect();
});

document
  .querySelector("#restart-emulator")
  .addEventListener("click", async () => {
    const result = await runManagerOperation("正在重启 QEMU", () =>
      apiRequest("/api/emulator/restart", { method: "POST" }),
    );
    if (result) {
      renderManagerStatus(result);
      showToast("模拟器已重启");
      await switchView("emulator");
      connect();
    }
  });

document.querySelector("#file-refresh").addEventListener("click", () => {
  runManagerOperation("正在刷新", () => loadDirectory());
});

document.querySelector("#new-folder").addEventListener("click", async () => {
  const name = await requestName("新建目录", "", "创建");
  if (!name) {
    return;
  }
  await runManagerOperation("正在创建目录", async () => {
    await apiRequest("/api/nand/mkdir", {
      method: "POST",
      body: JSON.stringify({ parent: currentPath, name }),
    });
    await loadDirectory();
    showToast("目录已创建");
  });
});

document.querySelector("#upload-file").addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  fileInput.value = "";
  if (!files.length) {
    return;
  }

  await runManagerOperation(`正在上传 ${files.length} 个文件`, async () => {
    const existing = new Set(currentEntries.map((entry) => entry.name));
    for (const file of files) {
      if (existing.has(file.name)) {
        const overwrite = await requestConfirmation(
          "覆盖文件",
          `“${file.name}”已经存在，是否覆盖？`,
        );
        if (!overwrite) {
          continue;
        }
      }
      await apiRequest(
        `/api/nand/upload?path=${encodeURIComponent(currentPath)}&name=${encodeURIComponent(file.name)}`,
        { method: "PUT", body: file },
      );
      existing.add(file.name);
    }
    await loadDirectory();
    showToast("上传完成");
  });
});

window.setInterval(() => {
  if (document.querySelector('[data-view="files"]').classList.contains("is-active")) {
    refreshManagerStatus(false);
    return;
  }
  apiRequest("/api/status")
    .then((status) => {
      managerStatus = status;
      setPowerState(status);
      renderUsbSetting(status);
      if (!status.emulatorRunning && !status.maintenance && !powerBusy) {
        setConnectionState("offline", "已关机");
      }
    })
    .catch((error) => console.error(error));
}, 3000);

apiRequest("/api/status")
  .then((status) => {
    managerStatus = status;
    setPowerState(status);
    renderUsbSetting(status);
    if (!status.emulatorRunning && !status.maintenance) {
      setConnectionState("offline", "已关机");
    } else if (status.emulatorRunning && !status.maintenance) {
      connect();
    }
  })
  .catch((error) => {
    console.error(error);
    connect();
  });
