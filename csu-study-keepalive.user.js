// ==UserScript==
// @name         CSU 学习页面保活助手
// @namespace    csu-study-keepalive
// @version      1.1.0
// @description  定时模拟鼠标/键盘操作并伪造页面可见性，避免学习页面因"5 分钟无操作"暂停计时
// @author       csu-study-keepalive
// @license      MIT
// @match        https://aqks.csu.edu.cn/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 同一页面只初始化一次
  if (window.__csuKeepAlive) return;

  const IS_TOP = (() => {
    try {
      return window.top === window.self;
    } catch (e) {
      return false;
    }
  })();

  const CONFIG = {
    minIdle: 20000,        // 两次模拟操作的最小间隔(ms)
    maxIdle: 45000,        // 两次模拟操作的最大间隔(ms)
    tick: 5000,            // 调度心跳(ms)
    spoofVisibility: true, // 伪造 document.hidden / visibilityState
    silentAudio: true,     // 播放近乎无声的音源，降低后台标签被节流的概率
    showBadge: true,       // 显示右下角状态徽章
    showTitleTimer: true,  // 在标签标题上显示保活时长
    debug: false,          // 在控制台输出详细日志
  };

  const STORE_KEY = 'csu-keepalive:v1';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const log = (...args) => CONFIG.debug && console.log('%c[保活]', 'color:#16a34a', ...args);

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(patch) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...patch }));
    } catch (e) {
      /* localStorage 不可用时忽略，不影响保活 */
    }
  }

  const startedAt = Date.now();
  let enabled = readStore().enabled !== false;
  let actions = 0;
  let lastAction = 0;
  let nextGap = rnd(CONFIG.minIdle, CONFIG.maxIdle);
  let stopped = false;
  let badge = null;
  let worker = null;
  let schedulerTimer = null;
  let uiTimer = null;
  let audioCtx = null;

  // ---------- 1. 伪造"页面可见且聚焦" ----------
  function spoofVisibility() {
    const values = {
      hidden: false,
      visibilityState: 'visible',
      webkitHidden: false,
      webkitVisibilityState: 'visible',
    };

    for (const key of Object.keys(values)) {
      try {
        Object.defineProperty(document, key, {
          configurable: true,
          get: () => values[key],
        });
      } catch (e) {
        log('覆盖 document.' + key + ' 失败', e);
      }
    }

    try {
      document.hasFocus = () => true;
    } catch (e) {
      log('覆盖 hasFocus 失败', e);
    }
  }

  // ---------- 2. 静音音源，降低后台节流 ----------
  function startSilentAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;

      audioCtx = new AC();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.00001; // 人耳听不见
      osc.frequency.value = 440;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();

      const resume = () => {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      };
      resume();
      document.addEventListener('pointerdown', resume, true);
      document.addEventListener('keydown', resume, true);
    } catch (e) {
      log('音频保活不可用', e);
    }
  }

  // ---------- 3. 模拟真实用户操作 ----------
  function activity() {
    const target = document.body || document.documentElement;
    if (!target) return;

    const x = Math.floor(rnd(5, Math.max(window.innerWidth - 5, 10)));
    const y = Math.floor(rnd(5, Math.max(window.innerHeight - 5, 10)));
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
    };

    try {
      target.dispatchEvent(new MouseEvent('mousemove', base));

      if (typeof PointerEvent === 'function') {
        target.dispatchEvent(
          new PointerEvent('pointermove', {
            ...base,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          })
        );
      }

      target.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: Math.random() > 0.5 ? 1 : -1,
        })
      );

      // Shift 几乎不会触发页面快捷键，但足以刷新"最后一次操作时间"
      const key = {
        bubbles: true,
        cancelable: true,
        key: 'Shift',
        code: 'ShiftLeft',
        keyCode: 16,
        which: 16,
        shiftKey: true,
      };
      target.dispatchEvent(new KeyboardEvent('keydown', key));
      target.dispatchEvent(new KeyboardEvent('keyup', key));
    } catch (e) {
      log('派发事件失败', e);
    }

    actions += 1;
    lastAction = Date.now();
    nextGap = rnd(CONFIG.minIdle, CONFIG.maxIdle);
    render();
    log(`第 ${actions} 次模拟操作，下次约 ${Math.round(nextGap / 1000)}s 后`);
  }

  // ---------- 4. 状态展示 ----------
  function updateTitle() {
    if (!IS_TOP || !CONFIG.showTitleTimer) return;

    const minutes = Math.floor((Date.now() - startedAt) / 60000);
    const plain = document.title.replace(/^\[(保活[^\]]*|已暂停)\]\s*/, '');
    const next = enabled ? `[保活 ${minutes}m] ${plain}` : `[已暂停] ${plain}`;

    if (document.title !== next) document.title = next;
  }

  function buildBadge() {
    if (!IS_TOP || !CONFIG.showBadge || badge) return;

    const pos = readStore().badgePos;
    badge = document.createElement('div');
    badge.id = 'csu-keepalive-badge';
    badge.title = '点击暂停 / 继续，按住可拖动';
    badge.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'padding:5px 10px',
      'border-radius:999px',
      'background:rgba(17,24,39,.82)',
      'color:#e5e7eb',
      'font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif',
      'box-shadow:0 2px 10px rgba(0,0,0,.22)',
      'cursor:pointer',
      'user-select:none',
      'opacity:.7',
      'transition:opacity .15s',
      pos ? `left:${pos.left}px` : 'right:16px',
      pos ? `top:${pos.top}px` : 'bottom:16px',
    ].join(';');

    const dot = document.createElement('span');
    dot.dataset.dot = '';
    dot.style.cssText = 'width:7px;height:7px;border-radius:50%;flex:none;';

    const text = document.createElement('span');
    text.dataset.text = '';

    badge.append(dot, text);
    (document.body || document.documentElement).appendChild(badge);

    badge.addEventListener('mouseenter', () => {
      badge.style.opacity = '1';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.opacity = '.7';
    });

    // 拖动移动位置；未拖动则视为点击，切换暂停/继续
    let drag = null;

    badge.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const rect = badge.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false };
      try {
        badge.setPointerCapture(e.pointerId);
      } catch (err) {
        /* 某些浏览器不支持，忽略 */
      }
      e.preventDefault();
    });

    badge.addEventListener('pointermove', (e) => {
      if (!drag) return;
      e.stopPropagation();

      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;

      const maxLeft = window.innerWidth - badge.offsetWidth - 2;
      const maxTop = window.innerHeight - badge.offsetHeight - 2;
      badge.style.left = Math.min(Math.max(2, drag.left + dx), Math.max(2, maxLeft)) + 'px';
      badge.style.top = Math.min(Math.max(2, drag.top + dy), Math.max(2, maxTop)) + 'px';
      badge.style.right = 'auto';
      badge.style.bottom = 'auto';
    });

    const finishDrag = () => {
      if (!drag) return;
      if (drag.moved) {
        const rect = badge.getBoundingClientRect();
        writeStore({ badgePos: { left: Math.round(rect.left), top: Math.round(rect.top) } });
      } else {
        setEnabled(!enabled);
      }
      drag = null;
    };

    badge.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      finishDrag();
    });
    badge.addEventListener('pointercancel', () => {
      drag = null;
    });
  }

  function render() {
    updateTitle();
    if (!badge) return;

    // 页面重新渲染可能把徽章冲掉，这里补回去
    if (!badge.isConnected) {
      (document.body || document.documentElement).appendChild(badge);
    }

    const dot = badge.querySelector('[data-dot]');
    const text = badge.querySelector('[data-text]');
    const minutes = Math.floor((Date.now() - startedAt) / 60000);

    if (dot) {
      dot.style.background = enabled ? '#22c55e' : '#f59e0b';
      dot.style.boxShadow = enabled
        ? '0 0 0 3px rgba(34,197,94,.2)'
        : '0 0 0 3px rgba(245,158,11,.2)';
    }
    if (text) {
      text.textContent = enabled ? `保活中 ${minutes}m · ${actions}次` : `已暂停 ${minutes}m`;
    }
  }

  function setEnabled(next) {
    enabled = next;
    writeStore({ enabled });
    if (enabled) lastAction = 0; // 恢复后尽快补一次操作
    render();
    log(enabled ? '已继续' : '已暂停');
  }

  // ---------- 5. 用 Worker 计时，避免后台定时器被冻结 ----------
  function onTick() {
    if (stopped || !enabled) return;
    if (Date.now() - lastAction >= nextGap) activity();
  }

  function startTicker() {
    try {
      const src =
        'let t=null;onmessage=e=>{if(e.data==="start"){clearInterval(t);' +
        't=setInterval(()=>postMessage(0),' +
        CONFIG.tick +
        ');}else{clearInterval(t);}};';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = onTick;
      worker.postMessage('start');
    } catch (e) {
      log('Worker 不可用，改用主线程定时器', e);
      schedulerTimer = setInterval(onTick, CONFIG.tick);
    }
  }

  // ---------- 启动 ----------
  spoofVisibility();
  if (IS_TOP && CONFIG.silentAudio) startSilentAudio();
  buildBadge();
  startTicker();

  if (IS_TOP) {
    uiTimer = setInterval(() => {
      if (!stopped) render();
    }, 1000);
  }

  if (enabled) activity();
  render();

  window.__csuKeepAlive = {
    config: CONFIG,
    activity,
    pause: () => setEnabled(false),
    resume: () => setEnabled(true),
    get enabled() {
      return enabled;
    },
    get actions() {
      return actions;
    },
    get elapsed() {
      return Date.now() - startedAt;
    },
    stop() {
      stopped = true;
      if (worker) {
        worker.postMessage('stop');
        worker.terminate();
        worker = null;
      }
      if (schedulerTimer) clearInterval(schedulerTimer);
      if (uiTimer) clearInterval(uiTimer);
      if (audioCtx) audioCtx.close().catch(() => {});
      if (badge) {
        badge.remove();
        badge = null;
      }
      log('已停止');
    },
  };

  log('已启动。控制台可用 __csuKeepAlive.pause() / .resume() / .stop()');
})();
