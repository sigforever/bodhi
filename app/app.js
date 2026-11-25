/* ==========================================================================
   BODHI · 菩提 — Interactive Buddhist & Zen Contemplation App Engine
   Zero-dependency vanilla JS, aligned with app/styles.css & file:// mode.

   设计原则：复杂留给系统，不留给用户。
   - 能自动保存的不设「保存」按钮；能记住的（阅读位置、模式、偏好）都记住。
   - 状态改变尽量「就地更新」而非整块重绘，让过渡动效有来有去、可被打断。
   - 动效一套语言：时长/曲线与 styles.css 中的 --dur-* / --ease-* 令牌一一对应。
   ========================================================================== */

(function () {
  "use strict";

  var books = Array.isArray(window.BODHI_LIBRARY) ? window.BODHI_LIBRARY : [];
  var atlas = window.BODHI_ATLAS || {};
  var mapNodes = Array.isArray(atlas.mapNodes) ? atlas.mapNodes : [];
  var mapEdges = Array.isArray(atlas.mapEdges) ? atlas.mapEdges : [];
  var consciousnesses = Array.isArray(atlas.eightConsciousnesses) ? atlas.eightConsciousnesses : [];
  var triads = Array.isArray(atlas.diamondTriads) ? atlas.diamondTriads : [];
  var oxStages = Array.isArray(atlas.oxStages) ? atlas.oxStages : [];
  var lineageNodes = Array.isArray(atlas.lineageNodes) ? atlas.lineageNodes : [];
  var koans = Array.isArray(atlas.koans) ? atlas.koans : [];
  var huatouList = Array.isArray(atlas.huatou) ? atlas.huatou : [];
  var epigraphs = Array.isArray(atlas.epigraphs) ? atlas.epigraphs : [];

  var SVG_NS = "http://www.w3.org/2000/svg";
  var KEY = {
    journal: "bodhi-journal-v1",
    theme: "bodhi-theme",
    lastRead: "bodhi-last-reading",
    sitCount: "bodhi-sit-count",
    size: "bodhi-reader-size",
    leading: "bodhi-reader-leading",
    measure: "bodhi-reader-measure",
    bookPos: "bodhi-book-positions",
    readerMode: "bodhi-reader-mode",
    lastView: "bodhi-last-view",
    sidebar: "bodhi-sidebar-collapsed",
    sitPrefs: "bodhi-sit-prefs",
    ui: "bodhi-ui-state"
  };
  var TYPO_DEFAULTS = { size: "19", leading: "2.05", measure: "680" };
  var VIEWS = ["reader", "atlas", "ox", "lineage", "koans", "journal", "stillness"];
  var ATLAS_TABS = ["map", "consciousness", "diamond"];
  var TYPE_LABELS = { free: "手记", koan: "公案参究", verse: "经文批注" };

  /* Dynamic SVG refs created inside buildOx() so we never query missing static IDs */
  var oxArcEl = null;
  var oxGlyphLayerEl = null;

  var state = {
    view: "",
    bookIndex: 0,
    verseId: "",
    pure: false,
    vertical: false,
    bookPos: {},
    epigraphIdx: 0,
    atlasTab: "map",
    atlasNodeId: "zen",
    triadIndex: 0,
    oxIndex: 0,
    lineageId: "linji",
    koanIndex: 0,
    koanLayerOne: false,
    koanLayerTwo: false,
    journalFilter: "all",
    selectedEntryId: null,
    journalStale: true,
    journal: readJournalStore(),
    theme: "ink",
    themeChosen: false,
    zenWanted: false,
    commandIndex: 0,
    commandResults: [],
    huatouIndex: 0,
    scroll: {},
    sit: {
      active: false,
      paused: false,
      mode: "natural",
      minutes: 10,
      remainingMs: 600000,
      endAt: 0,
      tickTimer: 0,
      breathTimer: 0,
      breathStep: 0,
      chime: true
    }
  };

  /* ------------------------------------------------------------------------
     Small utilities
     ------------------------------------------------------------------------ */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function localGet(key, fallback) {
    try {
      var val = localStorage.getItem(key);
      return val === null ? fallback : val;
    } catch (_) {
      return fallback;
    }
  }

  function localSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (_) {
      /* ignore quota/private mode */
    }
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, val) {
    localSet(key, JSON.stringify(val));
  }

  function esc(val) {
    return String(val == null ? "" : val).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function makeId(prefix) {
    return (prefix || "j") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function localDateKey(d) {
    var date = d ? new Date(d) : new Date();
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function timeLabel(iso) {
    var d = new Date(iso || Date.now());
    var sameDay = localDateKey(d) === localDateKey();
    var hm = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    return sameDay ? hm : d.toLocaleDateString("zh-CN") + " " + hm;
  }

  function svgEl(tag, attrs, text) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, String(attrs[k]));
      });
    }
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  function isNarrow() {
    return window.matchMedia ? window.matchMedia("(max-width: 1024px)").matches : window.innerWidth <= 1024;
  }

  function cssEscape(val) {
    return window.CSS && CSS.escape ? CSS.escape(val) : String(val).replace(/"/g, '\\"');
  }

  /* ------------------------------------------------------------------------
     Motion language — mirrors CSS tokens in styles.css
     --dur-instant 120ms · --dur-fast 160ms · --dur-base 240ms · --dur-slow 360ms
     --ease-out: 所有进出、跟随（退场比进场更短更快）；--ease-spring: 仅用于小型确认
     ------------------------------------------------------------------------ */
  var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
  var EASE_SPRING = "cubic-bezier(0.34, 1.32, 0.64, 1)";
  var DUR = { instant: 120, fast: 160, base: 240, slow: 360 };

  function reducedMotion() {
    return Boolean(reduceMQ && reduceMQ.matches);
  }

  function canAnimate(el) {
    return Boolean(el) && typeof el.animate === "function" && !reducedMotion();
  }

  /* 内容替换：先同步写入最新 DOM，再轻快入场；多次快速触发可直接打断，不会丢失状态。 */
  function swap(el, mutate, opts) {
    opts = opts || {};
    if (!el) {
      mutate();
      return;
    }
    el._swapToken = (el._swapToken || 0) + 1;
    if (el._swap) {
      el._swap.cancel();
      el._swap = null;
    }
    mutate();
    if (!canAnimate(el) || opts.skipIn) return;

    var dx = opts.dx || 0;
    var dy = opts.dy === undefined ? 4 : opts.dy;
    var inDur = opts.inDur || DUR.base;
    var inn = el.animate([
      { opacity: 0.15, transform: "translate(" + dx + "px, " + dy + "px)" },
      { opacity: 1, transform: "translate(0px, 0px)" }
    ], { duration: inDur, easing: EASE_OUT });
    el._swap = inn;
    inn.onfinish = function () {
      if (el._swap === inn) el._swap = null;
    };
  }

  /* 数字/短文本滚动替换：dir=1 新值自下而上，dir=-1 自上而下 */
  function swapText(el, text, dir, opts) {
    if (!el) return;
    text = String(text);
    el._pendingText = undefined;
    if (el.textContent === text) return;
    var d = dir === undefined || dir === 0 ? 1 : dir;
    swap(el, function () {
      el.textContent = text;
    }, Object.assign({ dx: 0, dy: 5 * d, inDur: DUR.fast }, opts || {}));
  }

  function fadeIn(el, opts) {
    if (!canAnimate(el)) return null;
    opts = opts || {};
    return el.animate([
      { opacity: 0, transform: "translate(" + (opts.dx || 0) + "px, " + (opts.dy === undefined ? 6 : opts.dy) + "px)" },
      { opacity: 1, transform: "translate(0px, 0px)" }
    ], { duration: opts.duration || DUR.base, delay: opts.delay || 0, easing: EASE_OUT, fill: "backwards" });
  }

  function pop(el) {
    if (!canAnimate(el)) return;
    el.animate([
      { transform: "scale(0.8)" },
      { transform: "scale(1.2)", offset: 0.5 },
      { transform: "scale(1)" }
    ], { duration: 280, easing: EASE_SPRING });
  }

  /* Segmented controls：一枚「滑块」在选项之间滑动，说明「从哪到哪」。 */
  var segObserver = window.ResizeObserver
    ? new ResizeObserver(function (entries) {
      var done = [];
      entries.forEach(function (entry) {
        var seg = entry.target.classList.contains("seg") ? entry.target : entry.target.closest(".seg");
        if (seg && done.indexOf(seg) < 0) {
          done.push(seg);
          syncSeg(seg, true);
        }
      });
    })
    : null;

  function initSeg(seg) {
    if (!seg) return;
    var thumb = seg.querySelector(":scope > .seg-thumb");
    if (!thumb) {
      thumb = document.createElement("span");
      thumb.className = "seg-thumb";
      thumb.setAttribute("aria-hidden", "true");
      seg.insertBefore(thumb, seg.firstChild);
    }
    if (segObserver) {
      segObserver.observe(seg);
      Array.prototype.forEach.call(seg.children, function (child) {
        if (child !== thumb) segObserver.observe(child);
      });
    }
    syncSeg(seg, true);
  }

  function syncSeg(seg, instant) {
    if (!seg) return;
    var thumb = seg.querySelector(":scope > .seg-thumb");
    if (!thumb) return;
    var active = seg.querySelector(":scope > .is-active");
    if (!active || !seg.offsetWidth || active.hidden) {
      thumb.style.opacity = "0";
      thumb._y = undefined;
      return;
    }
    var x = active.offsetLeft;
    var y = active.offsetTop;
    var rowChanged = thumb._y !== undefined && Math.abs(thumb._y - y) > 2 && seg.classList.contains("seg-wrap");
    var jump = instant || thumb._y === undefined || rowChanged || reducedMotion();
    if (jump) thumb.classList.add("no-anim");
    thumb.style.width = active.offsetWidth + "px";
    thumb.style.height = active.offsetHeight + "px";
    thumb.style.transform = "translate(" + x + "px, " + y + "px)";
    thumb.style.opacity = "1";
    if (jump) {
      void thumb.offsetWidth;
      thumb.classList.remove("no-anim");
    }
    if (rowChanged && !instant && canAnimate(thumb)) {
      thumb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fast, easing: EASE_OUT });
    }
    thumb._y = y;
  }

  function setSegActive(seg, matchFn) {
    if (!seg) return;
    Array.prototype.forEach.call(seg.children, function (child) {
      if (child.classList.contains("seg-thumb")) return;
      var on = Boolean(matchFn(child));
      var role = child.getAttribute("role");
      child.classList.toggle("is-active", on);
      if (role === "radio") child.setAttribute("aria-checked", String(on));
      if (role === "tab") child.setAttribute("aria-selected", String(on));
      if (role === "radio" || role === "tab") child.setAttribute("tabindex", on ? "0" : "-1");
    });
    syncSeg(seg);
  }

  /* ------------------------------------------------------------------------
     Toast — 轻提示，可带「撤销」；悬停或聚焦时暂停计时，不打断手上的事
     ------------------------------------------------------------------------ */
  var toastState = { timer: 0, action: null, ms: 0, hover: false, focus: false };

  function hideToast() {
    window.clearTimeout(toastState.timer);
    var el = $("#toast");
    if (!el) return;
    var act = document.activeElement;
    el.classList.remove("is-visible");
    el.inert = true;
    toastState.action = null;
    if (act && el.contains(act) && $("#workspace") && $("#workspace").focus) {
      $("#workspace").focus({ preventScroll: true });
    }
  }

  function scheduleToastHide(ms) {
    window.clearTimeout(toastState.timer);
    if (toastState.hover || toastState.focus) return;
    toastState.timer = window.setTimeout(hideToast, ms);
  }

  function toast(msg, action) {
    var el = $("#toast");
    var msgEl = $("#toast-msg");
    var btn = $("#toast-action");
    if (!el) return;
    var visible = el.classList.contains("is-visible");
    if (!action && visible && toastState.action) {
      btn.hidden = false;
      btn.textContent = toastState.action.label || "撤销";
      if (msg && msgEl.textContent !== msg) swapText(msgEl, msg + "（撤销仍有效）", 1);
      toastState.ms = Math.max(toastState.ms || 0, 3500);
      scheduleToastHide(toastState.ms);
      return;
    }
    toastState.action = action || null;
    btn.hidden = !action;
    if (action) btn.textContent = action.label || "撤销";
    el.inert = false;
    if (visible) {
      swapText(msgEl, msg, 1);
    } else {
      msgEl._pendingText = undefined;
      msgEl.textContent = msg;
    }
    el.classList.add("is-visible");
    toastState.ms = action ? 6000 : 2400;
    scheduleToastHide(toastState.ms);
  }

  /* ------------------------------------------------------------------------
     Journal store (transactional commit: state only advances after storage succeeds)
     ------------------------------------------------------------------------ */
  function cloneEntry(e) {
    if (!e) return null;
    return Object.assign({}, e, { tags: Array.isArray(e.tags) ? e.tags.slice() : [] });
  }

  function entryObservation(e) {
    if (!e) return "";
    if (typeof e.observation === "string") return e.observation;
    return typeof e.body === "string" ? e.body : "";
  }

  function hasDeepReflection(e) {
    return Boolean(e && (String(e.doubt || "").trim() || String(e.light || "").trim()));
  }

  function readJournalStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY.journal) || "{}");
      if (raw && Array.isArray(raw.entries)) {
        return {
          version: 1,
          entries: raw.entries,
          bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks : []
        };
      }
    } catch (_) {
      /* fallback empty */
    }
    return { version: 1, entries: [], bookmarks: [] };
  }

  function commitJournal(nextEntries, nextBookmarks) {
    var nextStore = {
      version: 1,
      entries: nextEntries,
      bookmarks: nextBookmarks
    };
    try {
      localStorage.setItem(KEY.journal, JSON.stringify(nextStore));
      state.journal = nextStore;
      return true;
    } catch (_) {
      toast("无法写入本机存储，请检查浏览器存储空间或权限。");
      return false;
    }
  }

  function findEntry(id) {
    return state.journal.entries.find(function (e) { return e.id === id; }) || null;
  }

  function findVerseNote(bookId, sectionId) {
    return state.journal.entries.find(function (e) {
      return e.type === "verse" && e.bookId === bookId && e.sectionId === sectionId;
    }) || null;
  }

  function isBookmarked(bookId, sectionId) {
    return state.journal.bookmarks.indexOf(bookId + ":" + sectionId) >= 0;
  }

  function autoTitle(entry) {
    var text = (entryObservation(entry) || entry.scene || entry.light || entry.doubt || "").trim();
    if (text) {
      var line = text.split(/\n/)[0].replace(/\s+/g, " ");
      return line.length > 22 ? line.slice(0, 22) + "…" : line;
    }
    return "无题 · " + new Date(entry.createdAt || Date.now()).toLocaleDateString("zh-CN");
  }

  function displayTitle(entry) {
    return (entry.title || "").trim() || autoTitle(entry);
  }

  function markJournalStale() {
    if (state.view === "journal") renderJournal({ syncEditor: false });
    else state.journalStale = true;
  }

  function setStatus(el, text, saved, animate) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-saved", Boolean(saved && text));
    if (animate && text && canAnimate(el)) {
      el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: DUR.base, easing: EASE_OUT });
    }
  }

  /* ------------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------------ */
  var systemLight = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  var themeState = { reqId: 0, target: null, vt: null, fallbackTimer: 0 };

  function systemTheme() {
    return systemLight && systemLight.matches ? "xuan" : "ink";
  }

  function applyTheme(theme, opts) {
    var valid = ["ink", "xuan", "celadon"];
    var next = valid.indexOf(theme) >= 0 ? theme : "ink";
    var root = document.documentElement;
    var prevTarget = themeState.target || state.theme;
    var reqId = ++themeState.reqId;
    themeState.target = next;

    var commit = function (id, val) {
      if (id !== themeState.reqId) return;
      state.theme = val;
      root.setAttribute("data-theme", val);
      var metaTheme = $('meta[name="theme-color"]');
      if (metaTheme) metaTheme.setAttribute("content", { ink: "#11110f", xuan: "#f4efe4", celadon: "#e5ebe6" }[val]);
    };
    setSegActive($(".theme-switcher"), function (btn) { return btn.dataset.themeValue === next; });

    var animate = Boolean(opts && opts.animate && next !== prevTarget);
    if (!animate || reducedMotion()) {
      if (themeState.vt && themeState.vt.skipTransition) {
        try { themeState.vt.skipTransition(); } catch (_) { /* ignore */ }
      }
      themeState.vt = null;
      window.clearTimeout(themeState.fallbackTimer);
      root.classList.remove("is-theme-switching", "is-theme-fallback");
      commit(reqId, next);
      return;
    }
    if (document.startViewTransition) {
      if (themeState.vt && themeState.vt.skipTransition) {
        try { themeState.vt.skipTransition(); } catch (_) { /* ignore */ }
      }
      root.classList.add("is-theme-switching");
      var vt = document.startViewTransition(function () { commit(reqId, next); });
      themeState.vt = vt;
      var done = function () {
        if (themeState.reqId !== reqId) return;
        themeState.vt = null;
        window.requestAnimationFrame(function () {
          if (themeState.reqId === reqId) root.classList.remove("is-theme-switching");
        });
      };
      vt.finished.then(done, done);
    } else {
      window.clearTimeout(themeState.fallbackTimer);
      root.classList.add("is-theme-fallback");
      void root.offsetWidth;
      commit(reqId, next);
      themeState.fallbackTimer = window.setTimeout(function () {
        if (themeState.reqId === reqId) root.classList.remove("is-theme-fallback");
      }, 320);
    }
  }

  function chooseTheme(theme) {
    state.themeChosen = true;
    localSet(KEY.theme, theme);
    applyTheme(theme, { animate: true });
  }

  /* ------------------------------------------------------------------------
     Views & sidebar
     ------------------------------------------------------------------------ */
  function flushAll() {
    var okVerse = flushVerseNote();
    var okKoan = flushKoanNote();
    var okJournal = flushJournal();
    return okVerse && okKoan && okJournal;
  }

  function syncNavSitTimer() {
    var el = $("#nav-sit-timer");
    if (!el) return;
    var show = Boolean(state.sit.active && state.view !== "stillness");
    el.hidden = !show;
    if (show) el.textContent = formatSec(Math.ceil(Math.max(0, state.sit.remainingMs) / 1000));
  }

  function syncSidebarInert() {
    var sb = $("#sidebar");
    if (!sb) return;
    if (isNarrow()) sb.inert = !sb.classList.contains("is-open");
    else sb.inert = sb.classList.contains("is-collapsed");
  }

  function setView(view, opts) {
    opts = opts || {};
    if (VIEWS.indexOf(view) < 0) view = "reader";
    var prev = state.view;
    var sb = $("#sidebar");
    var cameFromNav = Boolean(sb && document.activeElement && sb.contains(document.activeElement));
    var wantsHeadingFocus = opts.focusHeading !== undefined ? opts.focusHeading : cameFromNav;

    if (prev === view && !opts.force) {
      setMobileSidebar(false, { skipFocusRestore: wantsHeadingFocus });
      if (wantsHeadingFocus) {
        var sameTitle = $("#view-" + view + " .section-title");
        if (sameTitle) sameTitle.focus({ preventScroll: true });
      }
      return;
    }
    if (prev) {
      state.scroll[prev] = window.scrollY;
      flushAll();
      if (prev === "stillness" && view !== "stillness" && (state.zenWanted || document.body.classList.contains("is-zen-fullscreen"))) {
        setZen(false);
      }
    }
    state.view = view;
    document.body.setAttribute("data-view", view);

    var dir = prev ? (VIEWS.indexOf(view) >= VIEWS.indexOf(prev) ? 1 : -1) : 1;
    var dirName = dir >= 0 ? "forward" : "back";

    $$(".nav-item").forEach(function (item) {
      var active = item.dataset.view === view;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    syncSeg($("#sidebar-nav"));

    $$(".view").forEach(function (panel) {
      var active = panel.dataset.viewPanel === view;
      if (active) panel.dataset.dir = dirName;
      panel.classList.toggle("is-active", active);
    });

    var activeNav = $('.nav-item[data-view="' + view + '"] .nav-label');
    if (activeNav) {
      if (prev) swapText($("#workspace-title"), activeNav.textContent, dir);
      else $("#workspace-title").textContent = activeNav.textContent;
    }

    if (view === "journal") {
      if (!opts.blank && state.selectedEntryId === null && state.journal.entries.length > 0) {
        state.selectedEntryId = state.journal.entries[0].id;
        state.journalStale = true;
      }
      if (state.journalStale) renderJournal();
    }
    if (view !== "reader") setTypoOpen(false);
    syncNavSitTimer();

    window.requestAnimationFrame(function () {
      $$("#view-" + view + " .seg").forEach(function (s) { syncSeg(s, true); });
    });

    window.scrollTo(0, state.scroll[view] || 0);
    localSet(KEY.lastView, view);
    setMobileSidebar(false, { skipFocusRestore: true });
    if (wantsHeadingFocus) {
      var titleEl = $("#view-" + view + " .section-title");
      if (titleEl) titleEl.focus({ preventScroll: true });
    }
  }

  function setMobileSidebar(open, opts) {
    opts = opts || {};
    var sb = $("#sidebar");
    var wasOpen = sb.classList.contains("is-open");
    var hadFocus = sb.contains(document.activeElement);
    sb.classList.toggle("is-open", open);
    $("#sidebar-backdrop").classList.toggle("is-open", open);
    if (isNarrow()) $("#sidebar-open").setAttribute("aria-expanded", String(open));
    if (open && !wasOpen) {
      syncSidebarInert();
      var cur = $(".nav-item.is-active");
      if (cur) window.setTimeout(function () { cur.focus({ preventScroll: true }); }, 60);
    } else if (!open && wasOpen && hadFocus && !opts.skipFocusRestore) {
      var openBtn = $("#sidebar-open");
      if (openBtn && openBtn.focus) openBtn.focus({ preventScroll: true });
      syncSidebarInert();
    } else {
      syncSidebarInert();
    }
  }

  function syncSidebarAria() {
    var collapsed = $("#sidebar").classList.contains("is-collapsed");
    $("#sidebar-toggle").setAttribute("aria-expanded", String(!collapsed));
    if (!isNarrow()) $("#sidebar-open").setAttribute("aria-expanded", String(!collapsed));
    syncSidebarInert();
  }

  /* 桌面侧栏收起/展开：FLIP —— 布局只变一次，之后整块用 transform 滑动 */
  function setSidebarCollapsed(collapsed, animate) {
    var sb = $("#sidebar");
    var ws = $("#workspace");
    localSet(KEY.sidebar, collapsed ? "1" : "0");
    if (sb.classList.contains("is-collapsed") === collapsed && !sb.classList.contains("is-leaving")) {
      syncSidebarAria();
      return;
    }
    if (!animate || !canAnimate(ws) || isNarrow()) {
      if (sb._anim) sb._anim.cancel();
      if (ws._anim) ws._anim.cancel();
      sb.classList.remove("is-leaving");
      sb.classList.toggle("is-collapsed", collapsed);
      syncSidebarAria();
      syncSeg($("#sidebar-nav"), true);
      return;
    }
    var first = ws.getBoundingClientRect().left;
    var sbFrom = window.getComputedStyle(sb).transform;
    if (!sbFrom || sbFrom === "none") sbFrom = collapsed ? "translateX(0px)" : "translateX(-100%)";
    if (sb._anim) sb._anim.cancel();
    if (ws._anim) ws._anim.cancel();

    sb.classList.toggle("is-collapsed", collapsed);
    sb.classList.toggle("is-leaving", collapsed);
    var last = ws.getBoundingClientRect().left;
    var dx = first - last;
    var timing = { duration: DUR.slow, easing: EASE_OUT };
    ws._anim = ws.animate([{ transform: "translateX(" + dx + "px)" }, { transform: "translateX(0px)" }], timing);
    var anim = sb.animate([
      { transform: sbFrom },
      { transform: collapsed ? "translateX(-100%)" : "translateX(0px)" }
    ], timing);
    sb._anim = anim;
    anim.onfinish = function () {
      if (sb._anim !== anim) return;
      sb.classList.remove("is-leaving");
      sb._anim = null;
    };
    syncSidebarAria();
    if (!collapsed) syncSeg($("#sidebar-nav"), true);
  }

  /* ------------------------------------------------------------------------
     Epigraph & typography
     ------------------------------------------------------------------------ */
  function renderEpigraph(animate) {
    if (!epigraphs.length) return;
    var item = epigraphs[state.epigraphIdx % epigraphs.length];
    var apply = function () {
      $("#epigraph-quote").textContent = item.quote;
      $("#epigraph-source").textContent = item.source;
      $("#epigraph-next").setAttribute("aria-label", "禅语：" + item.quote + "（" + item.source + "）。点按换一句");
    };
    if (animate) swap($(".epigraph-swap"), apply, { dy: 5, outDur: 100, inDur: DUR.base });
    else apply();
  }

  var TYPO = {
    size: { prop: "--reader-size", unit: "px", control: "#reader-size-control", label: "#typo-size-val", key: KEY.size },
    leading: { prop: "--reader-leading", unit: "", control: "#reader-leading-control", label: "#typo-leading-val", key: KEY.leading },
    measure: { prop: "--reader-measure", unit: "px", control: "#reader-measure-control", label: "#typo-measure-val", key: KEY.measure }
  };

  function applyTypo(name, value, save) {
    var cfg = TYPO[name];
    document.documentElement.style.setProperty(cfg.prop, String(value) + cfg.unit);
    $(cfg.label).textContent = String(value) + cfg.unit;
    $(cfg.control).value = String(value);
    if (save) localSet(cfg.key, String(value));
    var changed = Object.keys(TYPO).some(function (k) {
      return Number($(TYPO[k].control).value) !== Number(TYPO_DEFAULTS[k]);
    });
    $("#typo-reset").hidden = !changed;
  }

  function initTypography() {
    Object.keys(TYPO).forEach(function (name) {
      applyTypo(name, localGet(TYPO[name].key, TYPO_DEFAULTS[name]), false);
    });
    if (window.BODHI_FONT) {
      window.BODHI_FONT.onChange(function (st) {
        var fallback = st.source === "system";
        $("#typo-guide").hidden = !fallback;
        $("#font-status-badge").textContent = fallback ? "未能载入思源宋体" : st.label;
      });
    }
  }

  function setTypoOpen(open) {
    var popEl = $("#typo-popover");
    if (!popEl) return;
    if (open) $("#typo-measure-row").hidden = readerVerticalEffective();
    popEl.classList.toggle("is-open", open);
    popEl.setAttribute("aria-hidden", String(!open));
    popEl.inert = !open;
    $("#topbar-typo-btn").setAttribute("aria-expanded", String(open));
    $("#topbar-typo-btn").classList.toggle("is-active", open);
  }

  /* ------------------------------------------------------------------------
     01 · 藏经精读 (Reader)
     ------------------------------------------------------------------------ */
  function currentBook() {
    return books[state.bookIndex] || null;
  }

  function sectionIndex(book, id) {
    if (!book || !Array.isArray(book.sections)) return -1;
    return book.sections.findIndex(function (s) { return s.id === id; });
  }

  function currentSection() {
    var book = currentBook();
    if (!book || !Array.isArray(book.sections) || !book.sections.length) return null;
    return book.sections.find(function (s) { return s.id === state.verseId; }) || book.sections[0];
  }

  function relatedBookButton(bookId) {
    if (!bookId) return "";
    var book = books.find(function (b) { return b.id === bookId; });
    if (!book) return "";
    return '<button class="ghost-btn related-book-btn" data-book-jump="' + esc(book.id) + '" type="button">研读《' + esc(book.title) + "》 →</button>";
  }

  function buildBookList() {
    var list = $("#book-list");
    $("#book-count").textContent = pad2(books.length) + " 部";
    if (!books.length) {
      list.innerHTML = '<p class="margin-text">典籍未能载入。</p>';
      return;
    }
    list.innerHTML = '<span class="seg-thumb" aria-hidden="true"></span>' + books.map(function (b, idx) {
      return (
        '<button type="button" class="book-item" data-book-index="' + idx + '">' +
          '<span class="book-item-title">' + esc(b.title) + "</span>" +
          '<span class="book-item-meta">' + esc(b.category) + " · " + esc(b.completeness) + "</span>" +
          '<span class="book-item-progress" aria-hidden="true"><span></span></span>' +
        "</button>"
      );
    }).join("");
    initSeg(list);
  }

  function updateBookList() {
    $$("#book-list .book-item").forEach(function (btn) {
      var idx = Number(btn.dataset.bookIndex);
      var b = books[idx];
      var active = idx === state.bookIndex;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
      var total = (b.sections || []).length || 1;
      var found = sectionIndex(b, state.bookPos[b.id]);
      var pct = found >= 0 ? (found + 1) / total : 0;
      btn.querySelector(".book-item-progress > span").style.transform = "scaleX(" + pct.toFixed(3) + ")";
      btn.title = found >= 0 ? "读至第 " + (found + 1) + " / " + total + " 节" : "尚未展读";
    });
    syncSeg($("#book-list"));
  }

  function verseHTML(book, s, idx) {
    var isSelected = s.id === state.verseId;
    var marked = isBookmarked(book.id, s.id);
    var noted = marked || Boolean(findVerseNote(book.id, s.id));
    return (
      '<article class="verse-block' + (isSelected ? " is-selected" : "") + (noted ? " is-noted" : "") +
        '" data-section-id="' + esc(s.id) + '" tabindex="0" role="button" aria-pressed="' + isSelected +
        '" aria-label="第 ' + (idx + 1) + " 节 · " + esc(s.heading) + '">' +
        '<span class="verse-heading"><span class="verse-num">' + pad2(idx + 1) + "</span>" + esc(s.heading) + "</span>" +
        '<p class="verse-text">' + esc(s.original) + "</p>" +
        '<span class="verse-mark" aria-hidden="true">' + (marked ? "★" : "") + "</span>" +
      "</article>"
    );
  }

  function updateVerseMark(bookId, sectionId) {
    var book = currentBook();
    if (!book || book.id !== bookId) return;
    var block = $('#verse-list .verse-block[data-section-id="' + cssEscape(sectionId) + '"]');
    if (!block) return;
    var marked = isBookmarked(bookId, sectionId);
    block.classList.toggle("is-noted", marked || Boolean(findVerseNote(bookId, sectionId)));
    block.querySelector(".verse-mark").textContent = marked ? "★" : "";
  }

  function renderMarginContent(section) {
    var box = $("#margin-content");
    if (!section) {
      box.innerHTML = '<p class="margin-text">点选左侧任一段经文，此处展开白话译读、义理疏解与日用观照。</p>';
      return;
    }
    var html = "";
    if (section.translation) {
      html += '<div class="margin-section"><span class="margin-label">白话直译</span><p class="margin-text">' + esc(section.translation) + "</p></div>";
    }
    if (section.commentary) {
      html += '<div class="margin-section"><span class="margin-label">义理疏解</span><p class="margin-text">' + esc(section.commentary) + "</p></div>";
    }
    if (section.delusion || section.awakened) {
      html += '<div class="dual-cards">';
      if (section.delusion) {
        html += '<div class="lens-card is-delusion"><div class="lens-card-title">凡夫执见 · 所破</div><p class="lens-card-body">' + esc(section.delusion) + "</p></div>";
      }
      if (section.awakened) {
        html += '<div class="lens-card is-awakened"><div class="lens-card-title">般若照见 · 实相</div><p class="lens-card-body">' + esc(section.awakened) + "</p></div>";
      }
      html += "</div>";
    }
    if (section.contemplation) {
      html += '<div class="margin-section"><span class="margin-label">日用观照</span><div class="contemplation-box">' + esc(section.contemplation) + "</div></div>";
    }
    box.innerHTML = html;
  }

  function syncBookmarkButton(book, section, mode) {
    var btn = $("#verse-bookmark");
    var on = Boolean(book && section && isBookmarked(book.id, section.id));
    btn.hidden = !section;
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("is-active", on);
    var glyph = btn.querySelector(".bookmark-glyph");
    glyph.textContent = on ? "★" : "☆";
    btn.title = on ? "已收藏 · 再按取消" : "收藏此段";
    btn.setAttribute("aria-label", on ? "取消收藏此段" : "收藏此段");
    if (mode === "on") pop(glyph);
    else if (mode === "off" && canAnimate(glyph)) {
      glyph.animate([{ transform: "scale(0.92)" }, { transform: "scale(1)" }], { duration: 150, easing: EASE_OUT });
    }
  }

  function rememberPosition(book, section) {
    if (!book || !section) return;
    state.bookPos[book.id] = section.id;
    writeJSON(KEY.bookPos, state.bookPos);
    localSet(KEY.lastRead, JSON.stringify({ bookId: book.id, sectionId: section.id }));
    updateBookList();
  }

  function updateMargin(opts) {
    opts = opts || {};
    var book = currentBook();
    var section = currentSection();
    var heading = section ? section.heading || "随文观照" : "随文观照";
    var drawer = $(".margin-drawer");
    if (drawer) drawer.scrollTop = 0;
    if (opts.animate) {
      var dir = opts.dir || 1;
      swap($("#margin-content"), function () { renderMarginContent(section); }, { dy: 5 * dir, outDur: 80, inDur: DUR.base });
      swapText($("#margin-heading"), heading, dir, { outDur: 80 });
    } else {
      renderMarginContent(section);
      $("#margin-heading").textContent = heading;
    }
    syncVerseNoteUI(book, section);
    syncBookmarkButton(book, section, null);
    rememberPosition(book, section);
  }

  function readerVerticalEffective() {
    var book = currentBook();
    return Boolean(state.vertical && book && book.supportsVertical);
  }

  function syncReaderButtons() {
    var book = currentBook();
    var vBtn = $("#vertical-toggle");
    var vertical = readerVerticalEffective();
    vBtn.hidden = !(book && book.supportsVertical);
    vBtn.classList.toggle("is-active", vertical);
    vBtn.setAttribute("aria-pressed", String(vertical));
    $("#pure-toggle").classList.toggle("is-active", state.pure);
    $("#pure-toggle").setAttribute("aria-pressed", String(state.pure));
    $("#typo-measure-row").hidden = vertical;
  }

  function syncReaderProgress(instant, dir) {
    var book = currentBook();
    var sections = book && Array.isArray(book.sections) ? book.sections : [];
    var curIdx = Math.max(0, sectionIndex(book, state.verseId));
    var text = "第 " + pad2(curIdx + 1) + " / " + pad2(sections.length || 1) + " 节";
    if (instant) $("#reader-progress").textContent = text;
    else swapText($("#reader-progress"), text, dir || 1);
    $("#reader-prev").disabled = curIdx <= 0;
    $("#reader-next").disabled = curIdx >= sections.length - 1;
    $("#reader-book-nav").hidden = !state.pure;
    $("#reader-book-label").textContent = book ? "《" + book.title + "》" : "";
  }

  function applyReaderLayout() {
    var canvas = $("#reader-canvas");
    canvas.classList.toggle("is-vertical", readerVerticalEffective());
    canvas.classList.toggle("is-pure", state.pure);
    $("#reader-layout").classList.toggle("is-pure", state.pure);
  }

  function saveReaderMode() {
    writeJSON(KEY.readerMode, { pure: state.pure, vertical: state.vertical });
  }

  function scrollToVerse(id, instant) {
    if (state.view !== "reader") return;
    var canvas = $("#reader-canvas");
    var block = $('#verse-list .verse-block[data-section-id="' + cssEscape(id) + '"]');
    if (!canvas || !block) return;
    var behavior = instant || reducedMotion() ? "auto" : "smooth";
    if (readerVerticalEffective()) {
      var cRect = canvas.getBoundingClientRect();
      var bRect = block.getBoundingClientRect();
      var targetLeft = canvas.scrollLeft + (bRect.left - cRect.left) - (cRect.width - bRect.width) / 2;
      canvas.scrollTo({ left: targetLeft, behavior: behavior });
      return;
    }
    block.scrollIntoView({ block: "center", inline: "nearest", behavior: behavior });
  }

  function renderBook(opts) {
    opts = opts || {};
    var book = currentBook();
    if (!book) return;
    var sections = Array.isArray(book.sections) ? book.sections : [];
    if (sectionIndex(book, state.verseId) < 0) {
      var remembered = state.bookPos[book.id];
      state.verseId = sectionIndex(book, remembered) >= 0 ? remembered : (sections[0] ? sections[0].id : "");
    }

    var apply = function () {
      $("#reader-title").textContent = book.fullTitle || book.title;
      $("#reader-meta").textContent = [book.author, book.category, book.completeness].filter(Boolean).join(" · ");
      $("#reader-summary").textContent = book.summary || "";
      $("#verse-list").innerHTML = sections.map(function (s, idx) { return verseHTML(book, s, idx); }).join("");
      applyReaderLayout();
      $("#reader-canvas").scrollLeft = 0;
      if (state.verseId && !opts.skipScroll && sectionIndex(book, state.verseId) > 0) {
        scrollToVerse(state.verseId, true);
      }
      if (opts.done) opts.done();
    };

    syncReaderProgress(opts.instant, opts.dir || 1);
    syncReaderButtons();

    if (opts.instant) apply();
    else swap($("#reader-swap"), apply, opts.axis === "x" ? { dx: (opts.dir || 1) * 16, dy: 0, inDur: DUR.slow } : { dy: 8, inDur: DUR.slow });
    updateMargin({ animate: !opts.instant, dir: opts.dir || 1 });
  }

  function goBook(idx, opts) {
    opts = opts || {};
    if (!books.length) return;
    idx = (idx + books.length) % books.length;
    if (idx === state.bookIndex && !opts.sectionId) {
      if (opts.done) opts.done();
      return;
    }
    flushVerseNote();
    var dir = opts.dir || (idx >= state.bookIndex ? 1 : -1);
    state.bookIndex = idx;
    state.verseId = opts.sectionId || "";
    renderBook({ dir: dir, axis: opts.axis, skipScroll: opts.skipScroll, done: opts.done });
  }

  function selectVerse(id, opts) {
    opts = opts || {};
    var book = currentBook();
    if (!book || sectionIndex(book, id) < 0) return;
    if (id === state.verseId) {
      if (opts.scroll) scrollToVerse(id);
      return;
    }
    flushVerseNote();
    var dir = sectionIndex(book, id) >= sectionIndex(book, state.verseId) ? 1 : -1;
    state.verseId = id;
    $$("#verse-list .verse-block").forEach(function (el) {
      var on = el.dataset.sectionId === id;
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-pressed", String(on));
    });
    syncReaderProgress(false, dir);
    updateMargin({ animate: true, dir: dir });
    if (opts.scroll) scrollToVerse(id);
  }

  function stepVerse(delta) {
    var book = currentBook();
    if (!book || !Array.isArray(book.sections) || !book.sections.length) return;
    var curIdx = Math.max(0, sectionIndex(book, state.verseId));
    var nextIdx = curIdx + delta;
    if (nextIdx < 0 || nextIdx >= book.sections.length) return;
    selectVerse(book.sections[nextIdx].id, { scroll: true });
  }

  function jumpToVerse(bookId, sectionId) {
    var idx = books.findIndex(function (b) { return b.id === bookId; });
    if (idx < 0) return;
    setView("reader", { focusHeading: false });
    if (idx !== state.bookIndex) {
      goBook(idx, {
        sectionId: sectionId,
        skipScroll: true,
        done: function () { if (sectionId) scrollToVerse(state.verseId, false); }
      });
    } else if (sectionId) {
      selectVerse(sectionId, { scroll: true });
    }
  }

  function setPure(on) {
    state.pure = on;
    saveReaderMode();
    syncReaderButtons();
    $("#reader-book-nav").hidden = !on;
    var layout = $("#reader-layout");
    var canvas = $("#reader-canvas");
    var sides = [$(".book-shelf"), $(".margin-drawer")];
    sides.concat([canvas]).forEach(function (el) {
      if (el._pureAnim) {
        el._pureAnim.cancel();
        el._pureAnim = null;
      }
    });
    if (!canAnimate(canvas) || isNarrow()) {
      applyReaderLayout();
      return;
    }
    var first = canvas.getBoundingClientRect();
    applyReaderLayout();
    var last = canvas.getBoundingClientRect();
    var dx = (first.left + first.width / 2) - (last.left + last.width / 2);
    canvas._pureAnim = canvas.animate([
      { transform: "translateX(" + dx + "px)", opacity: 0.7 },
      { transform: "translateX(0px)", opacity: 1 }
    ], { duration: DUR.slow, easing: EASE_OUT });
    if (!on) {
      sides.forEach(function (el, i) {
        el._pureAnim = el.animate([
          { opacity: 0, transform: "translateX(" + (i ? 14 : -14) + "px)" },
          { opacity: 1, transform: "translateX(0px)" }
        ], { duration: DUR.base, delay: 60, easing: EASE_OUT, fill: "backwards" });
      });
    }
  }

  function toggleVertical() {
    state.vertical = !state.vertical;
    saveReaderMode();
    syncReaderButtons();
    swap($("#reader-swap"), function () {
      applyReaderLayout();
      $("#reader-canvas").scrollLeft = 0;
      if (state.verseId) scrollToVerse(state.verseId, true);
    }, { dy: 0, inDur: DUR.slow });
  }

  function toggleBookmark() {
    var book = currentBook();
    var section = currentSection();
    if (!book || !section) return;
    var key = book.id + ":" + section.id;
    var nextBm = state.journal.bookmarks.slice();
    var idx = nextBm.indexOf(key);
    if (idx >= 0) nextBm.splice(idx, 1);
    else nextBm.push(key);
    if (!commitJournal(state.journal.entries, nextBm)) return;
    syncBookmarkButton(book, section, idx < 0 ? "on" : "off");
    updateVerseMark(book.id, section.id);
    markJournalStale();
  }

  /* 段落批注：边写边存（停笔 0.7 秒或离开即存），清空即撤除（可撤销） */
  var verseNote = { target: null, timer: 0, dirty: false };

  function syncVerseNoteUI(book, section) {
    var input = $("#verse-note-input");
    var openBtn = $("#verse-note-open");
    verseNote.dirty = false;
    window.clearTimeout(verseNote.timer);
    verseNote.target = book && section ? { book: book, section: section } : null;
    var note = verseNote.target ? findVerseNote(book.id, section.id) : null;
    input.value = note ? entryObservation(note) : "";
    input.disabled = !section;
    setStatus($("#verse-note-status"), note ? "已存入觉照手记 · " + timeLabel(note.updatedAt) : "", Boolean(note), false);
    openBtn.hidden = !note;
    openBtn.dataset.entryId = note ? note.id : "";
  }

  function scheduleVerseNote() {
    verseNote.dirty = true;
    window.clearTimeout(verseNote.timer);
    verseNote.timer = window.setTimeout(flushVerseNote, 700);
  }

  function flushVerseNote() {
    window.clearTimeout(verseNote.timer);
    if (!verseNote.dirty || !verseNote.target) return true;
    var book = verseNote.target.book;
    var section = verseNote.target.section;
    var val = $("#verse-note-input").value.trim();
    var existing = findVerseNote(book.id, section.id);
    var now = new Date().toISOString();
    var statusEl = $("#verse-note-status");
    var openBtn = $("#verse-note-open");

    if (!val) {
      if (!existing) {
        verseNote.dirty = false;
        return true;
      }
      if (hasDeepReflection(existing)) {
        var prevSnap = cloneEntry(existing);
        var cleared = cloneEntry(existing);
        cleared.observation = "";
        cleared.body = [cleared.doubt, cleared.light].filter(Boolean).join("\n\n");
        cleared.updatedAt = now;
        var nextWithCleared = state.journal.entries.map(function (e) { return e.id === existing.id ? cleared : e; });
        if (!commitJournal(nextWithCleared, state.journal.bookmarks)) {
          setStatus(statusEl, "未能保存，请稍后重试", false, true);
          return false;
        }
        verseNote.dirty = false;
        updateVerseMark(book.id, section.id);
        setStatus(statusEl, "批注已清空，手记其余栏目仍保留", false, true);
        openBtn.hidden = false;
        openBtn.dataset.entryId = cleared.id;
        markJournalStale();
        toast("已清空此段批注（手记中的疑情与微明已保留）", {
          label: "撤销",
          run: function () {
            var curEntry = findEntry(prevSnap.id);
            if (!curEntry || curEntry.updatedAt !== cleared.updatedAt) {
              toast("该手记随后已有变动，未覆盖当前内容");
              return;
            }
            var restored = cloneEntry(curEntry);
            restored.observation = entryObservation(prevSnap);
            restored.body = [restored.observation, restored.doubt, restored.light].filter(Boolean).join("\n\n");
            restored.updatedAt = prevSnap.updatedAt;
            var nextEntries = state.journal.entries.map(function (e) { return e.id === restored.id ? restored : e; });
            if (!commitJournal(nextEntries, state.journal.bookmarks)) return;
            updateVerseMark(book.id, section.id);
            if (verseNote.target && verseNote.target.book.id === book.id && verseNote.target.section.id === section.id) {
              syncVerseNoteUI(book, section);
            }
            markJournalStale();
          }
        });
        return true;
      }

      var idx = state.journal.entries.indexOf(existing);
      var removed = cloneEntry(existing);
      var nextAfterRemove = state.journal.entries.slice();
      nextAfterRemove.splice(idx, 1);
      if (!commitJournal(nextAfterRemove, state.journal.bookmarks)) {
        setStatus(statusEl, "未能保存，请稍后重试", false, true);
        return false;
      }
      verseNote.dirty = false;
      if (state.selectedEntryId === removed.id) state.selectedEntryId = null;
      updateVerseMark(book.id, section.id);
      setStatus(statusEl, "批注已撤除", false, true);
      openBtn.hidden = true;
      openBtn.dataset.entryId = "";
      markJournalStale();
      toast("已清除此段批注", {
        label: "撤销",
        run: function () {
          if (findEntry(removed.id) || findVerseNote(book.id, section.id)) {
            toast("此段已有新批注，未覆盖当前内容");
            return;
          }
          var nextRestore = state.journal.entries.slice();
          nextRestore.splice(Math.min(idx, nextRestore.length), 0, cloneEntry(removed));
          if (!commitJournal(nextRestore, state.journal.bookmarks)) return;
          updateVerseMark(book.id, section.id);
          if (verseNote.target && verseNote.target.book.id === book.id && verseNote.target.section.id === section.id) {
            syncVerseNoteUI(book, section);
          }
          markJournalStale();
        }
      });
      return true;
    }

    var nextList;
    var savedEntry;
    if (existing) {
      savedEntry = cloneEntry(existing);
      savedEntry.observation = val;
      savedEntry.body = [val, savedEntry.doubt, savedEntry.light].filter(Boolean).join("\n\n");
      savedEntry.updatedAt = now;
      nextList = state.journal.entries.map(function (e) { return e.id === savedEntry.id ? savedEntry : e; });
    } else {
      savedEntry = {
        id: makeId("v"),
        type: "verse",
        title: "《" + book.title + "》· " + section.heading,
        scene: String(section.original || "").slice(0, 60),
        observation: val,
        doubt: "",
        light: "",
        body: val,
        bookId: book.id,
        sectionId: section.id,
        tags: [book.title, "经文批注"],
        createdAt: now,
        updatedAt: now
      };
      nextList = [savedEntry].concat(state.journal.entries);
    }
    if (!commitJournal(nextList, state.journal.bookmarks)) {
      setStatus(statusEl, "未能保存，请稍后重试", false, true);
      return false;
    }
    verseNote.dirty = false;
    updateVerseMark(book.id, section.id);
    setStatus(statusEl, "已存入觉照手记 · " + timeLabel(now), true, true);
    openBtn.hidden = false;
    openBtn.dataset.entryId = savedEntry.id;
    markJournalStale();
    return true;
  }

  /* ------------------------------------------------------------------------
     02 · 觉悟全景 (Star Map / Eight Consciousnesses / Diamond Triads)
     ------------------------------------------------------------------------ */
  function buildAtlasMap() {
    var svg = $("#atlas-svg");
    if (!svg) return;
    svg.innerHTML = "";
    svg.appendChild(svgEl("circle", { cx: 632, cy: 195, r: 76, fill: "none", stroke: "var(--border)", "stroke-dasharray": "3 5" }));
    svg.appendChild(svgEl("circle", { cx: 365, cy: 195, r: 175, fill: "none", stroke: "var(--border)", opacity: "0.4" }));

    [
      { x: 96, y: 42, text: "立根 · 缘起" },
      { x: 274, y: 42, text: "破相 · 性空" },
      { x: 452, y: 42, text: "析心 / 显性" },
      { x: 632, y: 42, text: "直指 · 顿悟" }
    ].forEach(function (lbl) {
      svg.appendChild(svgEl("text", {
        x: lbl.x, y: lbl.y, "text-anchor": "middle", fill: "var(--fg-muted)", "font-size": "12.5", "letter-spacing": "2"
      }, lbl.text));
    });

    var byId = {};
    mapNodes.forEach(function (n) { byId[n.id] = n; });

    mapEdges.forEach(function (edge) {
      var aId = Array.isArray(edge) ? edge[0] : edge.from;
      var bId = Array.isArray(edge) ? edge[1] : edge.to;
      var a = byId[aId];
      var b = byId[bId];
      if (!a || !b) return;
      var isVert = aId === "yogacara" && bId === "tathagata";
      var d = isVert
        ? "M " + a.x + " " + (a.y + 34) + " L " + b.x + " " + (b.y - 34)
        : "M " + (a.x + 62) + " " + a.y + " C " + ((a.x + b.x) / 2) + " " + a.y + ", " + ((a.x + b.x) / 2) + " " + b.y + ", " + (b.x - 62) + " " + b.y;
      svg.appendChild(svgEl("path", {
        d: d,
        fill: "none",
        "stroke-dasharray": isVert ? "4 4" : "none",
        class: "svg-edge",
        "data-from": aId,
        "data-to": bId
      }));
    });

    mapNodes.forEach(function (node) {
      var g = svgEl("g", {
        class: "svg-node",
        tabindex: "0",
        role: "button",
        "aria-pressed": "false",
        "data-map-id": node.id,
        "aria-label": node.title + "：" + node.subtitle
      });
      var w = 124;
      var h = 68;
      g.appendChild(svgEl("rect", { class: "node-box", x: node.x - w / 2, y: node.y - h / 2, width: w, height: h, rx: 5 }));
      g.appendChild(svgEl("text", {
        class: "node-num", x: node.x - w / 2 + 10, y: node.y - h / 2 + 16, "font-size": "11", "font-family": "var(--font-sans)"
      }, node.num));
      g.appendChild(svgEl("text", {
        x: node.x, y: node.y - 2, "text-anchor": "middle", fill: "var(--fg)", "font-size": "15", "font-family": "var(--font-serif)", "letter-spacing": "2"
      }, node.title));
      g.appendChild(svgEl("text", {
        x: node.x, y: node.y + 18, "text-anchor": "middle", fill: "var(--fg-muted)", "font-size": "12", "letter-spacing": "0.5"
      }, (node.subtitle || "").split(" · ")[0]));
      svg.appendChild(g);
    });
  }

  function atlasInspectorHTML(node) {
    return (
      '<h2 class="inspector-title">' + esc(node.title) + "</h2>" +
      '<div class="inspector-meta">' +
        '<span class="inspector-num">第 ' + esc(node.num) + " 重</span>" +
        '<span class="inspector-sanskrit">' + esc(node.sanskrit) + "</span>" +
      "</div>" +
      '<p class="inspector-subtitle">' + esc(node.subtitle) + "</p>" +
      '<div class="detail-block"><span class="detail-label">核心命题</span><p class="detail-text">' + esc(node.core) + "</p></div>" +
      '<div class="detail-block"><span class="detail-label">所破之执</span><p class="detail-text">' + esc(node.dissolves) + "</p></div>" +
      '<div class="detail-block"><span class="detail-label">典籍印证</span><blockquote class="detail-quote">' + esc(node.quote) + "</blockquote></div>" +
      '<div class="detail-block"><span class="detail-label">通向禅宗</span><p class="detail-text">' + esc(node.zenBridge) + "</p></div>" +
      '<div class="detail-block"><span class="detail-label">代表典籍</span>' +
        '<p class="detail-meta-list">' + (node.scriptures || []).map(esc).join(" · ") + "</p>" +
        relatedBookButton(node.relatedBookId) +
      "</div>"
    );
  }

  function updateAtlasMap(animate) {
    var id = state.atlasNodeId;
    $$("#atlas-svg .svg-node").forEach(function (g) {
      var on = g.getAttribute("data-map-id") === id;
      g.classList.toggle("is-selected", on);
      g.setAttribute("aria-pressed", String(on));
    });
    $$("#atlas-svg .svg-edge").forEach(function (p) {
      p.classList.toggle("is-highlighted", p.getAttribute("data-from") === id || p.getAttribute("data-to") === id);
    });
    var node = mapNodes.find(function (n) { return n.id === id; }) || mapNodes[0];
    var box = $("#atlas-inspector");
    if (!node || !box) return;
    var apply = function () { box.innerHTML = atlasInspectorHTML(node); };
    if (animate) swap(box, apply, { dy: 6 });
    else apply();
  }

  function renderConsciousnesses() {
    var root = $("#consciousness-list");
    if (!root) return;
    root.innerHTML = consciousnesses.map(function (item, idx) {
      return (
        '<article class="wisdom-card" data-wisdom-idx="' + idx + '">' +
          '<div class="wisdom-card-head">' +
            "<div>" +
              '<span class="wisdom-level">' + esc(item.level) + " · " + esc(item.sanskrit) + "</span>" +
              '<span class="wisdom-source">' + esc(item.name) + "</span>" +
            "</div>" +
            '<span class="wisdom-arrow" aria-label="转为">→</span>' +
            '<span class="wisdom-target">' + esc(item.wisdom) + "</span>" +
          "</div>" +
          "<p>" + esc(item.role) + "</p>" +
          '<div class="dual-cards">' +
            '<div class="lens-card is-delusion"><div class="lens-card-title">凡夫流转 · 染污相</div><p class="lens-card-body">' + esc(item.delusion) + "</p></div>" +
            '<div class="lens-card is-awakened"><div class="lens-card-title">转识成智 · ' + esc(item.wisdom) + '</div><p class="lens-card-body">' + esc(item.wisdomDesc) + "</p></div>" +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  function buildDiamondSelector() {
    var sel = $("#diamond-selector");
    if (!sel || !triads.length) return;
    sel.innerHTML = '<span class="seg-thumb" aria-hidden="true"></span>' + triads.map(function (t, i) {
      return '<button type="button" class="select-pill" role="radio" aria-checked="false" data-triad-idx="' + i + '">' + esc(t.concept) + "</button>";
    }).join("");
    initSeg(sel);
  }

  function renderDiamondTriad(animate) {
    var flow = $("#diamond-flow");
    var meaning = $("#diamond-meaning");
    var bookLink = $("#diamond-book-link");
    if (!flow || !meaning || !triads.length) return;
    state.triadIndex = Math.min(Math.max(0, state.triadIndex), triads.length - 1);
    setSegActive($("#diamond-selector"), function (btn) { return Number(btn.dataset.triadIdx) === state.triadIndex; });
    var cur = triads[state.triadIndex];
    var apply = function () {
      flow.innerHTML =
        '<div class="triad-step">' +
          '<span class="triad-step-num">01 · 世俗假立 (A)</span>' +
          '<h3 class="triad-step-title">' + esc(cur.statementA) + "</h3>" +
          '<p class="triad-step-desc">承认眼前现象在世俗因缘层面的宛然显现。</p>' +
        "</div>" +
        '<div class="triad-arrow" aria-hidden="true">→</div>' +
        '<div class="triad-step is-active">' +
          '<span class="triad-step-num">02 · 般若扫相 (即非A)</span>' +
          '<h3 class="triad-step-title">' + esc(cur.negationB) + "</h3>" +
          '<p class="triad-step-desc">照破其众缘和合、并无独立不变的自性。</p>' +
        "</div>" +
        '<div class="triad-arrow" aria-hidden="true">→</div>' +
        '<div class="triad-step">' +
          '<span class="triad-step-num">03 · 假名妙用 (是名A)</span>' +
          '<h3 class="triad-step-title">' + esc(cur.synthesisC) + "</h3>" +
          '<p class="triad-step-desc">去执之后重新安立名字，不执实有，亦不堕虚无。</p>' +
        "</div>";
      meaning.textContent = cur.meaning;
      if (bookLink) bookLink.innerHTML = relatedBookButton("diamond");
    };
    if (animate) {
      swap(flow, function () {
        apply();
        $$(".triad-step", flow).forEach(function (step, i) {
          fadeIn(step, { dy: 6, delay: i * 45, duration: DUR.base });
        });
        $$(".triad-arrow", flow).forEach(function (arr, i) {
          fadeIn(arr, { dy: 0, delay: i * 45 + 25, duration: DUR.fast });
        });
      }, { dy: 4, skipIn: true });
    } else {
      apply();
    }
  }

  function showAtlasTab(tab, instant) {
    if (ATLAS_TABS.indexOf(tab) < 0) tab = "map";
    var prev = state.atlasTab;
    var dir = ATLAS_TABS.indexOf(tab) >= ATLAS_TABS.indexOf(prev) ? "forward" : "back";
    state.atlasTab = tab;
    setSegActive($("#view-atlas .sub-tabs"), function (btn) { return btn.dataset.atlasTab === tab; });
    ["map", "consciousness", "diamond"].forEach(function (name) {
      var panel = $("#atlas-" + name + "-panel");
      if (name === tab) panel.dataset.dir = dir;
      panel.classList.toggle("is-active", name === tab);
    });
    window.requestAnimationFrame(function () {
      $$("#atlas-" + tab + "-panel .seg").forEach(function (s) { syncSeg(s, true); });
    });
    if (!instant) saveUi();
  }

  /* ------------------------------------------------------------------------
     03 · 十牛图 (Oxherding Enso + 10 Minimalist Ink Glyphs)
     ------------------------------------------------------------------------ */
  var OX = { cx: 190, cy: 190, R: 136 };

  function buildOxCenterGlyph(idx) {
    var g = svgEl("g", {
      class: "ox-glyph",
      fill: "none",
      stroke: "var(--fg)",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });

    switch (idx) {
      case 0:
        ["M 145 215 Q 160 190 155 168", "M 172 222 Q 186 196 178 166", "M 196 220 Q 204 195 212 174", "M 220 212 Q 226 196 232 180", "M 142 222 L 238 222"].forEach(function (d, i) {
          g.appendChild(svgEl("path", { d: d, "stroke-width": i === 4 ? "1" : "1.4", opacity: i === 4 ? "0.35" : "0.75" }));
        });
        break;
      case 1:
        [[154, 214], [174, 202], [194, 190], [212, 176], [228, 162]].forEach(function (pt, i) {
          g.appendChild(svgEl("circle", { cx: pt[0], cy: pt[1], r: 3.2, fill: i === 4 ? "var(--seal)" : "var(--fg)", stroke: "none", opacity: String(0.35 + i * 0.16) }));
        });
        g.appendChild(svgEl("path", { d: "M 146 218 Q 188 198 232 158", "stroke-width": "1", "stroke-dasharray": "3 5", opacity: "0.4" }));
        break;
      case 2:
        g.appendChild(svgEl("path", { d: "M 138 216 Q 190 176 242 216", "stroke-width": "1.6", opacity: "0.8" }));
        g.appendChild(svgEl("circle", { cx: 190, cy: 162, r: 16, stroke: "var(--seal)", "stroke-width": "1.5" }));
        break;
      case 3:
        g.appendChild(svgEl("path", { d: "M 146 212 C 166 154, 214 226, 234 168", "stroke-width": "1.8" }));
        g.appendChild(svgEl("circle", { cx: 168, cy: 190, r: 5, fill: "var(--fg)", stroke: "none" }));
        g.appendChild(svgEl("circle", { cx: 212, cy: 190, r: 5, stroke: "var(--seal)", "stroke-width": "1.6" }));
        break;
      case 4:
        g.appendChild(svgEl("circle", { cx: 178, cy: 190, r: 28, "stroke-width": "1.4", opacity: "0.8" }));
        g.appendChild(svgEl("circle", { cx: 204, cy: 190, r: 28, stroke: "var(--gold)", "stroke-width": "1.4", opacity: "0.8" }));
        break;
      case 5:
        g.appendChild(svgEl("path", { d: "M 138 198 Q 164 176 190 192 T 242 184", "stroke-width": "1.7" }));
        g.appendChild(svgEl("path", { d: "M 152 212 Q 190 202 228 212", "stroke-width": "1", opacity: "0.45" }));
        g.appendChild(svgEl("circle", { cx: 222, cy: 162, r: 6, fill: "var(--gold)", stroke: "none", opacity: "0.8" }));
        break;
      case 6:
        g.appendChild(svgEl("circle", { cx: 190, cy: 190, r: 44, "stroke-width": "1", "stroke-dasharray": "2 5", opacity: "0.45" }));
        g.appendChild(svgEl("circle", { cx: 190, cy: 190, r: 7, fill: "var(--fg)", stroke: "none", opacity: "0.9" }));
        break;
      case 7:
        g.appendChild(svgEl("path", { d: "M 190 136 A 54 54 0 1 1 154 149", "stroke-width": "2.6", opacity: "0.9" }));
        break;
      case 8:
        g.appendChild(svgEl("path", { d: "M 138 206 Q 164 196 190 206 T 242 206", "stroke-width": "1.3", opacity: "0.65" }));
        g.appendChild(svgEl("path", { d: "M 148 218 Q 190 210 232 218", "stroke-width": "1", opacity: "0.4" }));
        g.appendChild(svgEl("path", { d: "M 190 198 L 190 166", "stroke-width": "1.3", opacity: "0.7" }));
        g.appendChild(svgEl("circle", { cx: 190, cy: 160, r: 7, fill: "var(--seal)", stroke: "none", opacity: "0.9" }));
        break;
      case 9:
        g.appendChild(svgEl("circle", { cx: 190, cy: 190, r: 44, "stroke-width": "1.2", opacity: "0.45" }));
        g.appendChild(svgEl("line", { x1: 152, y1: 190, x2: 228, y2: 190, "stroke-width": "1.3", opacity: "0.7" }));
        g.appendChild(svgEl("line", { x1: 190, y1: 152, x2: 190, y2: 228, "stroke-width": "1.3", opacity: "0.7" }));
        g.appendChild(svgEl("circle", { cx: 190, cy: 190, r: 5, fill: "var(--seal)", stroke: "none" }));
        break;
    }
    return g;
  }

  function buildOx() {
    var svg = $("#ox-svg");
    if (!svg || !oxStages.length) return;
    svg.innerHTML = "";
    svg.appendChild(svgEl("circle", { cx: OX.cx, cy: OX.cy, r: OX.R, fill: "none", stroke: "var(--border-strong)", "stroke-width": "1" }));
    oxArcEl = svgEl("circle", {
      class: "ox-arc",
      cx: OX.cx,
      cy: OX.cy,
      r: OX.R,
      pathLength: "100",
      transform: "rotate(-90 " + OX.cx + " " + OX.cy + ")"
    });
    svg.appendChild(oxArcEl);
    oxGlyphLayerEl = svgEl("g");
    svg.appendChild(oxGlyphLayerEl);

    oxStages.forEach(function (st, i) {
      var angle = -Math.PI / 2 + (i / oxStages.length) * Math.PI * 2;
      var nx = OX.cx + OX.R * Math.cos(angle);
      var ny = OX.cy + OX.R * Math.sin(angle);
      var lx = OX.cx + (OX.R + 32) * Math.cos(angle);
      var ly = OX.cy + (OX.R + 32) * Math.sin(angle);
      var g = svgEl("g", {
        class: "svg-node ox-node",
        tabindex: "0",
        role: "button",
        "aria-pressed": "false",
        "data-ox-idx": i,
        "aria-label": "第" + st.cn + "阶：" + st.title
      });
      g.appendChild(svgEl("circle", { class: "ox-dot", cx: nx, cy: ny, r: 11 }));
      g.appendChild(svgEl("text", { class: "ox-dot-label", x: nx, y: ny + 4, "text-anchor": "middle", "font-size": "12", "font-family": "var(--font-serif)" }, st.cn));
      g.appendChild(svgEl("text", { class: "ox-label", x: lx, y: ly + 4, "text-anchor": "middle", "font-size": "12", "font-family": "var(--font-serif)", "letter-spacing": "1" }, st.title));
      svg.appendChild(g);
    });
  }

  function swapOxGlyph(idx, animate) {
    if (!oxGlyphLayerEl) return;
    var next = buildOxCenterGlyph(idx);
    next.style.transformOrigin = OX.cx + "px " + OX.cy + "px";
    var olds = $$(".ox-glyph", oxGlyphLayerEl);
    if (!animate || !canAnimate(next)) {
      oxGlyphLayerEl.innerHTML = "";
      oxGlyphLayerEl.appendChild(next);
      return;
    }
    olds.forEach(function (old) {
      if (old.classList.contains("is-leaving")) return;
      var cs = window.getComputedStyle(old);
      var fromOpacity = cs.opacity === "" ? 1 : Number(cs.opacity);
      var fromTransform = cs.transform && cs.transform !== "none" ? cs.transform : "scale(1)";
      if (old._oxAnim) old._oxAnim.cancel();
      old.classList.add("is-leaving");
      var a = old.animate(
        [{ opacity: fromOpacity, transform: fromTransform }, { opacity: 0, transform: "scale(0.94)" }],
        { duration: Math.max(40, DUR.fast * fromOpacity), easing: EASE_OUT, fill: "forwards" }
      );
      old._oxAnim = a;
      a.onfinish = function () { old.remove(); };
    });
    oxGlyphLayerEl.appendChild(next);
    next._oxAnim = next.animate(
      [{ opacity: 0, transform: "scale(1.04)" }, { opacity: 1, transform: "scale(1)" }],
      { duration: DUR.base, easing: EASE_OUT }
    );
  }

  function oxInspectorHTML(cur) {
    return (
      '<h2 class="inspector-title">第' + esc(cur.cn) + " · " + esc(cur.title) + "</h2>" +
      '<div class="inspector-meta">' +
        '<span class="inspector-num">十牛 · 第 ' + esc(cur.num) + " 图</span>" +
        '<span class="inspector-sanskrit">' + esc(cur.en) + "</span>" +
      "</div>" +
      '<p class="inspector-subtitle">' + esc(cur.phase) + "</p>" +
      '<blockquote class="ox-poem">' + esc(cur.poem).replace(/\n/g, "<br/>") + "</blockquote>" +
      '<div class="detail-block"><span class="detail-label">心境特征</span><p class="detail-text">' + esc(cur.state) + "</p></div>" +
      '<div class="detail-block"><span class="detail-label">易堕之病</span><p class="detail-text">' + esc(cur.trap) + "</p></div>" +
      '<div class="detail-block"><span class="detail-label">指月之语</span><blockquote class="detail-quote">' + esc(cur.pointer) + "</blockquote>" + relatedBookButton(cur.relatedBookId) + "</div>"
    );
  }

  function showOx(idx, dir, instant) {
    if (!oxStages.length) return;
    var len = oxStages.length;
    var next = ((idx % len) + len) % len;
    var prev = state.oxIndex;
    if (next === prev && !instant) return;
    var d = dir || (next >= prev ? 1 : -1);
    state.oxIndex = next;

    if (oxArcEl) oxArcEl.style.strokeDashoffset = String(100 - (next / len) * 100);
    $$("#ox-svg .ox-node").forEach(function (g) {
      var on = Number(g.getAttribute("data-ox-idx")) === next;
      g.classList.toggle("is-selected", on);
      g.setAttribute("aria-pressed", String(on));
    });
    swapOxGlyph(next, !instant);

    var cur = oxStages[next];
    var progress = cur.num + " / " + pad2(len);
    var box = $("#ox-inspector");
    if (instant) {
      $("#ox-phase-tag").textContent = cur.phase;
      $("#ox-progress").textContent = progress;
      box.innerHTML = oxInspectorHTML(cur);
    } else {
      swapText($("#ox-phase-tag"), cur.phase, d);
      swapText($("#ox-progress"), progress, d);
      swap(box, function () { box.innerHTML = oxInspectorHTML(cur); }, { dx: 14 * d, dy: 0 });
      saveUi();
    }
  }

  /* ------------------------------------------------------------------------
     04 · 五家法脉 (Lineage) — 选中后传承自根部依次亮起，交代「从哪来」
     ------------------------------------------------------------------------ */
  function lineageChain(id) {
    var byId = {};
    lineageNodes.forEach(function (n) { byId[n.id] = n; });
    var chain = [];
    var seen = {};
    var cur = byId[id];
    while (cur && !seen[cur.id]) {
      seen[cur.id] = true;
      chain.unshift(cur.id);
      cur = cur.parent ? byId[cur.parent] : null;
    }
    return chain;
  }

  function buildLineage() {
    var svg = $("#lineage-svg");
    if (!svg) return;
    svg.innerHTML = "";
    var byId = {};
    lineageNodes.forEach(function (n) { byId[n.id] = n; });

    [
      { x: 74, label: "西来初祖" },
      { x: 222, label: "南宗顿悟" },
      { x: 374, label: "二大支流" },
      { x: 526, label: "洪州 / 石头" },
      { x: 710, label: "一花开五叶" }
    ].forEach(function (col) {
      svg.appendChild(svgEl("text", {
        x: col.x, y: 22, "text-anchor": "middle", fill: "var(--fg-muted)", "font-size": "12", "letter-spacing": "1.5"
      }, col.label));
    });

    lineageNodes.forEach(function (node) {
      if (!node.parent) return;
      var p = byId[node.parent];
      if (!p) return;
      var x1 = p.x + 54;
      var y1 = p.y;
      var x2 = node.x - 54;
      var y2 = node.y;
      var mid = (x1 + x2) / 2;
      svg.appendChild(svgEl("path", {
        d: "M " + x1 + " " + y1 + " C " + mid + " " + y1 + ", " + mid + " " + y2 + ", " + x2 + " " + y2,
        fill: "none",
        class: "svg-edge",
        "data-child": node.id,
        "data-parent": p.id
      }));
    });

    lineageNodes.forEach(function (node) {
      var w = 108;
      var h = 46;
      var g = svgEl("g", {
        class: "svg-node lineage-node",
        tabindex: "0",
        role: "button",
        "aria-pressed": "false",
        "data-lineage-id": node.id,
        "aria-label": node.name + "，" + node.role
      });
      g.appendChild(svgEl("rect", { class: "node-box", x: node.x - w / 2, y: node.y - h / 2, width: w, height: h, rx: 4 }));
      g.appendChild(svgEl("text", {
        x: node.x, y: node.y - 2, "text-anchor": "middle", fill: "var(--fg)", "font-size": "14", "font-family": "var(--font-serif)", "letter-spacing": "1.5"
      }, node.name));
      g.appendChild(svgEl("text", {
        x: node.x, y: node.y + 14, "text-anchor": "middle", fill: "var(--fg-muted)", "font-size": "11"
      }, node.era));
      svg.appendChild(g);
    });
  }

  function lineageDossierHTML(node) {
    return (
      "<div>" +
        '<h2 class="inspector-title lineage-name">' + esc(node.name) + "</h2>" +
        '<div class="inspector-meta"><span class="inspector-num">' + esc(node.era) + "</span></div>" +
        '<p class="inspector-subtitle lineage-role">' + esc(node.role) + "</p>" +
        '<p class="lineage-style">宗风 · ' + esc(node.style) + "</p>" +
        "<div>" + relatedBookButton(node.relatedBookId) + "</div>" +
      "</div>" +
      "<div>" +
        '<span class="detail-label">宗风与接引手段</span>' +
        '<p class="detail-text">' + esc(node.method) + "</p>" +
      "</div>" +
      "<div>" +
        '<span class="detail-label">法语一瞥</span>' +
        '<blockquote class="detail-quote">' + esc(node.quote) + "</blockquote>" +
      "</div>"
    );
  }

  function updateLineage(animate) {
    var chain = lineageChain(state.lineageId);
    var depth = {};
    chain.forEach(function (id, i) { depth[id] = i; });
    var step = 65;
    $$("#lineage-svg .svg-edge").forEach(function (p) {
      var child = p.getAttribute("data-child");
      var parent = p.getAttribute("data-parent");
      var on = depth[child] !== undefined && depth[parent] !== undefined;
      p.style.transitionDelay = animate && on && !reducedMotion() ? depth[parent] * step + "ms" : "0ms";
      p.classList.toggle("is-highlighted", on);
    });
    $$("#lineage-svg .lineage-node").forEach(function (g) {
      var id = g.getAttribute("data-lineage-id");
      var onPath = depth[id] !== undefined;
      var box = g.querySelector(".node-box");
      box.style.transitionDelay = animate && onPath && !reducedMotion() ? depth[id] * step + "ms" : "0ms";
      g.classList.toggle("is-path", onPath);
      g.classList.toggle("is-selected", id === state.lineageId);
      g.setAttribute("aria-pressed", String(id === state.lineageId));
    });
    var node = lineageNodes.find(function (n) { return n.id === state.lineageId; }) || lineageNodes[0];
    var box = $("#lineage-dossier");
    if (!node || !box) return;
    var apply = function () { box.innerHTML = lineageDossierHTML(node); };
    if (animate) swap(box, apply, { dy: 6 });
    else apply();
  }

  /* ------------------------------------------------------------------------
     05 · 公案参究 (Koans)
     ------------------------------------------------------------------------ */
  function buildKoanSelector() {
    var sel = $("#koan-selector");
    if (!sel || !koans.length) return;
    sel.innerHTML = '<span class="seg-thumb" aria-hidden="true"></span>' + koans.map(function (k, i) {
      return '<button type="button" class="select-pill" role="radio" aria-checked="false" data-koan-idx="' + i + '">' + esc(k.title) + "</button>";
    }).join("");
    initSeg(sel);
  }

  function syncKoanLayers() {
    [["one", state.koanLayerOne], ["two", state.koanLayerTwo]].forEach(function (pair) {
      var layer = $("#koan-layer-" + pair[0]);
      var btn = $("#koan-layer-" + pair[0] + "-toggle");
      layer.classList.toggle("is-open", pair[1]);
      layer.setAttribute("aria-hidden", String(!pair[1]));
      btn.classList.toggle("is-active", pair[1]);
      btn.setAttribute("aria-expanded", String(pair[1]));
    });
  }

  function showKoan(idx, opts) {
    opts = opts || {};
    if (!koans.length) return;
    var len = koans.length;
    var next = ((idx % len) + len) % len;
    if (next === state.koanIndex && !opts.instant && !opts.force) return;
    flushKoanNote();
    state.koanIndex = next;
    var cur = koans[next];
    setSegActive($("#koan-selector"), function (btn) { return Number(btn.dataset.koanIdx) === next; });

    var apply = function () {
      $("#koan-source").textContent = [cur.source, cur.master].filter(Boolean).join(" · ");
      $("#koan-title").textContent = cur.title;
      $("#koan-quote").innerHTML = esc(cur.text).replace(/\n/g, "<br/>");
      $("#koan-book-link").innerHTML = relatedBookButton(cur.relatedBookId);
      $("#koan-doubt").textContent = cur.doubt;
      $("#koan-insight").textContent = cur.insight;
    };
    if (opts.instant) {
      apply();
    } else {
      swap($("#koan-swap"), apply, { dy: 8, inDur: DUR.slow });
      saveUi();
    }
    syncKoanNote(cur);
  }

  /* 参究心得：每则公案每天一篇，边写边存；再回到这则公案时原样续写 */
  var koanNote = { koanId: null, timer: 0, dirty: false };

  function koanEntryToday(koanId) {
    var today = localDateKey();
    return state.journal.entries.find(function (e) {
      return e.type === "koan" && e.koanId === koanId && localDateKey(e.createdAt) === today;
    }) || null;
  }

  function syncKoanNoteMeta(cur, animateStatus) {
    var statusEl = $("#koan-note-status");
    var openBtn = $("#koan-note-open");
    if (!cur) {
      setStatus(statusEl, "", false, false);
      openBtn.hidden = true;
      return;
    }
    var entry = koanEntryToday(cur.id);
    if (entry) {
      setStatus(statusEl, "今日心得已存入手记 · " + timeLabel(entry.updatedAt), true, animateStatus);
      openBtn.hidden = false;
      openBtn.textContent = "在手记中展开 →";
      openBtn.dataset.action = "entry";
      openBtn.dataset.entryId = entry.id;
      return;
    }
    var earlier = state.journal.entries.filter(function (e) { return e.type === "koan" && e.koanId === cur.id; }).length;
    setStatus(statusEl, "", false, false);
    if (earlier > 0) {
      openBtn.hidden = false;
      openBtn.textContent = "往日心得 " + earlier + " 篇 →";
      openBtn.dataset.action = "filter";
      openBtn.dataset.koanTitle = cur.title;
    } else {
      openBtn.hidden = true;
    }
  }

  function syncKoanNote(cur) {
    koanNote.koanId = cur ? cur.id : null;
    koanNote.dirty = false;
    window.clearTimeout(koanNote.timer);
    var entry = cur ? koanEntryToday(cur.id) : null;
    $("#koan-note").value = entry ? entryObservation(entry) : "";
    syncKoanNoteMeta(cur, false);
  }

  function scheduleKoanNote() {
    koanNote.dirty = true;
    window.clearTimeout(koanNote.timer);
    koanNote.timer = window.setTimeout(flushKoanNote, 700);
  }

  function flushKoanNote() {
    window.clearTimeout(koanNote.timer);
    if (!koanNote.dirty) return true;
    var cur = koans.find(function (k) { return k.id === koanNote.koanId; });
    if (!cur) {
      koanNote.dirty = false;
      return true;
    }
    var text = $("#koan-note").value.trim();
    var entry = koanEntryToday(cur.id);
    var now = new Date().toISOString();
    var statusEl = $("#koan-note-status");

    if (!text) {
      if (!entry) {
        koanNote.dirty = false;
        return true;
      }
      if (hasDeepReflection(entry)) {
        var prevSnap = cloneEntry(entry);
        var cleared = cloneEntry(entry);
        cleared.observation = "";
        cleared.body = [cleared.doubt, cleared.light].filter(Boolean).join("\n\n");
        cleared.updatedAt = now;
        var nextWithCleared = state.journal.entries.map(function (e) { return e.id === entry.id ? cleared : e; });
        if (!commitJournal(nextWithCleared, state.journal.bookmarks)) {
          setStatus(statusEl, "未能保存，请稍后重试", false, true);
          return false;
        }
        koanNote.dirty = false;
        syncKoanNoteMeta(cur, false);
        setStatus(statusEl, "心得已清空，手记其余栏目仍保留", false, true);
        markJournalStale();
        toast("已清空今日心得（手记中的疑情与微明已保留）", {
          label: "撤销",
          run: function () {
            var curEntry = findEntry(prevSnap.id);
            if (!curEntry || curEntry.updatedAt !== cleared.updatedAt) {
              toast("该手记随后已有变动，未覆盖当前内容");
              return;
            }
            var restored = cloneEntry(curEntry);
            restored.observation = entryObservation(prevSnap);
            restored.body = [restored.observation, restored.doubt, restored.light].filter(Boolean).join("\n\n");
            restored.updatedAt = prevSnap.updatedAt;
            var nextEntries = state.journal.entries.map(function (e) { return e.id === restored.id ? restored : e; });
            if (!commitJournal(nextEntries, state.journal.bookmarks)) return;
            if (koanNote.koanId === cur.id) syncKoanNote(cur);
            markJournalStale();
          }
        });
        return true;
      }

      var idx = state.journal.entries.indexOf(entry);
      var removed = cloneEntry(entry);
      var nextAfterRemove = state.journal.entries.slice();
      nextAfterRemove.splice(idx, 1);
      if (!commitJournal(nextAfterRemove, state.journal.bookmarks)) {
        setStatus(statusEl, "未能保存，请稍后重试", false, true);
        return false;
      }
      koanNote.dirty = false;
      if (state.selectedEntryId === removed.id) state.selectedEntryId = null;
      syncKoanNoteMeta(cur, false);
      setStatus(statusEl, "今日心得已撤除", false, true);
      markJournalStale();
      toast("已清除今日心得", {
        label: "撤销",
        run: function () {
          if (findEntry(removed.id) || koanEntryToday(cur.id)) {
            toast("今日已有新心得，未覆盖当前内容");
            return;
          }
          var nextRestore = state.journal.entries.slice();
          nextRestore.splice(Math.min(idx, nextRestore.length), 0, cloneEntry(removed));
          if (!commitJournal(nextRestore, state.journal.bookmarks)) return;
          if (koanNote.koanId === cur.id) syncKoanNote(cur);
          markJournalStale();
        }
      });
      return true;
    }

    var nextList;
    if (entry) {
      var updated = cloneEntry(entry);
      updated.observation = text;
      updated.body = [text, updated.doubt, updated.light].filter(Boolean).join("\n\n");
      updated.updatedAt = now;
      nextList = state.journal.entries.map(function (e) { return e.id === updated.id ? updated : e; });
    } else {
      var created = {
        id: makeId("k"),
        type: "koan",
        title: "公案参究 · " + cur.title,
        scene: cur.text,
        observation: text,
        doubt: "",
        light: "",
        body: text,
        koanId: cur.id,
        tags: ["公案", cur.title],
        createdAt: now,
        updatedAt: now
      };
      nextList = [created].concat(state.journal.entries);
    }
    if (!commitJournal(nextList, state.journal.bookmarks)) {
      setStatus(statusEl, "未能保存，请稍后重试", false, true);
      return false;
    }
    koanNote.dirty = false;
    syncKoanNoteMeta(cur, true);
    markJournalStale();
    return true;
  }

  /* ------------------------------------------------------------------------
     06 · 觉照手记 (Journal) — 自动保存；两步轻删 + 撤销；支持收藏回看与原典直达
     ------------------------------------------------------------------------ */
  var journalEdit = { timer: 0, dirty: false };
  var deleteArmTimer = 0;

  function disarmDelete() {
    window.clearTimeout(deleteArmTimer);
    var btn = $("#journal-delete");
    if (!btn) return;
    btn.classList.remove("is-armed");
    btn.textContent = "删除";
  }

  function journalExcerpt(e) {
    return entryObservation(e) || e.scene || e.light || e.doubt || "（尚无正文）";
  }

  function journalCardHTML(e) {
    var active = e.id === state.selectedEntryId;
    return (
      '<button type="button" class="journal-card' + (active ? " is-active" : "") + '" data-entry-id="' + esc(e.id) + '"' + (active ? ' aria-current="true"' : "") + ">" +
        '<h4 class="journal-card-title">' + esc(displayTitle(e)) + "</h4>" +
        '<div class="journal-card-meta"><span>' + esc(TYPE_LABELS[e.type] || "手记") + '</span><span class="journal-card-date">' +
          esc(new Date(e.updatedAt || e.createdAt || Date.now()).toLocaleDateString("zh-CN")) + "</span></div>" +
        '<p class="journal-card-excerpt">' + esc(journalExcerpt(e)) + "</p>" +
      "</button>"
    );
  }

  function bookmarkRowHTML(key) {
    var parts = key.split(":");
    var book = books.find(function (b) { return b.id === parts[0]; });
    var sec = book && (book.sections || []).find(function (s) { return s.id === parts[1]; });
    if (!book || !sec) return "";
    return (
      '<div class="journal-card is-bookmark">' +
        '<button type="button" class="journal-bookmark-main" data-bookmark-jump="' + esc(key) + '">' +
          '<h4 class="journal-card-title">《' + esc(book.title) + "》· " + esc(sec.heading) + "</h4>" +
          '<p class="journal-card-excerpt">' + esc(sec.original) + "</p>" +
        "</button>" +
        '<div class="journal-bookmark-actions">' +
          '<button type="button" class="text-btn journal-unbookmark" data-unbookmark-key="' + esc(key) + '">取消收藏</button>' +
        "</div>" +
      "</div>"
    );
  }

  function journalMatches(e) {
    if (state.journalFilter !== "all" && e.type !== state.journalFilter) return false;
    var q = ($("#journal-search").value || "").trim().toLowerCase();
    if (!q) return true;
    var hay = [displayTitle(e), e.scene, e.observation, e.doubt, e.light, e.body, (e.tags || []).join(" ")].join(" ").toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function renderJournal(opts) {
    opts = opts || {};
    var listEl = $("#journal-list");
    if (!listEl) return;
    var entries = state.journal.entries;
    var bookmarks = state.journal.bookmarks;
    var q = ($("#journal-search").value || "").trim().toLowerCase();

    var counts = { all: entries.length, free: 0, koan: 0, verse: 0, bookmarks: bookmarks.length };
    entries.forEach(function (e) { if (counts[e.type] !== undefined) counts[e.type] += 1; });
    $$("#journal-filters .chip").forEach(function (chip) {
      var n = counts[chip.dataset.filter] || 0;
      chip.querySelector(".chip-count").textContent = n ? " " + n : "";
    });

    var hasAny = entries.length > 0 || bookmarks.length > 0;
    $("#journal-controls").hidden = !hasAny;
    $("#journal-export-all").hidden = !entries.length;
    if (hasAny) syncSeg($("#journal-filters"), true);

    if (state.journalFilter === "bookmarks") {
      var bmList = bookmarks.slice().reverse().filter(function (key) {
        if (!q) return true;
        var parts = key.split(":");
        var book = books.find(function (b) { return b.id === parts[0]; });
        var sec = book && (book.sections || []).find(function (s) { return s.id === parts[1]; });
        if (!book || !sec) return false;
        return ("《" + book.title + "》 " + sec.heading + " " + sec.original).toLowerCase().indexOf(q) >= 0;
      });
      if (!bookmarks.length) {
        listEl.innerHTML = '<p class="journal-empty">还没有收藏经句。<br/>读经时点按旁注右上角的 ☆，即可收入此处。</p>';
      } else if (!bmList.length) {
        listEl.innerHTML = '<p class="journal-empty">没有符合条件的收藏。<br/><button type="button" class="text-btn journal-clear-btn" data-clear-journal-filter>清除筛选</button></p>';
      } else {
        listEl.innerHTML = bmList.map(bookmarkRowHTML).join("");
      }
    } else {
      var filtered = entries.filter(journalMatches);
      if (!entries.length) {
        listEl.innerHTML = '<p class="journal-empty">还没有手记。<br/>在右侧任一栏落笔即自动保存；经文批注与公案心得也会汇集到这里。</p>';
      } else if (!filtered.length) {
        listEl.innerHTML = '<p class="journal-empty">没有符合条件的手记。<br/><button type="button" class="text-btn journal-clear-btn" data-clear-journal-filter>清除筛选</button></p>';
      } else {
        listEl.innerHTML = filtered.map(journalCardHTML).join("");
      }
    }

    state.journalStale = false;
    if (opts.syncEditor !== false) syncJournalEditor(findEntry(state.selectedEntryId), false);
  }

  function journalCard(id) {
    return $$("#journal-list .journal-card").find(function (c) { return c.dataset.entryId === id; }) || null;
  }

  function updateJournalCard(entry) {
    var card = journalCard(entry.id);
    if (!card) return;
    card.querySelector(".journal-card-title").textContent = displayTitle(entry);
    card.querySelector(".journal-card-excerpt").textContent = journalExcerpt(entry);
    card.querySelector(".journal-card-date").textContent = new Date(entry.updatedAt || Date.now()).toLocaleDateString("zh-CN");
  }

  function markActiveCard() {
    $$("#journal-list .journal-card").forEach(function (c) {
      if (!c.dataset.entryId) return;
      var on = c.dataset.entryId === state.selectedEntryId;
      c.classList.toggle("is-active", on);
      if (on) c.setAttribute("aria-current", "true");
      else c.removeAttribute("aria-current");
    });
  }

  function readEditorFields() {
    return {
      title: $("#journal-title").value.trim(),
      scene: $("#journal-scene").value.trim(),
      observation: $("#journal-observation").value.trim(),
      doubt: $("#journal-doubt").value.trim(),
      light: $("#journal-light").value.trim(),
      tags: $("#journal-tags").value.split(/[，,、]/).map(function (t) { return t.trim(); }).filter(Boolean)
    };
  }

  function syncJournalSourceBar(entry) {
    var bar = $("#journal-source-bar");
    var lbl = $("#journal-source-label");
    var btn = $("#journal-source-jump");
    if (!entry) {
      bar.hidden = true;
      return;
    }
    if (entry.type === "verse" && entry.bookId) {
      var book = books.find(function (b) { return b.id === entry.bookId; });
      if (book) {
        lbl.textContent = "来自经文 · 《" + book.title + "》";
        btn.textContent = "回看此段 →";
        btn.dataset.jumpType = "verse";
        btn.dataset.bookId = entry.bookId;
        btn.dataset.sectionId = entry.sectionId || "";
        bar.hidden = false;
        return;
      }
    }
    if (entry.type === "koan" && entry.koanId) {
      var kIdx = koans.findIndex(function (k) { return k.id === entry.koanId; });
      if (kIdx >= 0) {
        lbl.textContent = "来自公案 · " + koans[kIdx].title;
        btn.textContent = "回看此则公案 →";
        btn.dataset.jumpType = "koan";
        btn.dataset.koanIdx = String(kIdx);
        bar.hidden = false;
        return;
      }
    }
    bar.hidden = true;
  }

  function syncJournalEditor(entry, animate) {
    journalEdit.dirty = false;
    window.clearTimeout(journalEdit.timer);
    disarmDelete();
    var apply = function () {
      $("#journal-title").value = entry ? entry.title || "" : "";
      $("#journal-title").placeholder = entry && !entry.title ? displayTitle(entry) : "标题 · 如：今日起嗔时的一念回光";
      $("#journal-scene").value = entry ? entry.scene || "" : "";
      $("#journal-observation").value = entry ? entryObservation(entry) : "";
      $("#journal-doubt").value = entry ? entry.doubt || "" : "";
      $("#journal-light").value = entry ? entry.light || "" : "";
      $("#journal-tags").value = entry ? (entry.tags || []).join(", ") : "";
      syncJournalSourceBar(entry);
    };
    if (animate && canAnimate($("#journal-editor"))) {
      apply();
      $("#journal-editor").animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: DUR.base, easing: EASE_OUT });
    } else {
      apply();
    }
    $("#journal-delete").hidden = !entry;
    $("#journal-export-one").hidden = !entry;
    setStatus($("#journal-status"), entry ? "已保存 · " + timeLabel(entry.updatedAt || entry.createdAt) : "从任一栏落笔，即自动保存", Boolean(entry), false);
  }

  function scheduleJournalSave() {
    journalEdit.dirty = true;
    window.clearTimeout(journalEdit.timer);
    journalEdit.timer = window.setTimeout(flushJournal, 600);
  }

  function isEmptyFreeEntry(e) {
    return e && e.type === "free" && !e.title && !e.scene && !entryObservation(e) && !String(e.body || "").trim() && !e.doubt && !e.light && !(e.tags || []).length;
  }

  function discardIfEmpty(id) {
    var e = findEntry(id);
    if (!isEmptyFreeEntry(e)) return;
    var nextEntries = state.journal.entries.filter(function (x) { return x.id !== id; });
    if (!commitJournal(nextEntries, state.journal.bookmarks)) return;
    var card = journalCard(id);
    if (card) card.remove();
  }

  function syncReaderAfterJournalChange(entry) {
    if (!entry) return;
    if (entry.type === "verse") {
      updateVerseMark(entry.bookId, entry.sectionId);
      var t = verseNote.target;
      if (t && t.book.id === entry.bookId && t.section.id === entry.sectionId && !verseNote.dirty) {
        syncVerseNoteUI(t.book, t.section);
      }
    } else if (entry.type === "koan" && koanNote.koanId === entry.koanId && !koanNote.dirty) {
      var cur = koans.find(function (k) { return k.id === entry.koanId; });
      if (cur) syncKoanNote(cur);
    }
  }

  function flushJournal() {
    window.clearTimeout(journalEdit.timer);
    if (!journalEdit.dirty) return true;
    var f = readEditorFields();
    var now = new Date().toISOString();
    var existing = findEntry(state.selectedEntryId);
    var created = false;
    var staged;
    if (!existing) {
      if (!f.title && !f.scene && !f.observation && !f.doubt && !f.light && !f.tags.length) {
        journalEdit.dirty = false;
        return true;
      }
      staged = { id: makeId("f"), type: "free", createdAt: now };
      created = true;
    } else {
      staged = cloneEntry(existing);
    }
    staged.title = f.title;
    staged.scene = f.scene;
    staged.observation = f.observation;
    staged.doubt = f.doubt;
    staged.light = f.light;
    staged.tags = f.tags;
    staged.body = [f.observation, f.doubt, f.light].filter(Boolean).join("\n\n");
    staged.updatedAt = now;

    var nextEntries = created
      ? [staged].concat(state.journal.entries)
      : state.journal.entries.map(function (e) { return e.id === staged.id ? staged : e; });
    if (!commitJournal(nextEntries, state.journal.bookmarks)) {
      setStatus($("#journal-status"), "未能保存，请稍后重试", false, true);
      return false;
    }

    journalEdit.dirty = false;
    state.selectedEntryId = staged.id;
    if (created) {
      if (state.journalFilter === "bookmarks" || !journalMatches(staged)) {
        state.journalFilter = "all";
        $("#journal-search").value = "";
        setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === "all"; });
      }
      renderJournal({ syncEditor: false });
      fadeIn(journalCard(staged.id), { dy: -6 });
      $("#journal-delete").hidden = false;
      $("#journal-export-one").hidden = false;
    } else {
      updateJournalCard(staged);
    }
    $("#journal-title").placeholder = staged.title ? "标题" : displayTitle(staged);
    setStatus($("#journal-status"), "已保存 · " + timeLabel(now), true, true);
    syncReaderAfterJournalChange(staged);
    return true;
  }

  function selectJournalEntry(id) {
    if (id === state.selectedEntryId) return;
    flushJournal();
    var prevId = state.selectedEntryId;
    state.selectedEntryId = id;
    if (prevId) discardIfEmpty(prevId);
    markActiveCard();
    syncJournalEditor(findEntry(id), true);
  }

  function createNewJournal() {
    if (state.view !== "journal") setView("journal", { blank: true, focusHeading: false });
    flushJournal();
    var prevId = state.selectedEntryId;
    state.selectedEntryId = null;
    if (prevId) discardIfEmpty(prevId);
    markActiveCard();
    syncJournalEditor(null, true);
    $("#journal-title").focus({ preventScroll: true });
  }

  function deleteJournalEntry() {
    flushJournal();
    var entry = findEntry(state.selectedEntryId);
    if (!entry) return;
    var delBtn = $("#journal-delete");
    if (!delBtn.classList.contains("is-armed")) {
      delBtn.classList.add("is-armed");
      delBtn.textContent = "确认删除？";
      window.clearTimeout(deleteArmTimer);
      deleteArmTimer = window.setTimeout(disarmDelete, 3000);
      return;
    }
    disarmDelete();

    var idx = state.journal.entries.indexOf(entry);
    var removed = cloneEntry(entry);
    var nextEntries = state.journal.entries.slice();
    nextEntries.splice(idx, 1);
    if (!commitJournal(nextEntries, state.journal.bookmarks)) return;

    state.selectedEntryId = null;
    syncJournalEditor(null, true);
    syncReaderAfterJournalChange(removed);

    var card = journalCard(removed.id);
    var finish = function () { renderJournal({ syncEditor: false }); };
    if (card && canAnimate(card)) {
      var a = card.animate([
        { opacity: 1, transform: "translateX(0px)" },
        { opacity: 0, transform: "translateX(-8px)" }
      ], { duration: DUR.fast, easing: EASE_OUT, fill: "forwards" });
      a.onfinish = finish;
    } else {
      finish();
    }

    toast("已删除「" + displayTitle(removed) + "」", {
      label: "撤销",
      run: function () {
        if (findEntry(removed.id)) return;
        flushJournal();
        var nextRestore = state.journal.entries.slice();
        nextRestore.splice(Math.min(idx, nextRestore.length), 0, cloneEntry(removed));
        if (!commitJournal(nextRestore, state.journal.bookmarks)) return;
        state.selectedEntryId = removed.id;
        if (state.view !== "journal") setView("journal", { focusHeading: false });
        if (state.journalFilter === "bookmarks") {
          state.journalFilter = "all";
          setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === "all"; });
        }
        renderJournal({ syncEditor: false });
        syncJournalEditor(findEntry(removed.id), true);
        fadeIn(journalCard(removed.id), { dy: -6 });
        syncReaderAfterJournalChange(removed);
      }
    });
  }

  function encodeBodhiMarkerText(text) {
    return String(text || "").replace(/<!-- (~*)bodhi:/g, "<!-- $1~bodhi:");
  }

  function decodeBodhiMarkerText(text) {
    return String(text || "").replace(/<!-- ~(~*)bodhi:/g, "<!-- $1bodhi:");
  }

  function entryToMarkdown(entry) {
    var typeMap = { free: "自由手记", koan: "公案参究", verse: "经文批注" };
    var metaObj = {
      v: 2,
      id: entry.id || "",
      type: entry.type || "free",
      title: entry.title || "",
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      bookId: entry.bookId || "",
      sectionId: entry.sectionId || "",
      koanId: entry.koanId || "",
      createdAt: entry.createdAt || "",
      updatedAt: entry.updatedAt || ""
    };
    var metaJson = JSON.stringify(metaObj).replace(/--/g, "\\u002d\\u002d");
    var obs = entryObservation(entry);
    var lines = [
      "<!-- bodhi:entry:v2 " + metaJson + " -->",
      "# " + displayTitle(entry).replace(/[\r\n]+/g, " "),
      ""
    ];
    lines.push("- **类别**：" + (typeMap[entry.type] || "手记"));
    if ((entry.tags || []).length) lines.push("- **标签**：" + entry.tags.join("、"));
    lines.push("- **时间**：" + new Date(entry.updatedAt || entry.createdAt || Date.now()).toLocaleString("zh-CN"));
    lines.push("", "---", "");
    [
      ["scene", "境缘", entry.scene || ""],
      ["observation", "一、如实观照", obs],
      ["doubt", "二、破执疑情", entry.doubt || ""],
      ["light", "三、一线微明", entry.light || ""]
    ].forEach(function (pair) {
      if (!pair[2]) return;
      lines.push("## " + pair[1], "");
      lines.push("<!-- bodhi:field:" + pair[0] + ":start -->");
      lines.push(encodeBodhiMarkerText(pair[2]));
      lines.push("<!-- bodhi:field:" + pair[0] + ":end -->", "");
    });
    lines.push("<!-- bodhi:entry:end -->");
    return lines.join("\n");
  }

  function safeFilename(name) {
    return (name || "bodhi-journal").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "bodhi-journal";
  }

  function saveMarkdownFile(filename, content) {
    if (window.showSaveFilePicker) {
      window.showSaveFilePicker({
        suggestedName: safeFilename(filename) + ".md",
        types: [{ description: "Markdown 文档", accept: { "text/markdown": [".md"] } }]
      }).then(function (handle) {
        return handle.createWritable().then(function (writable) {
          return writable.write(content).then(function () { return writable.close(); });
        });
      }).then(function () {
        toast("已导出「" + safeFilename(filename) + ".md」");
      }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        downloadMarkdownFallback(filename, content);
      });
      return;
    }
    downloadMarkdownFallback(filename, content);
  }

  function downloadMarkdownFallback(filename, content) {
    var blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = safeFilename(filename) + ".md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("已导出「" + safeFilename(filename) + ".md」，见浏览器下载");
  }

  function parseV2MarkdownEntries(text) {
    var lines = text.split("\n");
    var entries = [];
    var cur = null;
    var fieldKey = null;
    var fieldLines = [];
    var now = new Date().toISOString();

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (fieldKey) {
        if (line === "<!-- bodhi:field:" + fieldKey + ":end -->") {
          cur.fields[fieldKey] = decodeBodhiMarkerText(fieldLines.join("\n"));
          fieldKey = null;
          fieldLines = [];
        } else {
          fieldLines.push(line);
        }
        continue;
      }
      if (!cur) {
        var openMatch = line.match(/^<!-- bodhi:entry:v2 (\{.*\}) -->$/);
        if (openMatch) {
          try {
            cur = { meta: JSON.parse(openMatch[1]), fields: {} };
          } catch (_) {
            cur = null;
          }
        }
        continue;
      }
      var startMatch = line.match(/^<!-- bodhi:field:(scene|observation|doubt|light):start -->$/);
      if (startMatch) {
        fieldKey = startMatch[1];
        fieldLines = [];
        continue;
      }
      if (line === "<!-- bodhi:entry:end -->") {
        var m = cur.meta || {};
        var f = cur.fields || {};
        var type = ["free", "koan", "verse"].indexOf(m.type) >= 0 ? m.type : "free";
        var obs = typeof f.observation === "string" ? f.observation : "";
        var doubt = typeof f.doubt === "string" ? f.doubt : "";
        var light = typeof f.light === "string" ? f.light : "";
        var item = {
          id: makeId("imp"),
          type: type,
          title: typeof m.title === "string" ? m.title : "",
          scene: typeof f.scene === "string" ? f.scene : "",
          observation: obs,
          doubt: doubt,
          light: light,
          body: [obs, doubt, light].filter(Boolean).join("\n\n"),
          tags: Array.isArray(m.tags) ? m.tags.slice() : [],
          createdAt: m.createdAt || now,
          updatedAt: m.updatedAt || now
        };
        if (m.bookId) item.bookId = String(m.bookId);
        if (m.sectionId) item.sectionId = String(m.sectionId);
        if (m.koanId) item.koanId = String(m.koanId);
        entries.push(item);
        cur = null;
      }
    }
    return entries;
  }

  function splitLegacyMarkdownOutsideFences(text) {
    var looksExported = /^- \*\*类别\*\*：/m.test(text);
    if (!looksExported) return [text.trim()];
    var lines = text.split("\n");
    var chunks = [];
    var current = [];
    var fence = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var fenceMatch = line.match(/^(```+|~~~+)/);
      if (fenceMatch) {
        var tok = fenceMatch[1];
        if (!fence) fence = tok[0];
        else if (fence === tok[0]) fence = "";
      } else if (!fence && /^# /.test(line) && current.length) {
        chunks.push(current.join("\n").trim());
        current = [];
      }
      current.push(line);
    }
    if (current.length) chunks.push(current.join("\n").trim());
    return chunks.filter(Boolean);
  }

  function parseMarkdownEntries(content, fallbackTitle) {
    var text = String(content || "").replace(/\r\n?/g, "\n");
    if (/^<!-- bodhi:entry:v2 \{/m.test(text)) {
      var v2Entries = parseV2MarkdownEntries(text);
      if (v2Entries.length) return v2Entries;
    }

    var now = new Date().toISOString();
    var looksExported = /^- \*\*类别\*\*：/m.test(text);
    var chunks = splitLegacyMarkdownOutsideFences(text);
    return chunks.filter(Boolean).map(function (chunk) {
      var lines = chunk.split("\n");
      var title = fallbackTitle;
      var bodyStart = 0;
      if (/^#\s+/.test(lines[0] || "")) {
        title = lines[0].replace(/^#\s+/, "").trim() || fallbackTitle;
        bodyStart = 1;
      }
      var meta = {};
      var keptLines = [];
      var fence = "";
      for (var i = bodyStart; i < lines.length; i++) {
        var line = lines[i];
        var fenceMatch = line.match(/^(```+|~~~+)/);
        if (fenceMatch) {
          var ch = fenceMatch[1][0];
          fence = fence === ch ? "" : (fence || ch);
          keptLines.push(line);
          continue;
        }
        if (!fence && looksExported) {
          var metaMatch = line.match(/^- \*\*(类别|境缘|标签|时间)\*\*：(.*)$/);
          if (metaMatch) {
            meta[metaMatch[1]] = metaMatch[2].trim();
            continue;
          }
        }
        keptLines.push(line);
      }

      var sec = {};
      var leadLines = [];
      var activeSec = null;
      var secLines = [];
      fence = "";
      var flushSec = function () {
        if (!activeSec) return;
        var val = secLines.join("\n").replace(/\n-{3,}\s*$/g, "").trim();
        if (looksExported && /如实观照/.test(activeSec)) sec.observation = val;
        else if (looksExported && /破执疑情/.test(activeSec)) sec.doubt = val;
        else if (looksExported && /一线微明/.test(activeSec)) sec.light = val;
        else sec.extra = (sec.extra ? sec.extra + "\n\n" : "") + "## " + activeSec + (val ? "\n" + val : "");
        secLines = [];
      };
      keptLines.forEach(function (line) {
        var fenceMatch = line.match(/^(```+|~~~+)/);
        if (fenceMatch) {
          var ch = fenceMatch[1][0];
          fence = fence === ch ? "" : (fence || ch);
        }
        if (!fence && /^##\s+/.test(line)) {
          flushSec();
          activeSec = line.replace(/^##\s+/, "").trim();
          return;
        }
        if (activeSec !== null) secLines.push(line);
        else leadLines.push(line);
      });
      flushSec();

      var lead = leadLines.join("\n").replace(/^\s*-{3,}\s*$/gm, "").trim();
      var observation = sec.observation || [lead, sec.extra].filter(Boolean).join("\n\n");
      if (sec.observation && (lead || sec.extra)) observation = [sec.observation, lead, sec.extra].filter(Boolean).join("\n\n");
      var tags = meta["标签"] ? meta["标签"].split(/[、,，]/).map(function (t) { return t.trim(); }).filter(Boolean) : [];
      if (tags.indexOf("导入") < 0) tags.push("导入");
      return {
        id: makeId("imp"),
        type: "free",
        title: title,
        scene: meta["境缘"] || "",
        observation: observation,
        doubt: sec.doubt || "",
        light: sec.light || "",
        body: [observation, sec.doubt, sec.light].filter(Boolean).join("\n\n"),
        tags: tags,
        createdAt: now,
        updatedAt: now
      };
    });
  }

  function importMarkdownFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    Promise.all(files.map(function (file) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () { resolve(parseMarkdownEntries(reader.result, file.name.replace(/\.(md|markdown|txt)$/i, ""))); };
        reader.onerror = function () { resolve([]); };
        reader.readAsText(file, "utf-8");
      });
    })).then(function (groups) {
      var created = [].concat.apply([], groups);
      if (!created.length) {
        toast("没有读到可导入的内容。");
        return;
      }
      flushJournal();
      var nextEntries = created.concat(state.journal.entries);
      if (!commitJournal(nextEntries, state.journal.bookmarks)) return;
      state.selectedEntryId = created[0].id;
      state.journalFilter = "all";
      $("#journal-search").value = "";
      setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === "all"; });
      renderJournal();
      created.forEach(function (e, i) { fadeIn(journalCard(e.id), { dy: -6, delay: Math.min(i, 6) * 30 }); });
      var snapShots = created.map(function (e) { return { id: e.id, updatedAt: e.updatedAt }; });
      toast("已导入 " + created.length + " 篇手记", {
        label: "撤销",
        run: function () {
          var removeMap = {};
          snapShots.forEach(function (s) { removeMap[s.id] = s.updatedAt; });
          var keptModified = false;
          var remaining = state.journal.entries.filter(function (e) {
            if (!removeMap[e.id]) return true;
            if (e.updatedAt !== removeMap[e.id]) {
              keptModified = true;
              return true;
            }
            return false;
          });
          if (!commitJournal(remaining, state.journal.bookmarks)) return;
          if (state.selectedEntryId && !findEntry(state.selectedEntryId)) state.selectedEntryId = null;
          renderJournal();
          if (keptModified) toast("已撤销导入（其中已被修改的条目已保留）");
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     07 · 观息静室 (Stillness)
     ------------------------------------------------------------------------ */
  var BREATH = {
    natural: [{ cls: "is-inhale", label: "吸", ms: 4000 }, { cls: "is-hold", label: "止", ms: 2000 }, { cls: "is-exhale", label: "呼", ms: 6000 }],
    deep: [{ cls: "is-inhale", label: "吸", ms: 5000 }, { cls: "is-hold", label: "止", ms: 3000 }, { cls: "is-exhale", label: "呼", ms: 7000 }]
  };

  function monoNow() {
    return window.performance && typeof performance.now === "function" ? performance.now() : Date.now();
  }

  function sitTotalMs() {
    return state.sit.minutes * 60000;
  }

  function saveSitPrefs() {
    writeJSON(KEY.sitPrefs, { mode: state.sit.mode, minutes: state.sit.minutes, chime: state.sit.chime });
  }

  function playBowlChime() {
    if (!state.sit.chime) return;
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      var ctx = new AudioCtx();
      var now = ctx.currentTime;
      [256, 512, 768.4].forEach(function (freq, idx) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        var peak = idx === 0 ? 0.08 : idx === 1 ? 0.03 : 0.012;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 4.4);
      });
      window.setTimeout(function () { if (ctx.close) ctx.close(); }, 5000);
    } catch (_) {
      /* ignore audio block */
    }
  }

  function formatSec(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return pad2(m) + ":" + pad2(s);
  }

  function sitCountText() {
    var count = Number(localGet(KEY.sitCount, "0"));
    return count > 0 ? "已圆满静坐 " + count + " 次" : "第一次静坐 · 随缘安住";
  }

  function updateStillnessUI() {
    var sit = state.sit;
    var total = sitTotalMs();
    var remaining = Math.min(total, Math.max(0, sit.remainingMs));
    $("#breath-timer").textContent = formatSec(Math.ceil(remaining / 1000));
    var paused = !sit.active && (sit.paused || (remaining > 0 && remaining < total));
    $("#stillness-toggle").textContent = sit.active ? "暂停" : remaining <= 0 ? "再坐一程" : paused ? "继续静坐" : "开始静坐";
    $("#stillness-reset").hidden = sit.active || (!sit.paused && remaining >= total);
    $("#breath-altar").classList.toggle("is-sitting", sit.active);
    $("#breath-ring-progress").style.strokeDashoffset = String(Math.round(1000 * (remaining / total) * 10) / 10);
    if (!$("#sit-count").textContent) $("#sit-count").textContent = sitCountText();
    syncNavSitTimer();
  }

  function setBreathPhase(label) {
    swapText($("#breath-phase"), label, 1, { outDur: 200, inDur: 420, dy: 4 });
  }

  function runBreathCycle() {
    var wrap = $("#breath-enso-wrap");
    if (!state.sit.active) return;
    var pattern = BREATH[state.sit.mode];
    if (!pattern) {
      wrap.className = "breath-enso-wrap is-mozhao";
      setBreathPhase("默照");
      return;
    }
    var step = pattern[state.sit.breathStep % pattern.length];
    wrap.style.setProperty("--breath-ms", step.ms + "ms");
    wrap.className = "breath-enso-wrap " + step.cls;
    setBreathPhase(step.label);
    state.sit.breathStep += 1;
    state.sit.breathTimer = window.setTimeout(runBreathCycle, step.ms);
  }

  function clearSitTimers() {
    window.clearInterval(state.sit.tickTimer);
    window.clearTimeout(state.sit.breathTimer);
    var wrap = $("#breath-enso-wrap");
    wrap.style.setProperty("--breath-ms", "1200ms");
    wrap.className = "breath-enso-wrap";
  }

  function startSit() {
    var sit = state.sit;
    var total = sitTotalMs();
    if (sit.remainingMs <= 0) sit.remainingMs = total;
    if (!sit.paused && sit.remainingMs >= total) playBowlChime();
    sit.active = true;
    sit.paused = false;
    sit.endAt = monoNow() + sit.remainingMs;
    sit.breathStep = 0;
    runBreathCycle();
    updateStillnessUI();
    var lastSec = -1;
    sit.tickTimer = window.setInterval(function () {
      sit.remainingMs = Math.min(sit.remainingMs, Math.max(0, sit.endAt - monoNow()));
      var sec = Math.ceil(sit.remainingMs / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        updateStillnessUI();
      }
      if (sit.remainingMs <= 0) completeSit();
    }, 250);
  }

  function pauseSit() {
    var sit = state.sit;
    if (!sit.active) return;
    sit.remainingMs = Math.min(sit.remainingMs, Math.max(0, sit.endAt - monoNow()));
    sit.active = false;
    sit.paused = true;
    clearSitTimers();
    setBreathPhase("暂歇");
    updateStillnessUI();
  }

  function completeSit() {
    var sit = state.sit;
    sit.active = false;
    sit.paused = false;
    sit.remainingMs = 0;
    clearSitTimers();
    localSet(KEY.sitCount, String(Number(localGet(KEY.sitCount, "0")) + 1));
    playBowlChime();
    setBreathPhase("圆满");
    swapText($("#sit-count"), sitCountText(), 1);
    updateStillnessUI();
    var ripple = $("#breath-ring-ripple");
    if (canAnimate(ripple)) {
      ripple.animate([
        { opacity: 0.48, transform: "scale(1)" },
        { opacity: 0, transform: "scale(1.18)" }
      ], { duration: 2200, easing: EASE_OUT });
    }
  }

  function resetSit() {
    state.sit.active = false;
    state.sit.paused = false;
    clearSitTimers();
    state.sit.remainingMs = sitTotalMs();
    setBreathPhase("静候");
    updateStillnessUI();
  }

  function cycleHuatou() {
    if (!huatouList.length) return;
    state.huatouIndex = (state.huatouIndex + 1) % huatouList.length;
    var el = $("#huatou-text");
    swap(el, function () { el.textContent = huatouList[state.huatouIndex]; }, { dy: 6, inDur: DUR.slow });
  }

  function setZen(on) {
    var body = document.body;
    on = Boolean(on);
    if (on === state.zenWanted && on === body.classList.contains("is-zen-fullscreen")) return;
    state.zenWanted = on;
    var root = document.documentElement;
    try {
      if (on && root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(function () {});
      if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    } catch (_) {
      /* fullscreen not permitted — CSS immersion still applies */
    }
    var toggle = function () {
      body.classList.toggle("is-zen-fullscreen", state.zenWanted);
      window.scrollTo(0, 0);
    };
    if (document.startViewTransition && !reducedMotion()) {
      root.classList.add("is-zen-transitioning");
      var vt = document.startViewTransition(toggle);
      var cleanup = function () { root.classList.remove("is-zen-transitioning"); };
      vt.finished.then(cleanup, cleanup);
    } else {
      toggle();
      swap($(".app-shell"), function () {}, { dy: 0, inDur: DUR.slow });
    }
  }

  /* ------------------------------------------------------------------------
     Global Command Palette (Ctrl+K)
     ------------------------------------------------------------------------ */
  var cmd = { lastFocus: null };

  function snippet(text, query, len) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    len = len || 80;
    if (!query) return text.slice(0, len);
    var i = text.toLowerCase().indexOf(query);
    if (i < 0) return text.slice(0, len);
    var start = Math.max(0, i - 18);
    return (start > 0 ? "…" : "") + text.slice(start, start + len);
  }

  function highlight(text, query) {
    if (!query) return esc(text);
    var lower = text.toLowerCase();
    var out = "";
    var pos = 0;
    var i = lower.indexOf(query, pos);
    while (i >= 0) {
      out += esc(text.slice(pos, i)) + "<mark>" + esc(text.slice(i, i + query.length)) + "</mark>";
      pos = i + query.length;
      i = lower.indexOf(query, pos);
    }
    return out + esc(text.slice(pos));
  }

  function buildSearchResults(q) {
    var query = q.trim().toLowerCase();
    var out = [];

    if (!query) {
      state.journal.bookmarks.forEach(function (key) {
        var parts = key.split(":");
        var b = books.find(function (x) { return x.id === parts[0]; });
        var sec = b && (b.sections || []).find(function (s) { return s.id === parts[1]; });
        if (!sec) return;
        out.push({
          title: "《" + b.title + "》· " + sec.heading,
          sub: sec.original,
          badge: "收藏",
          action: function () { jumpToVerse(b.id, sec.id); }
        });
      });
      books.forEach(function (b) {
        out.push({
          title: b.fullTitle || b.title,
          sub: b.author + " · " + b.summary,
          badge: "典籍",
          action: function () { jumpToVerse(b.id); }
        });
      });
      return out.slice(0, 20);
    }

    function push(title, subText, badge, action) {
      var hay = (title + " " + subText).toLowerCase();
      if (hay.indexOf(query) < 0) return;
      out.push({ title: title, sub: snippet(subText, query), badge: badge, action: action, rank: title.toLowerCase().indexOf(query) >= 0 ? 0 : 1 });
    }

    books.forEach(function (b) {
      (b.sections || []).forEach(function (sec) {
        push(
          "《" + b.title + "》· " + sec.heading,
          [sec.original, sec.translation, sec.commentary, sec.delusion, sec.awakened, sec.contemplation].join(" "),
          "经文",
          function () { jumpToVerse(b.id, sec.id); }
        );
      });
    });

    mapNodes.forEach(function (n) {
      push(
        n.title + " · " + n.subtitle,
        [n.core, n.dissolves, n.quote, n.zenBridge].join(" "),
        "全景",
        function () {
          setView("atlas");
          showAtlasTab("map");
          if (state.atlasNodeId !== n.id) {
            state.atlasNodeId = n.id;
            updateAtlasMap(true);
            saveUi();
          }
        }
      );
    });

    consciousnesses.forEach(function (c, i) {
      push(
        c.name + " → " + c.wisdom,
        [c.level, c.sanskrit, c.role, c.delusion, c.wisdomDesc].join(" "),
        "转智",
        function () {
          setView("atlas");
          showAtlasTab("consciousness");
          window.requestAnimationFrame(function () {
            var card = $('#consciousness-list [data-wisdom-idx="' + i + '"]');
            if (!card) return;
            card.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
            card.classList.remove("is-flash");
            void card.offsetWidth;
            card.classList.add("is-flash");
            window.setTimeout(function () { card.classList.remove("is-flash"); }, 1200);
          });
        }
      );
    });

    triads.forEach(function (t, i) {
      push(
        "金刚三句 · " + t.concept,
        [t.statementA, t.negationB, t.synthesisC, t.meaning].join(" "),
        "三句",
        function () {
          setView("atlas");
          showAtlasTab("diamond");
          if (state.triadIndex !== i) {
            state.triadIndex = i;
            renderDiamondTriad(true);
            saveUi();
          }
        }
      );
    });

    koans.forEach(function (k, i) {
      push(k.title, [k.text, k.doubt, k.insight].join(" "), "公案", function () {
        setView("koans");
        showKoan(i);
      });
    });

    lineageNodes.forEach(function (n) {
      push(n.name + " · " + n.role, [n.style, n.method, n.quote].join(" "), "法脉", function () {
        setView("lineage");
        if (state.lineageId !== n.id) {
          state.lineageId = n.id;
          updateLineage(true);
          saveUi();
        }
      });
    });

    oxStages.forEach(function (st, i) {
      push("十牛图 · 第" + st.cn + " " + st.title, [st.phase, st.poem, st.state].join(" "), "十牛", function () {
        setView("ox");
        showOx(i);
      });
    });

    state.journal.entries.forEach(function (e) {
      push(displayTitle(e), [e.scene, e.observation, e.doubt, e.light, e.body, (e.tags || []).join(" ")].join(" "), "手记", function () {
        state.selectedEntryId = e.id;
        setView("journal");
        if (state.journalFilter === "bookmarks" || !journalCard(e.id)) {
          state.journalFilter = "all";
          $("#journal-search").value = "";
          setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === "all"; });
          renderJournal();
        } else {
          markActiveCard();
          syncJournalEditor(e, true);
        }
        var card = journalCard(e.id);
        if (card) card.scrollIntoView({ block: "nearest" });
      });
    });

    out.sort(function (a, b) { return a.rank - b.rank; });
    return out.slice(0, 30);
  }

  function setCommandActive(idx, scroll) {
    state.commandIndex = idx;
    $$(".cmd-item").forEach(function (el, i) {
      var on = i === idx;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", String(on));
      if (on && scroll) el.scrollIntoView({ block: "nearest" });
    });
    var input = $("#cmd-input");
    if (state.commandResults.length) input.setAttribute("aria-activedescendant", "cmd-opt-" + idx);
    else input.removeAttribute("aria-activedescendant");
  }

  function renderCommandResults() {
    var raw = $("#cmd-input").value || "";
    var query = raw.trim().toLowerCase();
    var list = buildSearchResults(raw);
    state.commandResults = list;
    var root = $("#cmd-results");

    if (!list.length) {
      root.innerHTML = '<div class="cmd-empty">没有找到「' + esc(raw.trim()) + "」。<br/>换个字试试，如「无」「空」「平常心」「惠能」。</div>";
      setCommandActive(0, false);
      return;
    }

    var header = query ? "" : '<div class="cmd-group-label">' + (state.journal.bookmarks.length ? "收藏与典籍" : "典籍") + "</div>";
    root.innerHTML = header + list.map(function (item, idx) {
      return (
        '<button type="button" role="option" id="cmd-opt-' + idx + '" class="cmd-item" data-cmd-idx="' + idx + '" tabindex="-1">' +
          '<span class="cmd-item-main">' +
            '<span class="cmd-item-title">' + highlight(item.title, query) + "</span>" +
            '<span class="cmd-item-sub">' + highlight(snippet(item.sub, query, 96), query) + "</span>" +
          "</span>" +
          '<span class="cmd-badge">' + esc(item.badge) + "</span>" +
        "</button>"
      );
    }).join("");
    root.scrollTop = 0;
    setCommandActive(0, false);
  }

  function isCommandOpen() {
    return $("#cmd-modal").classList.contains("is-open");
  }

  function isFocusTargetUsable(el) {
    if (!el || el === document.body || !document.contains(el) || typeof el.focus !== "function") return false;
    if (el.closest("[inert]")) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    return el.getClientRects().length > 0;
  }

  function openCommandModal() {
    if (isCommandOpen()) {
      $("#cmd-input").focus({ preventScroll: true });
      $("#cmd-input").select();
      return;
    }
    setTypoOpen(false);
    cmd.lastFocus = document.activeElement;
    var shell = $(".app-shell");
    if (shell) shell.inert = true;
    if ($("#zen-exit")) $("#zen-exit").inert = true;
    var modal = $("#cmd-modal");
    modal.inert = false;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    $("#cmd-input").value = "";
    renderCommandResults();
    $("#cmd-input").focus({ preventScroll: true });
  }

  function closeCommandModal(restoreFocus) {
    if (!isCommandOpen()) return;
    var modal = $("#cmd-modal");
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    modal.inert = true;
    var shell = $(".app-shell");
    if (shell) shell.inert = false;
    if ($("#zen-exit")) $("#zen-exit").inert = false;
    syncSidebarInert();
    if (restoreFocus !== false) {
      var fallbackBtn = isFocusTargetUsable($("#topbar-cmd-btn")) ? $("#topbar-cmd-btn") : $("#view-" + state.view + " .section-title");
      var target = isFocusTargetUsable(cmd.lastFocus) ? cmd.lastFocus : fallbackBtn;
      if (target && target.focus) target.focus({ preventScroll: true });
    }
  }

  function activateCommand(idx) {
    var item = state.commandResults[idx];
    if (!item) return;
    closeCommandModal(false);
    if (item.action) item.action();
    if (!document.activeElement || document.activeElement === document.body) {
      var titleEl = $("#view-" + state.view + " .section-title");
      if (titleEl && titleEl.focus) titleEl.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------------------
     Small UI state memory (系统记住，用户不必重复操作)
     ------------------------------------------------------------------------ */
  function saveUi() {
    writeJSON(KEY.ui, {
      atlasTab: state.atlasTab,
      atlasNodeId: state.atlasNodeId,
      triadIndex: state.triadIndex,
      oxIndex: state.oxIndex,
      lineageId: state.lineageId,
      koanIndex: state.koanIndex,
      journalFilter: state.journalFilter
    });
  }

  function restoreState() {
    var savedTheme = localGet(KEY.theme, "");
    state.themeChosen = Boolean(savedTheme);
    state.theme = savedTheme || systemTheme();

    var pos = readJSON(KEY.bookPos, {});
    state.bookPos = pos && typeof pos === "object" ? pos : {};
    var last = readJSON(KEY.lastRead, null);
    if (last && last.bookId) {
      var idx = books.findIndex(function (b) { return b.id === last.bookId; });
      if (idx >= 0) {
        state.bookIndex = idx;
        state.verseId = last.sectionId || "";
        if (last.sectionId && !state.bookPos[last.bookId]) state.bookPos[last.bookId] = last.sectionId;
      }
    }
    var mode = readJSON(KEY.readerMode, {});
    state.pure = Boolean(mode && mode.pure);
    state.vertical = Boolean(mode && mode.vertical);

    var ui = readJSON(KEY.ui, {}) || {};
    if (ui.atlasTab) state.atlasTab = ui.atlasTab;
    if (ui.atlasNodeId && mapNodes.some(function (n) { return n.id === ui.atlasNodeId; })) state.atlasNodeId = ui.atlasNodeId;
    if (typeof ui.triadIndex === "number") state.triadIndex = ui.triadIndex;
    if (typeof ui.oxIndex === "number") state.oxIndex = ui.oxIndex;
    if (ui.lineageId && lineageNodes.some(function (n) { return n.id === ui.lineageId; })) state.lineageId = ui.lineageId;
    if (typeof ui.koanIndex === "number") state.koanIndex = ui.koanIndex;
    if (["all", "free", "koan", "verse", "bookmarks"].indexOf(ui.journalFilter) >= 0) state.journalFilter = ui.journalFilter;

    var prefs = readJSON(KEY.sitPrefs, {}) || {};
    if (["natural", "deep", "mozhao"].indexOf(prefs.mode) >= 0) state.sit.mode = prefs.mode;
    if ([5, 10, 15, 30].indexOf(prefs.minutes) >= 0) state.sit.minutes = prefs.minutes;
    if (typeof prefs.chime === "boolean") state.sit.chime = prefs.chime;
    state.sit.remainingMs = sitTotalMs();
  }

  function syncSitControls() {
    setSegActive($("#breath-mode-group"), function (p) { return p.dataset.mode === state.sit.mode; });
    setSegActive($("#duration-group"), function (p) { return Number(p.dataset.min) === state.sit.minutes; });
    var chime = $("#chime-toggle");
    chime.classList.toggle("is-active", state.sit.chime);
    chime.setAttribute("aria-pressed", String(state.sit.chime));
    chime.textContent = state.sit.chime ? "引磬 · 开" : "引磬 · 关";
  }

  /* ------------------------------------------------------------------------
     Event Wiring
     ------------------------------------------------------------------------ */
  function activateSvgNode(el) {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  function bindEvents() {
    // Sidebar & view switching
    $$(".nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () { setView(btn.dataset.view); });
    });
    $("#brand-home").addEventListener("click", function (e) {
      e.preventDefault();
      setView("reader");
    });
    $("#sidebar-toggle").addEventListener("click", function () {
      if (isNarrow()) {
        setMobileSidebar(false);
        $("#sidebar-open").focus({ preventScroll: true });
      } else {
        setSidebarCollapsed(true, true);
        $("#sidebar-open").focus({ preventScroll: true });
      }
    });
    $("#sidebar-open").addEventListener("click", function () {
      if (isNarrow()) setMobileSidebar(true);
      else {
        setSidebarCollapsed(false, true);
        $("#sidebar-toggle").focus({ preventScroll: true });
      }
    });
    $("#sidebar-backdrop").addEventListener("click", function () { setMobileSidebar(false); });

    // Themes
    $$(".theme-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { chooseTheme(btn.dataset.themeValue); });
    });
    var onSystemTheme = function () { if (!state.themeChosen) applyTheme(systemTheme(), { animate: true }); };
    if (systemLight) {
      if (systemLight.addEventListener) systemLight.addEventListener("change", onSystemTheme);
      else if (systemLight.addListener) systemLight.addListener(onSystemTheme);
    }

    // Epigraph
    $("#epigraph-next").addEventListener("click", function () {
      state.epigraphIdx = (state.epigraphIdx + 1) % Math.max(1, epigraphs.length);
      renderEpigraph(true);
    });

    // Reader
    $("#book-list").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-book-index]");
      if (!btn) return;
      goBook(Number(btn.dataset.bookIndex), { axis: "y" });
    });
    $("#verse-list").addEventListener("click", function (e) {
      var block = e.target.closest(".verse-block");
      if (!block) return;
      var sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length > 0 && block.contains(sel.anchorNode)) return;
      selectVerse(block.dataset.sectionId);
    });
    $("#verse-list").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var block = e.target.closest(".verse-block");
      if (!block) return;
      e.preventDefault();
      selectVerse(block.dataset.sectionId);
    });
    $("#reader-prev").addEventListener("click", function () { stepVerse(-1); });
    $("#reader-next").addEventListener("click", function () { stepVerse(1); });
    $("#reader-book-prev").addEventListener("click", function () { goBook(state.bookIndex - 1, { dir: -1, axis: "x" }); });
    $("#reader-book-next").addEventListener("click", function () { goBook(state.bookIndex + 1, { dir: 1, axis: "x" }); });
    $("#pure-toggle").addEventListener("click", function () { setPure(!state.pure); });
    $("#vertical-toggle").addEventListener("click", toggleVertical);
    $("#verse-bookmark").addEventListener("click", toggleBookmark);
    $("#verse-note-input").addEventListener("input", scheduleVerseNote);
    $("#verse-note-input").addEventListener("blur", flushVerseNote);
    $("#verse-note-open").addEventListener("click", function () {
      flushVerseNote();
      var entryId = this.dataset.entryId;
      if (!entryId || !findEntry(entryId)) return;
      state.selectedEntryId = entryId;
      setView("journal");
      if (state.journalFilter === "bookmarks" || !journalCard(entryId)) {
        state.journalFilter = "all";
        $("#journal-search").value = "";
        setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === "all"; });
        renderJournal();
      } else {
        markActiveCard();
        syncJournalEditor(findEntry(entryId), true);
      }
    });

    // 竖排时，滚轮上下即左右翻阅（到头后交还页面滚动）
    $("#reader-canvas").addEventListener("wheel", function (e) {
      if (!this.classList.contains("is-vertical") || e.ctrlKey) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      var max = this.scrollWidth - this.clientWidth;
      if (max <= 1) return;
      var delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.clientWidth : 1);
      var cur = this.scrollLeft;
      var atStart = cur >= -0.5;
      var atEnd = cur <= -max + 0.5;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
      e.preventDefault();
      this.scrollLeft = cur - delta;
    }, { passive: false });

    // Atlas
    $$(".sub-tab[data-atlas-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () { showAtlasTab(btn.dataset.atlasTab); });
    });
    $("#atlas-svg").addEventListener("click", function (e) {
      var g = e.target.closest("[data-map-id]");
      if (!g || g.getAttribute("data-map-id") === state.atlasNodeId) return;
      state.atlasNodeId = g.getAttribute("data-map-id");
      updateAtlasMap(true);
      saveUi();
    });
    $("#diamond-selector").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-triad-idx]");
      if (!btn || Number(btn.dataset.triadIdx) === state.triadIndex) return;
      state.triadIndex = Number(btn.dataset.triadIdx);
      renderDiamondTriad(true);
      saveUi();
    });

    // Oxherding
    $("#ox-svg").addEventListener("click", function (e) {
      var g = e.target.closest("[data-ox-idx]");
      if (g) showOx(Number(g.getAttribute("data-ox-idx")));
    });
    $("#ox-prev").addEventListener("click", function () { showOx(state.oxIndex - 1, -1); });
    $("#ox-next").addEventListener("click", function () { showOx(state.oxIndex + 1, 1); });

    // Lineage
    $("#lineage-svg").addEventListener("click", function (e) {
      var g = e.target.closest("[data-lineage-id]");
      if (!g || g.getAttribute("data-lineage-id") === state.lineageId) return;
      state.lineageId = g.getAttribute("data-lineage-id");
      updateLineage(true);
      saveUi();
    });

    // Koans
    $("#koan-selector").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-koan-idx]");
      if (btn) showKoan(Number(btn.dataset.koanIdx));
    });
    $("#koan-random").addEventListener("click", function () {
      if (koans.length < 2) return;
      var next = state.koanIndex;
      while (next === state.koanIndex) next = Math.floor(Math.random() * koans.length);
      showKoan(next);
      var pill = $('#koan-selector [data-koan-idx="' + next + '"]');
      if (pill) pill.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    });
    $("#koan-layer-one-toggle").addEventListener("click", function () {
      state.koanLayerOne = !state.koanLayerOne;
      syncKoanLayers();
    });
    $("#koan-layer-two-toggle").addEventListener("click", function () {
      state.koanLayerTwo = !state.koanLayerTwo;
      syncKoanLayers();
    });
    $("#koan-note").addEventListener("input", scheduleKoanNote);
    $("#koan-note").addEventListener("blur", flushKoanNote);
    $("#koan-note-open").addEventListener("click", function () {
      flushKoanNote();
      if (this.dataset.action === "entry" && this.dataset.entryId) {
        var entryId = this.dataset.entryId;
        state.selectedEntryId = entryId;
        setView("journal", { focusHeading: false });
        if (state.journalFilter === "bookmarks" || !journalCard(entryId)) {
          state.journalFilter = "all";
          $("#journal-search").value = "";
          setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === "all"; });
          renderJournal();
        } else {
          markActiveCard();
          syncJournalEditor(findEntry(entryId), true);
        }
      } else if (this.dataset.action === "filter") {
        state.journalFilter = "koan";
        $("#journal-search").value = this.dataset.koanTitle || "";
        setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === "koan"; });
        state.journalStale = true;
        setView("journal", { focusHeading: false });
      }
    });

    // Journal
    $("#journal-new").addEventListener("click", createNewJournal);
    $("#journal-filters").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-filter]");
      if (!btn || btn.dataset.filter === state.journalFilter) return;
      state.journalFilter = btn.dataset.filter;
      setSegActive($("#journal-filters"), function (c) { return c === btn; });
      renderJournal({ syncEditor: false });
      saveUi();
    });
    $("#journal-search").addEventListener("input", function () { renderJournal({ syncEditor: false }); });
    $("#journal-list").addEventListener("click", function (e) {
      var clearBtn = e.target.closest("[data-clear-journal-filter]");
      if (clearBtn) {
        state.journalFilter = "all";
        $("#journal-search").value = "";
        setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === "all"; });
        renderJournal({ syncEditor: false });
        saveUi();
        return;
      }
      var jumpBm = e.target.closest("[data-bookmark-jump]");
      if (jumpBm) {
        var parts = jumpBm.dataset.bookmarkJump.split(":");
        jumpToVerse(parts[0], parts[1]);
        return;
      }
      var unbm = e.target.closest("[data-unbookmark-key]");
      if (unbm) {
        var key = unbm.dataset.unbookmarkKey;
        var bIdx = state.journal.bookmarks.indexOf(key);
        if (bIdx < 0) return;
        var nextBm = state.journal.bookmarks.slice();
        nextBm.splice(bIdx, 1);
        if (!commitJournal(state.journal.entries, nextBm)) return;
        var kParts = key.split(":");
        updateVerseMark(kParts[0], kParts[1]);
        var curB = currentBook();
        var curS = currentSection();
        if (curB && curS && curB.id === kParts[0] && curS.id === kParts[1]) syncBookmarkButton(curB, curS, null);
        renderJournal({ syncEditor: false });
        toast("已取消收藏", {
          label: "撤销",
          run: function () {
            if (state.journal.bookmarks.indexOf(key) >= 0) return;
            var restoredBm = state.journal.bookmarks.slice();
            restoredBm.splice(Math.min(bIdx, restoredBm.length), 0, key);
            if (!commitJournal(state.journal.entries, restoredBm)) return;
            updateVerseMark(kParts[0], kParts[1]);
            var cb = currentBook();
            var cs = currentSection();
            if (cb && cs && cb.id === kParts[0] && cs.id === kParts[1]) syncBookmarkButton(cb, cs, null);
            renderJournal({ syncEditor: false });
          }
        });
        return;
      }
      var card = e.target.closest("[data-entry-id]");
      if (card) selectJournalEntry(card.dataset.entryId);
    });
    $("#journal-source-jump").addEventListener("click", function () {
      if (this.dataset.jumpType === "verse" && this.dataset.bookId) {
        jumpToVerse(this.dataset.bookId, this.dataset.sectionId);
      } else if (this.dataset.jumpType === "koan" && this.dataset.koanIdx !== undefined) {
        setView("koans", { focusHeading: false });
        showKoan(Number(this.dataset.koanIdx));
      }
    });
    ["#journal-title", "#journal-scene", "#journal-observation", "#journal-doubt", "#journal-light", "#journal-tags"].forEach(function (sel) {
      $(sel).addEventListener("input", scheduleJournalSave);
      $(sel).addEventListener("blur", flushJournal);
    });
    $("#journal-delete").addEventListener("click", deleteJournalEntry);
    $("#journal-delete").addEventListener("blur", disarmDelete);
    $("#journal-export-one").addEventListener("click", function () {
      flushJournal();
      var entry = findEntry(state.selectedEntryId);
      if (entry) saveMarkdownFile(displayTitle(entry), entryToMarkdown(entry));
    });
    $("#journal-export-all").addEventListener("click", function () {
      flushAll();
      if (!state.journal.entries.length) return;
      var md = state.journal.entries.map(entryToMarkdown).join("\n\n");
      saveMarkdownFile("BODHI-觉照手记-" + localDateKey(), md);
    });
    $("#journal-import-btn").addEventListener("click", function () { $("#journal-import").click(); });
    $("#journal-import").addEventListener("change", function () {
      importMarkdownFiles(this.files);
      this.value = "";
    });

    // Stillness
    $("#huatou-next").addEventListener("click", cycleHuatou);
    $("#breath-mode-group").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-mode]");
      if (!btn) return;
      state.sit.mode = btn.dataset.mode;
      syncSitControls();
      saveSitPrefs();
      if (state.sit.active) {
        window.clearTimeout(state.sit.breathTimer);
        state.sit.breathStep = 0;
        runBreathCycle();
      }
    });
    $("#duration-group").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-min]");
      if (!btn || state.sit.active) return;
      state.sit.minutes = Number(btn.dataset.min);
      syncSitControls();
      saveSitPrefs();
      resetSit();
    });
    $("#chime-toggle").addEventListener("click", function () {
      state.sit.chime = !state.sit.chime;
      syncSitControls();
      saveSitPrefs();
    });
    $("#stillness-toggle").addEventListener("click", function () {
      if (state.sit.active) pauseSit();
      else startSit();
    });
    $("#stillness-reset").addEventListener("click", resetSit);
    $("#stillness-fullscreen").addEventListener("click", function () { setZen(true); });
    $("#zen-exit").addEventListener("click", function () { setZen(false); });
    document.addEventListener("fullscreenchange", function () {
      if (!document.fullscreenElement && document.body.classList.contains("is-zen-fullscreen")) setZen(false);
    });

    // Toast
    $("#toast-action").addEventListener("click", function () {
      var action = toastState.action;
      hideToast();
      if (action && action.run) action.run();
    });
    $("#toast").addEventListener("mouseenter", function () {
      toastState.hover = true;
      window.clearTimeout(toastState.timer);
    });
    $("#toast").addEventListener("mouseleave", function () {
      toastState.hover = false;
      if ($("#toast").classList.contains("is-visible")) scheduleToastHide(1600);
    });
    $("#toast").addEventListener("focusin", function () {
      toastState.focus = true;
      window.clearTimeout(toastState.timer);
    });
    $("#toast").addEventListener("focusout", function (e) {
      if (e.relatedTarget && $("#toast").contains(e.relatedTarget)) return;
      toastState.focus = false;
      if ($("#toast").classList.contains("is-visible")) scheduleToastHide(1600);
    });

    // Command palette
    [$("#cmd-open"), $("#topbar-cmd-btn")].forEach(function (btn) {
      if (btn) btn.addEventListener("click", openCommandModal);
    });
    $("#cmd-modal").addEventListener("mousedown", function (e) {
      if (e.target === this) closeCommandModal();
    });
    $("#cmd-input").addEventListener("input", renderCommandResults);
    $("#cmd-results").addEventListener("click", function (e) {
      var item = e.target.closest("[data-cmd-idx]");
      if (item) activateCommand(Number(item.dataset.cmdIdx));
    });
    $("#cmd-results").addEventListener("mousemove", function (e) {
      var item = e.target.closest("[data-cmd-idx]");
      if (item && Number(item.dataset.cmdIdx) !== state.commandIndex) setCommandActive(Number(item.dataset.cmdIdx), false);
    });

    // Typography popover
    $("#topbar-typo-btn").addEventListener("click", function (e) {
      e.stopPropagation();
      setTypoOpen(!$("#typo-popover").classList.contains("is-open"));
    });
    $("#typo-reset").addEventListener("click", function () {
      Object.keys(TYPO).forEach(function (name) {
        localSet(TYPO[name].key, TYPO_DEFAULTS[name]);
        applyTypo(name, TYPO_DEFAULTS[name], true);
      });
    });
    $("#reader-size-control").addEventListener("input", function () { applyTypo("size", this.value, true); });
    $("#reader-leading-control").addEventListener("input", function () { applyTypo("leading", this.value, true); });
    $("#reader-measure-control").addEventListener("input", function () { applyTypo("measure", this.value, true); });

    document.addEventListener("click", function (e) {
      var popEl = $("#typo-popover");
      if (popEl.classList.contains("is-open") && !popEl.contains(e.target) && !e.target.closest("#topbar-typo-btn")) {
        setTypoOpen(false);
      }
      var jumpBtn = e.target.closest("[data-book-jump]");
      if (jumpBtn) jumpToVerse(jumpBtn.dataset.bookJump);
    });

    // Persist edits whenever the page is hidden or closed
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushAll();
    });

    var resizeRaf = 0;
    window.addEventListener("resize", function () {
      window.cancelAnimationFrame(resizeRaf);
      resizeRaf = window.requestAnimationFrame(function () {
        var sb = $("#sidebar");
        var ws = $("#workspace");
        if (sb && sb._anim) { sb._anim.cancel(); sb._anim = null; }
        if (ws && ws._anim) { ws._anim.cancel(); ws._anim = null; }
        if (sb) sb.classList.remove("is-leaving");
        if (!isNarrow()) setMobileSidebar(false, { skipFocusRestore: true });
        syncSidebarAria();
        $$(".seg").forEach(function (seg) { syncSeg(seg, true); });
      });
    });

    // Global keyboard
    document.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      var mod = e.ctrlKey || e.metaKey;
      var key = (e.key || "").toLowerCase();

      if (mod && key === "k") {
        e.preventDefault();
        if (isCommandOpen()) closeCommandModal();
        else openCommandModal();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        if (flushAll()) toast("已保存在本机");
        return;
      }

      if (isCommandOpen()) {
        var n = state.commandResults.length;
        if (e.key === "Escape") {
          e.preventDefault();
          closeCommandModal();
        } else if (e.key === "ArrowDown" && n) {
          e.preventDefault();
          setCommandActive((state.commandIndex + 1) % n, true);
        } else if (e.key === "ArrowUp" && n) {
          e.preventDefault();
          setCommandActive((state.commandIndex - 1 + n) % n, true);
        } else if (e.key === "Enter") {
          e.preventDefault();
          activateCommand(state.commandIndex);
        } else if (e.key === "Tab") {
          e.preventDefault();
          $("#cmd-input").focus();
        }
        return;
      }

      if (e.key === "Escape") {
        if ($("#typo-popover").classList.contains("is-open")) {
          setTypoOpen(false);
          $("#topbar-typo-btn").focus({ preventScroll: true });
        } else if ($("#sidebar").classList.contains("is-open")) {
          setMobileSidebar(false);
        } else if (state.zenWanted || document.body.classList.contains("is-zen-fullscreen")) {
          setZen(false);
        }
        return;
      }

      var segGroup = e.target && e.target.closest && e.target.closest('[role="radiogroup"], [role="tablist"]');
      var segItem = e.target && e.target.closest && e.target.closest('[role="radio"], [role="tab"]');
      if (segGroup && segItem && (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End")) {
        var items = Array.prototype.filter.call(
          segGroup.querySelectorAll('[role="radio"], [role="tab"]'),
          function (el) { return !el.disabled && el.offsetParent !== null; }
        );
        var curPos = items.indexOf(segItem);
        if (curPos >= 0 && items.length > 1) {
          e.preventDefault();
          var nextPos = curPos;
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextPos = (curPos - 1 + items.length) % items.length;
          else if (e.key === "ArrowRight" || e.key === "ArrowDown") nextPos = (curPos + 1) % items.length;
          else if (e.key === "Home") nextPos = 0;
          else if (e.key === "End") nextPos = items.length - 1;
          var targetBtn = items[nextPos];
          targetBtn.focus({ preventScroll: true });
          targetBtn.click();
          return;
        }
      }

      var svgNode = e.target && e.target.closest && e.target.closest("[data-map-id], [data-ox-idx], [data-lineage-id]");
      if (svgNode && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        activateSvgNode(svgNode);
        return;
      }

      if (mod || e.altKey || isTypingTarget(e.target)) return;

      if (document.body.classList.contains("is-zen-fullscreen")) {
        if (e.key === " " && !(e.target && e.target.closest && e.target.closest("button"))) {
          e.preventDefault();
          if (state.sit.active) pauseSit();
          else startSit();
        }
        return;
      }

      var viewMap = { "1": "reader", "2": "atlas", "3": "ox", "4": "lineage", "5": "koans", "6": "journal", "7": "stillness" };
      if (viewMap[e.key]) {
        setView(viewMap[e.key]);
      } else if (state.view === "reader" && (e.key === "ArrowUp" || key === "k")) {
        if (e.key === "ArrowUp") e.preventDefault();
        stepVerse(-1);
      } else if (state.view === "reader" && (e.key === "ArrowDown" || key === "j")) {
        if (e.key === "ArrowDown") e.preventDefault();
        stepVerse(1);
      } else if (state.view === "ox" && e.key === "ArrowLeft") {
        showOx(state.oxIndex - 1, -1);
      } else if (state.view === "ox" && e.key === "ArrowRight") {
        showOx(state.oxIndex + 1, 1);
      } else if (state.view === "koans" && e.key === "ArrowLeft") {
        showKoan(state.koanIndex - 1);
      } else if (state.view === "koans" && e.key === "ArrowRight") {
        showKoan(state.koanIndex + 1);
      } else if (state.view === "stillness" && e.key === " " && !(e.target && e.target.closest && e.target.closest("button"))) {
        e.preventDefault();
        if (state.sit.active) pauseSit();
        else startSit();
      }
    });
  }

  function init() {
    restoreState();
    applyTheme(state.theme, { animate: false });
    initTypography();

    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
    if (isMac) {
      $("#cmd-kbd").textContent = "⌘ K";
      $("#topbar-cmd-btn").title = "检索 (⌘ K)";
    }

    buildBookList();
    renderBook({ instant: true });

    buildAtlasMap();
    updateAtlasMap(false);
    renderConsciousnesses();
    buildDiamondSelector();
    renderDiamondTriad(false);
    showAtlasTab(state.atlasTab, true);

    buildOx();
    showOx(state.oxIndex, 0, true);

    buildLineage();
    updateLineage(false);

    buildKoanSelector();
    showKoan(state.koanIndex, { instant: true });

    setSegActive($("#journal-filters"), function (c) { return c.dataset.filter === state.journalFilter; });
    if (state.selectedEntryId === null && state.journal.entries.length > 0) {
      state.selectedEntryId = state.journal.entries[0].id;
    }
    renderJournal();

    if (huatouList.length) {
      state.huatouIndex = Math.floor(Math.random() * huatouList.length);
      $("#huatou-text").textContent = huatouList[state.huatouIndex];
    }
    syncSitControls();
    updateStillnessUI();

    if (epigraphs.length) state.epigraphIdx = Math.floor(Math.random() * epigraphs.length);
    renderEpigraph(false);

    if (localGet(KEY.sidebar, "0") === "1") setSidebarCollapsed(true, false);
    syncSidebarAria();
    if ($("#toast")) $("#toast").inert = true;

    $$(".seg").forEach(initSeg);
    bindEvents();
    var initialView = localGet(KEY.lastView, "reader");
    setView(initialView, { force: true, focusHeading: false });

    if (initialView === "reader" && state.verseId) {
      var book = currentBook();
      if (book && sectionIndex(book, state.verseId) > 0) {
        window.requestAnimationFrame(function () { scrollToVerse(state.verseId, true); });
      }
    }

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        document.documentElement.classList.remove("is-booting");
        $$(".seg").forEach(function (seg) { syncSeg(seg, true); });
      });
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { $$(".seg").forEach(function (seg) { syncSeg(seg, true); }); });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
