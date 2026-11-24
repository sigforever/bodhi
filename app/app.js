/* ==========================================================================
   BODHI · 菩提 — Interactive Buddhist & Zen Contemplation App Engine
   Zero-dependency vanilla JS, aligned 100% with app/styles.css & file:// mode.
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
  var STORE_KEY = "bodhi-journal-v1";
  var THEME_KEY = "bodhi-theme";
  var LAST_READ_KEY = "bodhi-last-reading";
  var SIT_COUNT_KEY = "bodhi-sit-count";

  var state = {
    view: "reader",
    bookIndex: 0,
    verseId: "",
    pure: false,
    vertical: false,
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
    journal: readJournalStore(),
    theme: localGet(THEME_KEY, "ink"),
    commandIndex: 0,
    commandResults: [],
    huatouIndex: 0,
    toastTimer: 0,
    sit: {
      active: false,
      mode: "natural",
      minutes: 10,
      remainingSec: 600,
      tickTimer: 0,
      breathTimer: 0,
      breathStep: 0,
      chime: true
    }
  };

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

  function esc(val) {
    return String(val == null ? "" : val).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function makeId(prefix) {
    return (prefix || "j") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
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

  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      el.classList.remove("is-visible");
    }, 2600);
  }

  function readJournalStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
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

  function persistJournal() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.journal));
    } catch (_) {
      toast("本机存储不可用，请检查浏览器存储权限。");
    }
  }

  function jumpToBook(bookId, sectionId) {
    var idx = books.findIndex(function (b) {
      return b.id === bookId;
    });
    if (idx < 0) return;
    state.bookIndex = idx;
    state.verseId = sectionId || "";
    setView("reader");
    renderBooks();
    var targetBook = currentBook();
    if (targetBook && !targetBook.supportsVertical && state.vertical) {
      state.vertical = false;
      $("#vertical-toggle").setAttribute("aria-pressed", "false");
      $("#vertical-toggle").classList.remove("is-active");
    }
    renderBook();
  }

  function relatedBookButton(bookId) {
    if (!bookId) return "";
    var book = books.find(function (b) {
      return b.id === bookId;
    });
    if (!book) return "";
    return '<button class="ghost-btn" data-book-jump="' + esc(book.id) + '" type="button" style="margin-top: 12px;">研读《' + esc(book.title) + '》 →</button>';
  }

  /* ------------------------------------------------------------------------
     Theme, Navigation & Typography Controls
     ------------------------------------------------------------------------ */
  function applyTheme(theme) {
    var valid = ["ink", "xuan", "celadon"];
    state.theme = valid.indexOf(theme) >= 0 ? theme : "ink";
    document.documentElement.setAttribute("data-theme", state.theme);
    localSet(THEME_KEY, state.theme);
    $$(".theme-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.themeValue === state.theme);
    });
    var metaTheme = $('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", { ink: "#11110f", xuan: "#f4efe4", celadon: "#e5ebe6" }[state.theme]);
    }
  }

  function setView(view) {
    state.view = view;
    $$(".nav-item").forEach(function (item) {
      var active = item.dataset.view === view;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-current", active ? "page" : "false");
    });
    $$(".view").forEach(function (panel) {
      panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
    });
    var activeNav = $('.nav-item[data-view="' + view + '"] .nav-label');
    var titleEl = $("#workspace-title");
    if (activeNav && titleEl) titleEl.textContent = activeNav.textContent;

    // Close mobile sidebar drawer upon navigation
    $("#sidebar").classList.remove("is-open");
    $("#sidebar-backdrop").classList.remove("is-open");
  }

  function renderEpigraph() {
    if (!epigraphs.length) return;
    var item = epigraphs[state.epigraphIdx % epigraphs.length];
    var q = $("#epigraph-quote");
    var s = $("#epigraph-source");
    if (!q || !s) return;
    q.style.opacity = "0";
    window.setTimeout(function () {
      q.textContent = item.quote;
      s.textContent = item.source;
      q.style.opacity = "1";
    }, 120);
  }

  function applyTypoSetting(prop, value, unit, valSelector, storageKey) {
    document.documentElement.style.setProperty(prop, String(value) + (unit || ""));
    var valEl = $(valSelector);
    if (valEl) valEl.textContent = String(value) + (unit || "");
    localSet(storageKey, String(value));
  }

  function initTypography() {
    var savedSize = localGet("bodhi-reader-size", "19");
    var savedLeading = localGet("bodhi-reader-leading", "2.05");
    var savedMeasure = localGet("bodhi-reader-measure", "680");

    $("#reader-size-control").value = savedSize;
    $("#reader-leading-control").value = savedLeading;
    $("#reader-measure-control").value = savedMeasure;

    applyTypoSetting("--reader-size", savedSize, "px", "#typo-size-val", "bodhi-reader-size");
    applyTypoSetting("--reader-leading", savedLeading, "", "#typo-leading-val", "bodhi-reader-leading");
    applyTypoSetting("--reader-measure", savedMeasure, "px", "#typo-measure-val", "bodhi-reader-measure");

    var badge = $("#font-status-badge");
    if (window.BODHI_FONT && badge) {
      window.BODHI_FONT.onChange(function (st) {
        badge.textContent = st.label;
        badge.classList.toggle("is-ready", Boolean(st.ready));
        badge.classList.toggle("is-fallback", st.source === "system");
      });
    }
  }

  /* ------------------------------------------------------------------------
     01 · 藏经精读 (Reader)
     ------------------------------------------------------------------------ */
  function currentBook() {
    return books[state.bookIndex] || null;
  }

  function currentSection() {
    var book = currentBook();
    if (!book || !Array.isArray(book.sections) || !book.sections.length) return null;
    return book.sections.find(function (s) {
      return s.id === state.verseId;
    }) || book.sections[0];
  }

  function renderBooks() {
    var list = $("#book-list");
    var countEl = $("#book-count");
    if (!list) return;
    if (countEl) countEl.textContent = String(books.length).padStart(2, "0") + " 部";
    if (!books.length) {
      list.innerHTML = '<p class="margin-text">典籍数据尚未加载。</p>';
      return;
    }

    var lastRead = null;
    try {
      lastRead = JSON.parse(localGet(LAST_READ_KEY, "null"));
    } catch (_) {
      lastRead = null;
    }

    list.innerHTML = books.map(function (b, idx) {
      var active = idx === state.bookIndex;
      var total = (b.sections || []).length || 1;
      var curPos = 1;
      if (active && state.verseId) {
        var found = b.sections.findIndex(function (s) { return s.id === state.verseId; });
        if (found >= 0) curPos = found + 1;
      } else if (lastRead && lastRead.bookId === b.id && lastRead.sectionId) {
        var lastFound = b.sections.findIndex(function (s) { return s.id === lastRead.sectionId; });
        if (lastFound >= 0) curPos = lastFound + 1;
      }
      var pct = Math.round((curPos / total) * 100);
      return (
        '<button type="button" class="book-item' + (active ? " is-active" : "") + '" data-book-index="' + idx + '">' +
          '<span class="book-item-title">' + esc(b.title) + '</span>' +
          '<span class="book-item-meta">' + esc(b.category) + ' · ' + esc(b.completeness) + '</span>' +
          '<span class="book-item-progress"><span style="width:' + pct + '%"></span></span>' +
        '</button>'
      );
    }).join("");
  }

  function renderMargin(section) {
    var box = $("#margin-content");
    var headingEl = $("#margin-heading");
    if (!box) return;
    if (!section) {
      if (headingEl) headingEl.textContent = "随文观照";
      box.innerHTML = '<p class="margin-text">点击左侧任意经文段落，展开白话译读、深义疏解与日用观照。</p>';
      return;
    }

    if (headingEl) headingEl.textContent = section.heading || "随文观照";

    var html = "";
    if (section.translation) {
      html += '<div class="margin-section"><span class="margin-label">白话直译</span><p class="margin-text">' + esc(section.translation) + '</p></div>';
    }
    if (section.commentary) {
      html += '<div class="margin-section"><span class="margin-label">义理疏解</span><p class="margin-text">' + esc(section.commentary) + '</p></div>';
    }
    if (section.delusion || section.awakened) {
      html += '<div class="dual-cards">';
      if (section.delusion) {
        html += '<div class="lens-card is-delusion"><div class="lens-card-title">凡夫执见 · 所破</div><p class="lens-card-body">' + esc(section.delusion) + '</p></div>';
      }
      if (section.awakened) {
        html += '<div class="lens-card is-awakened"><div class="lens-card-title">般若照见 · 实相</div><p class="lens-card-body">' + esc(section.awakened) + '</p></div>';
      }
      html += '</div>';
    }
    if (section.contemplation) {
      html += '<div class="margin-section"><span class="margin-label">日用观照</span><div class="contemplation-box">' + esc(section.contemplation) + '</div></div>';
    }
    box.innerHTML = html;
  }

  function syncVerseNoteUI(book, section) {
    var input = $("#verse-note-input");
    var statusEl = $("#verse-note-status");
    var markBtn = $("#verse-bookmark");
    if (!book || !section) {
      if (input) input.value = "";
      if (statusEl) statusEl.textContent = "未选择段落";
      return;
    }

    var note = state.journal.entries.find(function (e) {
      return e.type === "verse" && e.bookId === book.id && e.sectionId === section.id;
    });
    if (input) input.value = note ? note.observation || note.body || "" : "";
    if (statusEl) statusEl.textContent = note ? "已记入觉照手记" : "未记录";

    var key = book.id + ":" + section.id;
    var bookmarked = state.journal.bookmarks.indexOf(key) >= 0;
    if (markBtn) {
      markBtn.setAttribute("aria-pressed", String(bookmarked));
      markBtn.classList.toggle("is-active", bookmarked);
      markBtn.textContent = bookmarked ? "★" : "☆";
      markBtn.title = bookmarked ? "取消收藏此段" : "收藏此段";
    }
  }

  function renderBook() {
    var book = currentBook();
    if (!book) return;

    var sections = Array.isArray(book.sections) ? book.sections : [];
    if (!state.verseId || !sections.some(function (s) { return s.id === state.verseId; })) {
      state.verseId = sections[0] ? sections[0].id : "";
    }

    $("#reader-title").textContent = book.fullTitle || book.title;
    $("#reader-meta").textContent = [book.author, book.category, book.completeness].filter(Boolean).join(" · ");
    $("#reader-summary").textContent = book.summary || "";

    var curIdx = Math.max(0, sections.findIndex(function (s) { return s.id === state.verseId; }));
    $("#reader-progress").textContent = String(curIdx + 1).padStart(2, "0") + " / " + String(sections.length || 1).padStart(2, "0");

    // Vertical scroll eligibility
    var vertBtn = $("#vertical-toggle");
    if (!book.supportsVertical) {
      if (state.vertical) state.vertical = false;
      vertBtn.disabled = true;
      vertBtn.title = "此部散文经典适合横排精读";
      vertBtn.style.opacity = "0.42";
    } else {
      vertBtn.disabled = false;
      vertBtn.title = "切换传统竖排书卷模式";
      vertBtn.style.opacity = "1";
    }

    vertBtn.classList.toggle("is-active", state.vertical);
    vertBtn.setAttribute("aria-pressed", String(state.vertical));
    $("#pure-toggle").classList.toggle("is-active", state.pure);
    $("#pure-toggle").setAttribute("aria-pressed", String(state.pure));

    $("#reader-layout").classList.toggle("is-pure", state.pure);
    $("#reader-canvas").classList.toggle("is-pure", state.pure);
    $("#reader-canvas").classList.toggle("is-vertical", state.vertical);

    var verseList = $("#verse-list");
    verseList.innerHTML = sections.map(function (s, idx) {
      var isSelected = s.id === state.verseId;
      var hasNote = state.journal.entries.some(function (e) {
        return e.type === "verse" && e.bookId === book.id && e.sectionId === s.id;
      });
      var isBookmarked = state.journal.bookmarks.indexOf(book.id + ":" + s.id) >= 0;
      var isNoted = hasNote || isBookmarked;

      return (
        '<article class="verse-block' + (isSelected ? " is-selected" : "") + (isNoted ? " is-noted" : "") + '" data-section-id="' + esc(s.id) + '" tabindex="0" role="button" aria-label="' + esc(s.heading) + '">' +
          '<span class="verse-heading"><span class="verse-num">' + String(idx + 1).padStart(2, "0") + '</span>' + esc(s.heading) + '</span>' +
          '<p class="verse-text">' + esc(s.original) + '</p>' +
          '<span class="verse-mark" aria-hidden="true">' + (isBookmarked ? "★" : "") + '</span>' +
        '</article>'
      );
    }).join("");

    var activeSection = currentSection();
    renderMargin(activeSection);
    syncVerseNoteUI(book, activeSection);
    renderBooks();

    if (activeSection) {
      localSet(LAST_READ_KEY, JSON.stringify({ bookId: book.id, sectionId: activeSection.id }));
    }
  }

  function saveVerseNote() {
    var book = currentBook();
    var section = currentSection();
    if (!book || !section) return;
    var val = $("#verse-note-input").value.trim();
    var existing = state.journal.entries.find(function (e) {
      return e.type === "verse" && e.bookId === book.id && e.sectionId === section.id;
    });
    var now = new Date().toISOString();

    if (!val) {
      if (existing) {
        state.journal.entries = state.journal.entries.filter(function (e) { return e.id !== existing.id; });
        persistJournal();
        renderBook();
        renderJournal();
        toast("已清除此段批注。");
      }
      return;
    }

    if (existing) {
      existing.observation = val;
      existing.body = val;
      existing.updatedAt = now;
    } else {
      state.journal.entries.unshift({
        id: makeId("v"),
        type: "verse",
        title: "《" + book.title + "》· " + section.heading,
        scene: section.original.slice(0, 60),
        observation: val,
        doubt: "",
        light: "",
        body: val,
        bookId: book.id,
        sectionId: section.id,
        tags: [book.title, "经文批注"],
        createdAt: now,
        updatedAt: now
      });
    }

    persistJournal();
    renderBook();
    renderJournal();
    toast("批注已保存至觉照手记。");
  }

  /* ------------------------------------------------------------------------
     02 · 觉悟全景 (Star Map / Eight Consciousnesses / Diamond Triads)
     ------------------------------------------------------------------------ */
  function renderAtlasMap() {
    var svg = $("#atlas-svg");
    if (!svg) return;
    svg.innerHTML = "";

    // Contemplative rings behind Zen
    svg.appendChild(svgEl("circle", { cx: 632, cy: 195, r: 76, fill: "none", stroke: "var(--border)", "stroke-dasharray": "3 5" }));
    svg.appendChild(svgEl("circle", { cx: 365, cy: 195, r: 175, fill: "none", stroke: "var(--border)", opacity: "0.4" }));

    [
      { x: 96, y: 42, text: "立根 · 缘起" },
      { x: 274, y: 42, text: "破相 · 性空" },
      { x: 452, y: 42, text: "析心 / 显性" },
      { x: 632, y: 42, text: "直指 · 顿悟" }
    ].forEach(function (lbl) {
      svg.appendChild(svgEl("text", {
        x: lbl.x, y: lbl.y, "text-anchor": "middle", fill: "var(--fg-muted)", "font-size": "11", "letter-spacing": "2"
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
      var related = aId === state.atlasNodeId || bId === state.atlasNodeId;
      var isVert = aId === "yogacara" && bId === "tathagata";
      var d = isVert
        ? "M " + a.x + " " + (a.y + 34) + " L " + b.x + " " + (b.y - 34)
        : "M " + (a.x + 62) + " " + a.y + " C " + ((a.x + b.x) / 2) + " " + a.y + ", " + ((a.x + b.x) / 2) + " " + b.y + ", " + (b.x - 62) + " " + b.y;

      svg.appendChild(svgEl("path", {
        d: d,
        fill: "none",
        stroke: related ? "var(--seal)" : "var(--svg-line)",
        "stroke-width": related ? "1.6" : "1.1",
        "stroke-dasharray": isVert ? "4 4" : "none",
        opacity: related ? "0.92" : "0.65",
        class: "svg-edge" + (related ? " is-highlighted" : "")
      }));
    });

    mapNodes.forEach(function (node) {
      var selected = node.id === state.atlasNodeId;
      var g = svgEl("g", {
        class: "svg-node" + (selected ? " is-selected" : ""),
        tabindex: "0",
        role: "button",
        "data-map-id": node.id,
        "aria-label": node.title + "：" + node.subtitle
      });

      var w = 124;
      var h = 68;
      g.appendChild(svgEl("rect", {
        x: node.x - w / 2,
        y: node.y - h / 2,
        width: w,
        height: h,
        rx: 5,
        fill: selected ? "var(--bg-subtle)" : "var(--svg-node-bg)",
        stroke: selected ? "var(--seal)" : "var(--border-strong)",
        "stroke-width": selected ? "1.6" : "1"
      }));

      g.appendChild(svgEl("text", {
        x: node.x - w / 2 + 10,
        y: node.y - h / 2 + 16,
        fill: selected ? "var(--seal)" : "var(--fg-muted)",
        "font-size": "9.5",
        "font-family": "var(--font-mono)"
      }, node.num));

      g.appendChild(svgEl("text", {
        x: node.x,
        y: node.y - 2,
        "text-anchor": "middle",
        fill: "var(--fg)",
        "font-size": "15",
        "font-family": "var(--font-serif)",
        "letter-spacing": "2"
      }, node.title));

      g.appendChild(svgEl("text", {
        x: node.x,
        y: node.y + 18,
        "text-anchor": "middle",
        fill: "var(--fg-muted)",
        "font-size": "10.5",
        "letter-spacing": "0.6"
      }, (node.subtitle || "").split(" · ")[0]));

      svg.appendChild(g);
    });

    renderAtlasInspector(byId[state.atlasNodeId] || mapNodes[0]);
  }

  function renderAtlasInspector(node) {
    var box = $("#atlas-inspector");
    if (!box || !node) return;
    box.innerHTML =
      '<div class="inspector-top">' +
        '<span class="inspector-num">STAGE ' + esc(node.num) + '</span>' +
        '<span class="inspector-sanskrit">' + esc(node.sanskrit) + '</span>' +
      '</div>' +
      '<h2 class="inspector-title">' + esc(node.title) + '</h2>' +
      '<p class="inspector-subtitle">' + esc(node.subtitle) + '</p>' +
      '<div class="detail-block"><span class="detail-label">核心命题</span><p class="detail-text">' + esc(node.core) + '</p></div>' +
      '<div class="detail-block"><span class="detail-label">所破之执</span><p class="detail-text">' + esc(node.dissolves) + '</p></div>' +
      '<div class="detail-block"><span class="detail-label">典籍印证</span><blockquote class="detail-quote">' + esc(node.quote) + '</blockquote></div>' +
      '<div class="detail-block"><span class="detail-label">通向禅宗</span><p class="detail-text">' + esc(node.zenBridge) + '</p></div>' +
      '<div class="detail-block"><span class="detail-label">代表典籍</span><div class="tag-row">' +
        (node.scriptures || []).map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join("") +
      '</div>' + relatedBookButton(node.relatedBookId) + '</div>';
  }

  function renderConsciousnesses() {
    var root = $("#consciousness-list");
    if (!root) return;
    root.innerHTML = consciousnesses.map(function (item) {
      return (
        '<article class="wisdom-card">' +
          '<div class="wisdom-card-head">' +
            '<div>' +
              '<span class="kicker" style="margin-bottom:2px;">' + esc(item.level) + ' · ' + esc(item.sanskrit) + '</span>' +
              '<span class="wisdom-source">' + esc(item.name) + '</span>' +
            '</div>' +
            '<span class="wisdom-arrow">→</span>' +
            '<span class="wisdom-target">' + esc(item.wisdom) + '</span>' +
          '</div>' +
          '<p>' + esc(item.role) + '</p>' +
          '<div class="dual-cards">' +
            '<div class="lens-card is-delusion"><div class="lens-card-title">凡夫流转 · 染污相</div><p class="lens-card-body">' + esc(item.delusion) + '</p></div>' +
            '<div class="lens-card is-awakened"><div class="lens-card-title">转识成智 · ' + esc(item.wisdom) + '</div><p class="lens-card-body">' + esc(item.wisdomDesc) + '</p></div>' +
          '</div>' +
        '</article>'
      );
    }).join("");
  }

  function renderDiamondTriads() {
    var sel = $("#diamond-selector");
    var flow = $("#diamond-flow");
    var meaning = $("#diamond-meaning");
    if (!sel || !flow || !meaning || !triads.length) return;

    sel.innerHTML = triads.map(function (t, i) {
      return '<button type="button" class="select-pill' + (i === state.triadIndex ? " is-active" : "") + '" data-triad-idx="' + i + '">' + esc(t.concept) + '</button>';
    }).join("");

    var cur = triads[state.triadIndex] || triads[0];
    flow.innerHTML =
      '<div class="triad-step">' +
        '<span class="triad-step-num">01 · 世俗假立 (A)</span>' +
        '<h3 class="triad-step-title">' + esc(cur.statementA) + '</h3>' +
        '<p class="triad-step-desc">承认眼前现象在世俗因缘层面的宛然显现。</p>' +
      '</div>' +
      '<div class="triad-arrow" aria-hidden="true">→</div>' +
      '<div class="triad-step is-active">' +
        '<span class="triad-step-num">02 · 般若扫相 (即非A)</span>' +
        '<h3 class="triad-step-title">' + esc(cur.negationB) + '</h3>' +
        '<p class="triad-step-desc">照破其众缘和合、毫无独立不变自性的实相。</p>' +
      '</div>' +
      '<div class="triad-arrow" aria-hidden="true">→</div>' +
      '<div class="triad-step">' +
        '<span class="triad-step-num">03 · 假名妙用 (是名A)</span>' +
        '<h3 class="triad-step-title">' + esc(cur.synthesisC) + '</h3>' +
        '<p class="triad-step-desc">去执之后重新安立名字，不执实有，亦不堕虚无。</p>' +
      '</div>';

    meaning.innerHTML = esc(cur.meaning) + '<div style="margin-top:8px;">' + relatedBookButton("diamond") + '</div>';
  }

  function showAtlasTab(tab) {
    state.atlasTab = tab;
    $$(".sub-tab[data-atlas-tab]").forEach(function (btn) {
      var active = btn.dataset.atlasTab === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    $("#atlas-map-panel").classList.toggle("is-active", tab === "map");
    $("#atlas-consciousness-panel").classList.toggle("is-active", tab === "consciousness");
    $("#atlas-diamond-panel").classList.toggle("is-active", tab === "diamond");
  }

  /* ------------------------------------------------------------------------
     03 · 十牛图 (Oxherding Enso + 10 Minimalist Ink Glyphs)
     ------------------------------------------------------------------------ */
  function buildOxCenterGlyph(idx) {
    var g = svgEl("g", {
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

  function renderOx(idx) {
    if (!oxStages.length) return;
    state.oxIndex = ((idx % oxStages.length) + oxStages.length) % oxStages.length;
    var svg = $("#ox-svg");
    if (!svg) return;
    svg.innerHTML = "";

    var cx = 190;
    var cy = 190;
    var R = 136;

    svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: R, fill: "none", stroke: "var(--border-strong)", "stroke-width": "1" }));

    if (state.oxIndex > 0) {
      var startAngle = -Math.PI / 2;
      var endAngle = startAngle + (state.oxIndex / oxStages.length) * Math.PI * 2;
      var x1 = cx + R * Math.cos(startAngle);
      var y1 = cy + R * Math.sin(startAngle);
      var x2 = cx + R * Math.cos(endAngle);
      var y2 = cy + R * Math.sin(endAngle);
      var largeArc = state.oxIndex > 5 ? 1 : 0;
      svg.appendChild(svgEl("path", {
        d: "M " + x1 + " " + y1 + " A " + R + " " + R + " 0 " + largeArc + " 1 " + x2 + " " + y2,
        fill: "none",
        stroke: "var(--seal)",
        "stroke-width": "1.8",
        opacity: "0.85"
      }));
    }

    svg.appendChild(buildOxCenterGlyph(state.oxIndex));

    oxStages.forEach(function (st, i) {
      var angle = -Math.PI / 2 + (i / oxStages.length) * Math.PI * 2;
      var nx = cx + R * Math.cos(angle);
      var ny = cy + R * Math.sin(angle);
      var lx = cx + (R + 32) * Math.cos(angle);
      var ly = cy + (R + 32) * Math.sin(angle);
      var selected = i === state.oxIndex;

      var g = svgEl("g", {
        class: "svg-node" + (selected ? " is-selected" : ""),
        tabindex: "0",
        role: "button",
        "data-ox-idx": i,
        "aria-label": "第" + st.cn + "阶：" + st.title
      });

      g.appendChild(svgEl("circle", {
        cx: nx, cy: ny, r: selected ? 14 : 11,
        fill: selected ? "var(--seal)" : "var(--svg-node-bg)",
        stroke: selected ? "var(--seal)" : "var(--border-strong)",
        "stroke-width": "1.2"
      }));

      g.appendChild(svgEl("text", {
        x: nx, y: ny + 4, "text-anchor": "middle",
        fill: selected ? "#f7f3eb" : "var(--fg-soft)",
        "font-size": "11", "font-family": "var(--font-serif)"
      }, st.cn));

      g.appendChild(svgEl("text", {
        x: lx, y: ly + 4, "text-anchor": "middle",
        fill: selected ? "var(--fg)" : "var(--fg-muted)",
        "font-size": selected ? "12" : "10.5", "font-family": "var(--font-serif)", "letter-spacing": "1"
      }, st.title));

      svg.appendChild(g);
    });

    var cur = oxStages[state.oxIndex];
    $("#ox-phase-tag").textContent = cur.phase;
    $("#ox-progress").textContent = cur.num + " / " + String(oxStages.length).padStart(2, "0");

    $("#ox-inspector").innerHTML =
      '<div class="inspector-top">' +
        '<span class="inspector-num">OXHERDING · ' + esc(cur.num) + '</span>' +
        '<span class="inspector-sanskrit">' + esc(cur.en) + '</span>' +
      '</div>' +
      '<h2 class="inspector-title">第' + esc(cur.cn) + ' · ' + esc(cur.title) + '</h2>' +
      '<p class="inspector-subtitle">' + esc(cur.phase) + '</p>' +
      '<blockquote class="ox-poem">' + esc(cur.poem).replace(/\n/g, "<br/>") + '</blockquote>' +
      '<div class="detail-block"><span class="detail-label">心境特征</span><p class="detail-text">' + esc(cur.state) + '</p></div>' +
      '<div class="detail-block"><span class="detail-label">易堕之病</span><p class="detail-text">' + esc(cur.trap) + '</p></div>' +
      '<div class="detail-block"><span class="detail-label">指月之语</span><blockquote class="detail-quote">' + esc(cur.pointer) + '</blockquote>' + relatedBookButton(cur.relatedBookId) + '</div>';
  }

  /* ------------------------------------------------------------------------
     04 · 五家法脉 (Lineage)
     ------------------------------------------------------------------------ */
  function getAncestry(id) {
    var set = {};
    var byId = {};
    lineageNodes.forEach(function (n) { byId[n.id] = n; });
    var cur = byId[id];
    while (cur && !set[cur.id]) {
      set[cur.id] = true;
      cur = cur.parent ? byId[cur.parent] : null;
    }
    return set;
  }

  function renderLineage() {
    var svg = $("#lineage-svg");
    if (!svg) return;
    svg.innerHTML = "";

    var byId = {};
    lineageNodes.forEach(function (n) { byId[n.id] = n; });
    var ancestry = getAncestry(state.lineageId);

    [
      { x: 74, label: "西来初祖" },
      { x: 222, label: "南宗顿悟" },
      { x: 374, label: "二大支流" },
      { x: 526, label: "洪州 / 石头" },
      { x: 710, label: "一花开五叶" }
    ].forEach(function (col) {
      svg.appendChild(svgEl("text", {
        x: col.x, y: 22, "text-anchor": "middle", fill: "var(--fg-muted)", "font-size": "10.5", "letter-spacing": "1.5"
      }, col.label));
    });

    lineageNodes.forEach(function (node) {
      if (!node.parent) return;
      var p = byId[node.parent];
      if (!p) return;
      var onPath = Boolean(ancestry[node.id] && ancestry[p.id]);
      var x1 = p.x + 54;
      var y1 = p.y;
      var x2 = node.x - 54;
      var y2 = node.y;
      var mid = (x1 + x2) / 2;

      svg.appendChild(svgEl("path", {
        d: "M " + x1 + " " + y1 + " C " + mid + " " + y1 + ", " + mid + " " + y2 + ", " + x2 + " " + y2,
        fill: "none",
        stroke: onPath ? "var(--seal)" : "var(--svg-line)",
        "stroke-width": onPath ? "1.8" : "1.1",
        opacity: onPath ? "0.95" : "0.6",
        class: "svg-edge" + (onPath ? " is-highlighted" : "")
      }));
    });

    lineageNodes.forEach(function (node) {
      var selected = node.id === state.lineageId;
      var onPath = Boolean(ancestry[node.id]);
      var w = 108;
      var h = 46;

      var g = svgEl("g", {
        class: "svg-node" + (selected ? " is-selected" : ""),
        tabindex: "0",
        role: "button",
        "data-lineage-id": node.id,
        "aria-label": node.name + "，" + node.role
      });

      g.appendChild(svgEl("rect", {
        x: node.x - w / 2,
        y: node.y - h / 2,
        width: w,
        height: h,
        rx: 4,
        fill: selected ? "var(--seal-soft)" : "var(--svg-node-bg)",
        stroke: selected ? "var(--seal)" : onPath ? "var(--gold)" : "var(--border-strong)",
        "stroke-width": selected ? "1.6" : "1"
      }));

      g.appendChild(svgEl("text", {
        x: node.x,
        y: node.y - 2,
        "text-anchor": "middle",
        fill: "var(--fg)",
        "font-size": "14",
        "font-family": "var(--font-serif)",
        "letter-spacing": "1.5"
      }, node.name));

      g.appendChild(svgEl("text", {
        x: node.x,
        y: node.y + 14,
        "text-anchor": "middle",
        fill: "var(--fg-muted)",
        "font-size": "9.5"
      }, node.era));

      svg.appendChild(g);
    });

    var activeNode = byId[state.lineageId] || lineageNodes[0];
    if (activeNode) {
      $("#lineage-dossier").innerHTML =
        '<div>' +
          '<span class="inspector-num">' + esc(activeNode.era) + '</span>' +
          '<h2 class="inspector-title" style="margin-top:8px;">' + esc(activeNode.name) + '</h2>' +
          '<p class="inspector-subtitle" style="margin-bottom:10px;">' + esc(activeNode.role) + '</p>' +
          '<span class="chip">' + esc(activeNode.style) + '</span>' +
          '<div>' + relatedBookButton(activeNode.relatedBookId) + '</div>' +
        '</div>' +
        '<div>' +
          '<span class="detail-label">宗风与接引手段</span>' +
          '<p class="detail-text">' + esc(activeNode.method) + '</p>' +
        '</div>' +
        '<div>' +
          '<span class="detail-label">法语一瞥</span>' +
          '<blockquote class="detail-quote">' + esc(activeNode.quote) + '</blockquote>' +
        '</div>';
    }
  }

  /* ------------------------------------------------------------------------
     05 · 公案参究 (Koans)
     ------------------------------------------------------------------------ */
  function renderKoan(idx) {
    if (!koans.length) return;
    state.koanIndex = ((idx % koans.length) + koans.length) % koans.length;
    var cur = koans[state.koanIndex];

    $("#koan-selector").innerHTML = koans.map(function (k, i) {
      return '<button type="button" class="select-pill' + (i === state.koanIndex ? " is-active" : "") + '" data-koan-idx="' + i + '">' + esc(k.title) + '</button>';
    }).join("");

    $("#koan-source").textContent = [cur.source, cur.master].filter(Boolean).join(" · ");
    $("#koan-title").textContent = cur.title;
    $("#koan-quote").innerHTML = esc(cur.text).replace(/\n/g, "<br/>");
    $("#koan-doubt").textContent = cur.doubt;
    $("#koan-insight").textContent = cur.insight;
    $("#koan-book-link").innerHTML = relatedBookButton(cur.relatedBookId);

    $("#koan-layer-one").classList.toggle("is-open", state.koanLayerOne);
    $("#koan-layer-two").classList.toggle("is-open", state.koanLayerTwo);
    $("#koan-layer-one-toggle").classList.toggle("is-active", state.koanLayerOne);
    $("#koan-layer-two-toggle").classList.toggle("is-active", state.koanLayerTwo);
  }

  function saveKoanReflection() {
    var cur = koans[state.koanIndex];
    var text = $("#koan-note").value.trim();
    if (!cur) return;
    if (!text) return toast("请先写下此刻的参究心得。");
    var now = new Date().toISOString();
    state.journal.entries.unshift({
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
    });
    persistJournal();
    $("#koan-note").value = "";
    renderJournal();
    toast("参究心得已同步至觉照手记。");
  }

  /* ------------------------------------------------------------------------
     06 · 觉照手记 (Journal)
     ------------------------------------------------------------------------ */
  function renderJournal() {
    var listEl = $("#journal-list");
    if (!listEl) return;

    var q = ($("#journal-search").value || "").trim().toLowerCase();
    var tagQ = ($("#journal-tag-filter").value || "").trim().toLowerCase();
    var typeLabels = { free: "自由手记", koan: "公案参究", verse: "经文批注" };

    var filtered = state.journal.entries.filter(function (e) {
      if (state.journalFilter !== "all" && e.type !== state.journalFilter) return false;
      var hay = [e.title, e.scene, e.observation, e.doubt, e.light, e.body, (e.tags || []).join(" ")].join(" ").toLowerCase();
      if (q && hay.indexOf(q) < 0) return false;
      if (tagQ && (e.tags || []).join(" ").toLowerCase().indexOf(tagQ) < 0) return false;
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML = '<p class="margin-text" style="padding:12px;">尚无符合条件的手记。可新建手记，或在经文与公案页记录体会。</p>';
    } else {
      listEl.innerHTML = filtered.map(function (e) {
        var active = e.id === state.selectedEntryId;
        var dateStr = new Date(e.updatedAt || e.createdAt || Date.now()).toLocaleDateString("zh-CN");
        var excerpt = e.observation || e.body || e.scene || e.light || "（无正文）";
        return (
          '<button type="button" class="journal-card' + (active ? " is-active" : "") + '" data-entry-id="' + esc(e.id) + '">' +
            '<h4 class="journal-card-title">' + esc(e.title || "未命名手记") + '</h4>' +
            '<div class="journal-card-meta"><span>' + esc(typeLabels[e.type] || "手记") + '</span><span>' + esc(dateStr) + '</span></div>' +
            '<p class="journal-card-excerpt">' + esc(excerpt) + '</p>' +
          '</button>'
        );
      }).join("");
    }

    var activeEntry = state.journal.entries.find(function (e) { return e.id === state.selectedEntryId; }) || null;
    syncJournalEditor(activeEntry);
  }

  function syncJournalEditor(entry) {
    $("#journal-title").value = entry ? entry.title || "" : "";
    $("#journal-scene").value = entry ? entry.scene || "" : "";
    $("#journal-observation").value = entry ? (entry.observation || entry.body || "") : "";
    $("#journal-doubt").value = entry ? entry.doubt || "" : "";
    $("#journal-light").value = entry ? entry.light || "" : "";
    $("#journal-tags").value = entry ? (entry.tags || []).join(", ") : "";
    $("#journal-delete").disabled = !entry;
    $("#journal-export-one").disabled = !entry;
  }

  function createNewJournal() {
    state.selectedEntryId = null;
    syncJournalEditor(null);
    $("#journal-title").value = new Date().toLocaleDateString("zh-CN") + " · 如实观照";
    renderJournal();
    $("#journal-title").focus();
  }

  function saveCurrentJournal() {
    var title = $("#journal-title").value.trim() || ("无题 · " + new Date().toLocaleDateString("zh-CN"));
    var scene = $("#journal-scene").value.trim();
    var observation = $("#journal-observation").value.trim();
    var doubt = $("#journal-doubt").value.trim();
    var light = $("#journal-light").value.trim();
    var tags = $("#journal-tags").value.split(/[，,]/).map(function (t) { return t.trim(); }).filter(Boolean);
    var now = new Date().toISOString();

    var entry = state.journal.entries.find(function (e) { return e.id === state.selectedEntryId; });
    if (!entry) {
      entry = { id: makeId("f"), type: "free", createdAt: now };
      state.journal.entries.unshift(entry);
    }

    entry.title = title;
    entry.scene = scene;
    entry.observation = observation;
    entry.doubt = doubt;
    entry.light = light;
    entry.tags = tags;
    entry.body = [observation, doubt, light].filter(Boolean).join("\n\n");
    entry.updatedAt = now;

    state.selectedEntryId = entry.id;
    persistJournal();
    renderJournal();
    toast("手记已保存在本地。");
  }

  function entryToMarkdown(entry) {
    var typeMap = { free: "自由手记", koan: "公案参究", verse: "经文批注" };
    var lines = ["# " + (entry.title || "无题"), ""];
    lines.push("- **类别**：" + (typeMap[entry.type] || "手记"));
    if (entry.scene) lines.push("- **境缘**：" + entry.scene);
    if ((entry.tags || []).length) lines.push("- **标签**：" + entry.tags.join("、"));
    lines.push("- **时间**：" + new Date(entry.updatedAt || entry.createdAt || Date.now()).toLocaleString("zh-CN"));
    lines.push("", "---", "");
    if (entry.observation || entry.body) {
      lines.push("## 一、如实观照", "", entry.observation || entry.body || "", "");
    }
    if (entry.doubt) lines.push("## 二、破执疑情", "", entry.doubt, "");
    if (entry.light) lines.push("## 三、一线微明", "", entry.light, "");
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
        toast("已导出 Markdown 至所选文件夹。");
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
    toast("手记已导出为 Markdown 文件。");
  }

  function importMarkdownFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var content = String(reader.result || "");
      var titleMatch = content.match(/^#\s+(.+)$/m);
      var title = titleMatch ? titleMatch[1].trim() : file.name.replace(/\.md$/i, "");
      var body = content.replace(/^#\s+.+\n*/m, "").trim();
      var now = new Date().toISOString();
      var entry = {
        id: makeId("imp"),
        type: "free",
        title: title,
        scene: "",
        observation: body,
        doubt: "",
        light: "",
        body: body,
        tags: ["导入"],
        createdAt: now,
        updatedAt: now
      };
      state.journal.entries.unshift(entry);
      state.selectedEntryId = entry.id;
      persistJournal();
      renderJournal();
      toast("已导入 Markdown 手记。");
    };
    reader.readAsText(file, "utf-8");
  }

  /* ------------------------------------------------------------------------
     07 · 观息静室 (Stillness Sanctuary)
     ------------------------------------------------------------------------ */
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
    } catch (_) {
      /* ignore audio block */
    }
  }

  function formatSec(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function updateStillnessUI() {
    $("#breath-timer").textContent = formatSec(state.sit.remainingSec);
    $("#stillness-toggle").textContent = state.sit.active ? "暂停静坐" : "开始静坐";
    var total = state.sit.minutes * 60;
    var pct = total > 0 ? (total - state.sit.remainingSec) / total : 0;
    $("#breath-ring-progress").style.strokeDashoffset = String(741.4 * (1 - pct));
    var count = Number(localGet(SIT_COUNT_KEY, "0"));
    $("#sit-count").textContent = count > 0 ? "累计圆满静坐 " + count + " 次" : "首次静坐 · 随缘安住";
  }

  function runBreathCycle() {
    var wrap = $("#breath-enso-wrap");
    var phaseEl = $("#breath-phase");
    if (!wrap || !phaseEl || !state.sit.active) return;

    if (state.sit.mode === "mozhao") {
      wrap.className = "breath-enso-wrap";
      phaseEl.textContent = "默照";
      return;
    }

    var pattern = state.sit.mode === "deep"
      ? [{ cls: "is-inhale", label: "吸", ms: 5000 }, { cls: "is-hold", label: "止", ms: 3000 }, { cls: "is-exhale", label: "呼", ms: 7000 }]
      : [{ cls: "is-inhale", label: "吸", ms: 4000 }, { cls: "is-hold", label: "止", ms: 2000 }, { cls: "is-exhale", label: "呼", ms: 6000 }];

    var step = pattern[state.sit.breathStep % pattern.length];
    wrap.className = "breath-enso-wrap " + step.cls;
    phaseEl.textContent = step.label;
    state.sit.breathStep += 1;
    state.sit.breathTimer = window.setTimeout(runBreathCycle, step.ms);
  }

  function stopSit(phaseLabel, completed) {
    state.sit.active = false;
    window.clearInterval(state.sit.tickTimer);
    window.clearTimeout(state.sit.breathTimer);
    $("#breath-enso-wrap").className = "breath-enso-wrap";
    if (phaseLabel) $("#breath-phase").textContent = phaseLabel;
    if (completed) {
      var n = Number(localGet(SIT_COUNT_KEY, "0")) + 1;
      localSet(SIT_COUNT_KEY, String(n));
      playBowlChime();
    }
    updateStillnessUI();
  }

  function startSit() {
    if (state.sit.remainingSec <= 0) state.sit.remainingSec = state.sit.minutes * 60;
    state.sit.active = true;
    state.sit.breathStep = 0;
    playBowlChime();
    updateStillnessUI();
    runBreathCycle();
    state.sit.tickTimer = window.setInterval(function () {
      state.sit.remainingSec -= 1;
      updateStillnessUI();
      if (state.sit.remainingSec <= 0) {
        stopSit("圆满", true);
      }
    }, 1000);
  }

  function cycleHuatou() {
    if (!huatouList.length) return;
    state.huatouIndex = (state.huatouIndex + 1) % huatouList.length;
    $("#huatou-text").textContent = huatouList[state.huatouIndex];
  }

  /* ------------------------------------------------------------------------
     Global Command Palette (Ctrl+K)
     ------------------------------------------------------------------------ */
  function buildSearchResults(q) {
    var query = q.trim().toLowerCase();
    var out = [];

    if (!query) {
      books.forEach(function (b, idx) {
        out.push({
          title: b.fullTitle || b.title,
          sub: b.author + " · " + b.summary,
          badge: "藏经",
          action: function () { jumpToBook(b.id, b.sections[0] && b.sections[0].id); }
        });
      });
      return out.slice(0, 12);
    }

    function push(title, sub, badge, action) {
      if ((title + " " + sub).toLowerCase().indexOf(query) >= 0) {
        out.push({ title: title, sub: sub, badge: badge, action: action });
      }
    }

    books.forEach(function (b) {
      (b.sections || []).forEach(function (sec) {
        push(
          "《" + b.title + "》· " + sec.heading,
          [sec.original, sec.translation, sec.commentary].join(" "),
          "经文",
          function () { jumpToBook(b.id, sec.id); }
        );
      });
    });

    koans.forEach(function (k, i) {
      push(k.title, [k.text, k.doubt, k.insight].join(" "), "公案", function () {
        setView("koans");
        renderKoan(i);
      });
    });

    lineageNodes.forEach(function (n) {
      push(n.name + " · " + n.role, [n.style, n.method, n.quote].join(" "), "法脉", function () {
        state.lineageId = n.id;
        setView("lineage");
        renderLineage();
      });
    });

    oxStages.forEach(function (st, i) {
      push("十牛图 · 第" + st.cn + " " + st.title, [st.phase, st.poem, st.state].join(" "), "十牛", function () {
        setView("ox");
        renderOx(i);
      });
    });

    state.journal.entries.forEach(function (e) {
      push(e.title || "手记", [e.scene, e.observation, e.doubt, e.light, e.body].join(" "), "手记", function () {
        state.selectedEntryId = e.id;
        setView("journal");
        renderJournal();
      });
    });

    return out.slice(0, 30);
  }

  function renderCommandResults() {
    var q = $("#cmd-input").value || "";
    var list = buildSearchResults(q);
    state.commandResults = list;
    state.commandIndex = 0;
    var root = $("#cmd-results");

    if (!list.length) {
      root.innerHTML = '<div class="cmd-empty">未寻得相契词句，可尝试关键词如「无」「空」「平常心」「惠能」。</div>';
      return;
    }

    root.innerHTML = list.map(function (item, idx) {
      return (
        '<button type="button" role="option" class="cmd-item' + (idx === 0 ? " is-active" : "") + '" data-cmd-idx="' + idx + '">' +
          '<span class="cmd-item-main">' +
            '<span class="cmd-item-title">' + esc(item.title) + '</span>' +
            '<span class="cmd-item-sub">' + esc(item.sub.slice(0, 96)) + '</span>' +
          '</span>' +
          '<span class="cmd-badge">' + esc(item.badge) + '</span>' +
        '</button>'
      );
    }).join("");
  }

  function openCommandModal() {
    $("#cmd-modal").classList.add("is-open");
    $("#cmd-input").value = "";
    renderCommandResults();
    window.setTimeout(function () { $("#cmd-input").focus(); }, 30);
  }

  function closeCommandModal() {
    $("#cmd-modal").classList.remove("is-open");
  }

  function activateCommand(idx) {
    var item = state.commandResults[idx];
    if (!item) return;
    closeCommandModal();
    if (item.action) item.action();
  }

  /* ------------------------------------------------------------------------
     Event Wiring
     ------------------------------------------------------------------------ */
  function bindEvents() {
    // Sidebar & view switching
    $$(".nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setView(btn.dataset.view);
      });
    });

    $("#brand-home").addEventListener("click", function (e) {
      e.preventDefault();
      setView("reader");
    });

    $("#sidebar-toggle").addEventListener("click", function () {
      if (window.innerWidth <= 1024) {
        $("#sidebar").classList.remove("is-open");
        $("#sidebar-backdrop").classList.remove("is-open");
      } else {
        $("#sidebar").classList.toggle("is-collapsed");
      }
    });

    $("#sidebar-open").addEventListener("click", function () {
      if (window.innerWidth <= 1024) {
        $("#sidebar").classList.add("is-open");
        $("#sidebar-backdrop").classList.add("is-open");
      } else {
        $("#sidebar").classList.remove("is-collapsed");
      }
    });

    $("#sidebar-backdrop").addEventListener("click", function () {
      $("#sidebar").classList.remove("is-open");
      $("#sidebar-backdrop").classList.remove("is-open");
    });

    // Themes
    $$(".theme-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.dataset.themeValue);
      });
    });

    // Epigraph cycle
    $("#epigraph-next").addEventListener("click", function () {
      state.epigraphIdx = (state.epigraphIdx + 1) % Math.max(1, epigraphs.length);
      renderEpigraph();
    });
    $("#epigraph-next").addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        state.epigraphIdx = (state.epigraphIdx + 1) % Math.max(1, epigraphs.length);
        renderEpigraph();
      }
    });

    // Reader
    $("#book-list").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-book-index]");
      if (!btn) return;
      state.bookIndex = Number(btn.dataset.bookIndex);
      state.verseId = "";
      renderBook();
    });

    $("#verse-list").addEventListener("click", function (e) {
      var block = e.target.closest(".verse-block");
      if (!block) return;
      state.verseId = block.dataset.sectionId;
      renderBook();
    });

    $("#verse-list").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var block = e.target.closest(".verse-block");
      if (!block) return;
      e.preventDefault();
      state.verseId = block.dataset.sectionId;
      renderBook();
    });

    $("#reader-prev").addEventListener("click", function () {
      if (!books.length) return;
      state.bookIndex = (state.bookIndex - 1 + books.length) % books.length;
      state.verseId = "";
      renderBook();
    });

    $("#reader-next").addEventListener("click", function () {
      if (!books.length) return;
      state.bookIndex = (state.bookIndex + 1) % books.length;
      state.verseId = "";
      renderBook();
    });

    $("#reader-resume").addEventListener("click", function () {
      try {
        var last = JSON.parse(localGet(LAST_READ_KEY, "null"));
        if (last && last.bookId) {
          jumpToBook(last.bookId, last.sectionId);
          toast("已定位至上次研读处。");
        }
      } catch (_) {
        /* ignore */
      }
    });

    $("#pure-toggle").addEventListener("click", function () {
      state.pure = !state.pure;
      renderBook();
    });

    $("#vertical-toggle").addEventListener("click", function () {
      var book = currentBook();
      if (book && !book.supportsVertical) {
        return toast("《" + book.title + "》为长散文经体，横排精读更佳。");
      }
      state.vertical = !state.vertical;
      renderBook();
    });

    $("#verse-note-save").addEventListener("click", saveVerseNote);

    $("#verse-bookmark").addEventListener("click", function () {
      var book = currentBook();
      var section = currentSection();
      if (!book || !section) return;
      var key = book.id + ":" + section.id;
      var idx = state.journal.bookmarks.indexOf(key);
      if (idx >= 0) {
        state.journal.bookmarks.splice(idx, 1);
        toast("已取消收藏此段。");
      } else {
        state.journal.bookmarks.push(key);
        toast("已收藏此段经文。");
      }
      persistJournal();
      renderBook();
    });

    // Atlas
    $$(".sub-tab[data-atlas-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showAtlasTab(btn.dataset.atlasTab);
      });
    });

    $("#atlas-svg").addEventListener("click", function (e) {
      var g = e.target.closest("[data-map-id]");
      if (!g) return;
      state.atlasNodeId = g.dataset.mapId;
      renderAtlasMap();
    });

    $("#diamond-selector").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-triad-idx]");
      if (!btn) return;
      state.triadIndex = Number(btn.dataset.triadIdx);
      renderDiamondTriads();
    });

    // Oxherding
    $("#ox-svg").addEventListener("click", function (e) {
      var g = e.target.closest("[data-ox-idx]");
      if (!g) return;
      renderOx(Number(g.dataset.oxIdx));
    });
    $("#ox-prev").addEventListener("click", function () { renderOx(state.oxIndex - 1); });
    $("#ox-next").addEventListener("click", function () { renderOx(state.oxIndex + 1); });

    // Lineage
    $("#lineage-svg").addEventListener("click", function (e) {
      var g = e.target.closest("[data-lineage-id]");
      if (!g) return;
      state.lineageId = g.dataset.lineageId;
      renderLineage();
    });

    // Koans
    $("#koan-selector").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-koan-idx]");
      if (!btn) return;
      state.koanLayerOne = false;
      state.koanLayerTwo = false;
      renderKoan(Number(btn.dataset.koanIdx));
    });

    $("#koan-random").addEventListener("click", function () {
      state.koanLayerOne = false;
      state.koanLayerTwo = false;
      var next = Math.floor(Math.random() * Math.max(1, koans.length));
      renderKoan(next);
    });

    $("#koan-layer-one-toggle").addEventListener("click", function () {
      state.koanLayerOne = !state.koanLayerOne;
      renderKoan(state.koanIndex);
    });

    $("#koan-layer-two-toggle").addEventListener("click", function () {
      state.koanLayerTwo = !state.koanLayerTwo;
      renderKoan(state.koanIndex);
    });

    $("#koan-note-save").addEventListener("click", saveKoanReflection);

    // Journal
    $("#journal-new").addEventListener("click", createNewJournal);
    $("#journal-save").addEventListener("click", saveCurrentJournal);

    $("#journal-filters").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-filter]");
      if (!btn) return;
      state.journalFilter = btn.dataset.filter;
      $$("#journal-filters .chip").forEach(function (c) {
        c.classList.toggle("is-active", c === btn);
      });
      renderJournal();
    });

    ["#journal-search", "#journal-tag-filter"].forEach(function (sel) {
      $(sel).addEventListener("input", renderJournal);
    });

    $("#journal-list").addEventListener("click", function (e) {
      var card = e.target.closest("[data-entry-id]");
      if (!card) return;
      state.selectedEntryId = card.dataset.entryId;
      renderJournal();
    });

    $("#journal-delete").addEventListener("click", function () {
      if (!state.selectedEntryId) return;
      state.journal.entries = state.journal.entries.filter(function (e) { return e.id !== state.selectedEntryId; });
      state.selectedEntryId = null;
      persistJournal();
      renderBook();
      renderJournal();
      toast("手记已删除。");
    });

    $("#journal-export-one").addEventListener("click", function () {
      var entry = state.journal.entries.find(function (e) { return e.id === state.selectedEntryId; });
      if (entry) saveMarkdownFile(entry.title, entryToMarkdown(entry));
    });

    $("#journal-export-all").addEventListener("click", function () {
      if (!state.journal.entries.length) return toast("尚无可导出的手记。");
      var md = state.journal.entries.map(entryToMarkdown).join("\n---\n\n");
      saveMarkdownFile("BODHI-觉照手记汇总", md);
    });

    $("#journal-import").addEventListener("change", function () {
      importMarkdownFile(this.files && this.files[0]);
      this.value = "";
    });

    // Stillness
    $("#huatou-next").addEventListener("click", cycleHuatou);

    $("#breath-mode-group").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-mode]");
      if (!btn) return;
      state.sit.mode = btn.dataset.mode;
      $$("#breath-mode-group .mini-pill").forEach(function (p) { p.classList.toggle("is-active", p === btn); });
      if (state.sit.active) {
        window.clearTimeout(state.sit.breathTimer);
        state.sit.breathStep = 0;
        runBreathCycle();
      }
    });

    $("#duration-group").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-min]");
      if (!btn) return;
      state.sit.minutes = Number(btn.dataset.min);
      $$("#duration-group .mini-pill").forEach(function (p) { p.classList.toggle("is-active", p === btn); });
      stopSit("静候", false);
      state.sit.remainingSec = state.sit.minutes * 60;
      updateStillnessUI();
    });

    $("#chime-toggle").addEventListener("click", function () {
      state.sit.chime = !state.sit.chime;
      this.classList.toggle("is-active", state.sit.chime);
      this.setAttribute("aria-pressed", String(state.sit.chime));
      this.textContent = state.sit.chime ? "起止轻鸣" : "静音";
    });

    $("#stillness-toggle").addEventListener("click", function () {
      if (state.sit.active) stopSit("暂歇", false);
      else startSit();
    });

    $("#stillness-reset").addEventListener("click", function () {
      stopSit("静候", false);
      state.sit.remainingSec = state.sit.minutes * 60;
      updateStillnessUI();
    });

    $("#stillness-fullscreen").addEventListener("click", function () {
      document.body.classList.add("is-zen-fullscreen");
    });

    $("#zen-exit").addEventListener("click", function () {
      document.body.classList.remove("is-zen-fullscreen");
    });

    // Global Command Palette & Typo Popover
    [$("#cmd-open"), $("#topbar-cmd-btn")].forEach(function (btn) {
      if (btn) btn.addEventListener("click", openCommandModal);
    });

    $("#cmd-modal").addEventListener("click", function (e) {
      if (e.target === this) closeCommandModal();
    });
    $("#cmd-input").addEventListener("input", renderCommandResults);
    $("#cmd-results").addEventListener("click", function (e) {
      var item = e.target.closest("[data-cmd-idx]");
      if (item) activateCommand(Number(item.dataset.cmdIdx));
    });

    [$("#typo-btn"), $("#topbar-typo-btn"), $("#reader-typo-btn")].forEach(function (btn) {
      if (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          $("#typo-popover").classList.toggle("is-open");
        });
      }
    });
    $("#typo-close").addEventListener("click", function () {
      $("#typo-popover").classList.remove("is-open");
    });

    document.addEventListener("click", function (e) {
      var pop = $("#typo-popover");
      if (pop.classList.contains("is-open") && !pop.contains(e.target)) {
        pop.classList.remove("is-open");
      }
      var jumpBtn = e.target.closest("[data-book-jump]");
      if (jumpBtn) jumpToBook(jumpBtn.dataset.bookJump);
    });

    $("#reader-size-control").addEventListener("input", function () {
      applyTypoSetting("--reader-size", this.value, "px", "#typo-size-val", "bodhi-reader-size");
    });
    $("#reader-leading-control").addEventListener("input", function () {
      applyTypoSetting("--reader-leading", this.value, "", "#typo-leading-val", "bodhi-reader-leading");
    });
    $("#reader-measure-control").addEventListener("input", function () {
      applyTypoSetting("--reader-measure", this.value, "px", "#typo-measure-val", "bodhi-reader-measure");
    });

    // Global Keyboard Shortcuts
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommandModal();
        return;
      }

      if ($("#cmd-modal").classList.contains("is-open")) {
        if (e.key === "Escape") closeCommandModal();
        if (e.key === "ArrowDown" && state.commandResults.length) {
          e.preventDefault();
          state.commandIndex = (state.commandIndex + 1) % state.commandResults.length;
        }
        if (e.key === "ArrowUp" && state.commandResults.length) {
          e.preventDefault();
          state.commandIndex = (state.commandIndex - 1 + state.commandResults.length) % state.commandResults.length;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          $$(".cmd-item").forEach(function (el, i) { el.classList.toggle("is-active", i === state.commandIndex); });
          var activeEl = $$(".cmd-item")[state.commandIndex];
          if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
        }
        if (e.key === "Enter") {
          e.preventDefault();
          activateCommand(state.commandIndex);
        }
        return;
      }

      if (e.key === "Escape") {
        $("#typo-popover").classList.remove("is-open");
        document.body.classList.remove("is-zen-fullscreen");
        return;
      }

      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      var viewMap = { "1": "reader", "2": "atlas", "3": "ox", "4": "lineage", "5": "koans", "6": "journal", "7": "stillness" };
      if (viewMap[e.key]) {
        setView(viewMap[e.key]);
      } else if (state.view === "ox" && e.key === "ArrowLeft") {
        renderOx(state.oxIndex - 1);
      } else if (state.view === "ox" && e.key === "ArrowRight") {
        renderOx(state.oxIndex + 1);
      }
    });
  }

  function init() {
    applyTheme(state.theme);
    initTypography();

    // Restore last reading book & section if saved
    try {
      var last = JSON.parse(localGet(LAST_READ_KEY, "null"));
      if (last && last.bookId) {
        var idx = books.findIndex(function (b) { return b.id === last.bookId; });
        if (idx >= 0) {
          state.bookIndex = idx;
          state.verseId = last.sectionId || "";
        }
      }
    } catch (_) {
      /* ignore */
    }

    renderBooks();
    renderBook();
    renderAtlasMap();
    renderConsciousnesses();
    renderDiamondTriads();
    renderOx(0);
    renderLineage();
    renderKoan(0);
    renderJournal();

    if (huatouList.length) $("#huatou-text").textContent = huatouList[0];
    updateStillnessUI();
    renderEpigraph();
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
