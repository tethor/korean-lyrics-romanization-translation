// K-Lyric Neo — YouTube Content Script v2
// Reads captions directly from YouTube's rendered DOM

(function () {
  "use strict";

  // ── State ──
  let panel = null;
  let lyricsList = null;
  let toggleBtn = null;
  let captions = []; // { start, end, original, romanized, translationEn, translationEs }
  let isActive = true;
  let targetLang = "en";
  let translationCache = {};
  let currentCaptionText = "";
  let videoEl = null;
  let syncInterval = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let captionObserver = null;
  let seenCaptions = new Map(); // text -> { firstSeen, lastSeen }

  const KOREAN_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

  // ── Init ──
  function init() {
    if (panel) return;

    videoEl = document.querySelector("video");
    if (!videoEl) {
      setTimeout(init, 1500);
      return;
    }

    createPanel();
    createToggleButton();
    startCaptionObserver();
    startVideoTimeTracking();
    observeYouTubeNavigation();
  }

  // ── Observe YouTube SPA navigation ──
  function observeYouTubeNavigation() {
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        resetState();
        setTimeout(() => {
          videoEl = document.querySelector("video");
          startCaptionObserver();
        }, 2000);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function resetState() {
    captions = [];
    seenCaptions.clear();
    currentCaptionText = "";
    if (lyricsList) lyricsList.innerHTML = "";
    updatePanelStatus("Detectando subtítulos...");
  }

  // ── Watch for caption elements in DOM ──
  function startCaptionObserver() {
    if (captionObserver) captionObserver.disconnect();

    // YouTube renders captions inside these elements
    const captionContainer =
      document.querySelector(".ytp-caption-window-container") ||
      document.querySelector(".caption-window") ||
      document.querySelector("#movie_player");

    if (!captionContainer) {
      setTimeout(startCaptionObserver, 2000);
      return;
    }

    captionObserver = new MutationObserver(() => {
      readCaptionFromDOM();
    });

    captionObserver.observe(captionContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Also check immediately
    readCaptionFromDOM();

    updatePanelStatus("Observando subtítulos...");
  }

  // ── Read current caption text from DOM ──
  function readCaptionFromDOM() {
    // YouTube renders captions in .ytp-caption-segment elements
    const segments = document.querySelectorAll(
      ".ytp-caption-segment, .captions-text, .caption-visual-line"
    );

    if (segments.length === 0) return;

    // Get the full caption text (may span multiple segments)
    let fullText = "";
    segments.forEach((seg) => {
      const t = seg.textContent.trim();
      if (t) fullText += (fullText ? " " : "") + t;
    });

    if (!fullText || fullText === currentCaptionText) return;
    currentCaptionText = fullText;

    // Check if it contains Korean
    if (!KOREAN_RE.test(fullText)) return;

    // Check if we've seen this exact text before
    if (seenCaptions.has(fullText)) {
      // Update last seen time
      const entry = seenCaptions.get(fullText);
      entry.lastSeen = videoEl ? videoEl.currentTime : Date.now();
      return;
    }

    // New caption line!
    const time = videoEl ? videoEl.currentTime : 0;
    const entry = {
      text: fullText,
      firstSeen: time,
      lastSeen: time,
    };
    seenCaptions.set(fullText, entry);

    // Add to captions array
    const cap = {
      start: time,
      end: time + 3, // approximate 3 seconds duration
      original: fullText,
      romanized: Aromanize.romanize(fullText),
      translationEn: null,
      translationEs: null,
    };

    // Check cache for translations
    const cachedEn = translationCache[`en::${fullText}`];
    const cachedEs = translationCache[`es::${fullText}`];
    if (cachedEn) cap.translationEn = cachedEn;
    if (cachedEs) cap.translationEs = cachedEs;

    captions.push(cap);

    // Update durations of previous captions
    if (captions.length > 1) {
      const prev = captions[captions.length - 2];
      if (prev.end === prev.start + 3) {
        prev.end = time;
      }
    }

    // Render new line
    addCaptionLine(cap, captions.length - 1);

    // Update status
    updatePanelStatus(`${captions.length} líneas detectadas`);

    // Auto-translate if we have enough lines
    if (captions.length % 5 === 0 || captions.length <= 3) {
      translatePending(targetLang);
    }
  }

  // ── Track video time for sync ──
  function startVideoTimeTracking() {
    setInterval(() => {
      if (!videoEl || !isActive) return;

      const time = videoEl.currentTime;
      let activeIdx = -1;

      for (let i = captions.length - 1; i >= 0; i--) {
        if (time >= captions[i].start) {
          activeIdx = i;
          break;
        }
      }

      if (activeIdx >= 0) {
        highlightLine(activeIdx);
      }
    }, 250);
  }

  // ── Translate pending captions ──
  async function translatePending(lang) {
    const uncached = captions
      .filter((c) => {
        const key = `${lang}::${c.original}`;
        return !translationCache[key] && !(lang === "en" ? c.translationEn : c.translationEs);
      })
      .map((c) => c.original);

    if (uncached.length === 0) return;

    // Deduplicate
    const unique = [...new Set(uncached)];

    // Batch translate
    const BATCH = 8;
    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH);
      const combined = batch.join("\n");

      try {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(combined)}&langpair=ko|${lang}&de=pocapay@pocapay.com`
        );
        const data = await res.json();

        if (data.responseStatus === 200) {
          const translated = data.responseData.translatedText.split("\n");
          batch.forEach((text, idx) => {
            translationCache[`${lang}::${text}`] = translated[idx] || text;
          });
        }
      } catch {
        batch.forEach((text) => {
          if (!translationCache[`${lang}::${text}`]) {
            translationCache[`${lang}::${text}`] = "...";
          }
        });
      }
    }

    // Apply translations to captions and DOM
    applyTranslations(lang);
  }

  // ── Apply translations ──
  function applyTranslations(lang) {
    captions.forEach((c) => {
      const key = `${lang}::${c.original}`;
      const trans = translationCache[key];
      if (trans) {
        if (lang === "en") c.translationEn = trans;
        else c.translationEs = trans;
      }
    });

    // Update DOM
    if (lyricsList) {
      const items = lyricsList.querySelectorAll(".klyric-line");
      items.forEach((item, idx) => {
        if (!captions[idx]) return;
        const transEl = item.querySelector(".klyric-translation");
        if (transEl) {
          const val = lang === "en" ? captions[idx].translationEn : captions[idx].translationEs;
          if (val) {
            transEl.textContent = val;
            transEl.classList.remove("klyric-loading");
          }
        }
      });
    }
  }

  // ── Add single caption line to panel ──
  function addCaptionLine(cap, idx) {
    if (!lyricsList) return;

    const line = document.createElement("div");
    line.className = "klyric-line";
    line.innerHTML = `
      <div class="klyric-original">${escapeHtml(cap.original)}</div>
      <div class="klyric-romanized">${escapeHtml(cap.romanized)}</div>
      <div class="klyric-translation klyric-loading">${
        (targetLang === "en" ? cap.translationEn : cap.translationEs) || "..."
      }</div>
    `;
    line.addEventListener("click", () => {
      if (videoEl && cap.start > 0) {
        videoEl.currentTime = cap.start;
        videoEl.play();
      }
    });
    lyricsList.appendChild(line);

    // Auto-scroll to bottom
    lyricsList.scrollTop = lyricsList.scrollHeight;
  }

  // ── Highlight current line ──
  function highlightLine(idx) {
    if (!lyricsList) return;

    const items = lyricsList.querySelectorAll(".klyric-line");
    items.forEach((item, i) => {
      item.classList.toggle("klyric-active", i === idx);
    });
  }

  // ── Escape HTML ──
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Update status ──
  function updatePanelStatus(text) {
    const statusEl = panel?.querySelector(".klyric-status");
    if (statusEl) statusEl.textContent = text;
  }

  // ── Create side panel ──
  function createPanel() {
    panel = document.createElement("div");
    panel.id = "klyric-panel";
    panel.innerHTML = `
      <div class="klyric-header" id="klyric-drag-handle">
        <span class="klyric-title">🎵 K-Lyric Neo</span>
        <div class="klyric-controls">
          <button class="klyric-lang-btn klyric-lang-active" data-lang="en">EN</button>
          <button class="klyric-lang-btn" data-lang="es">ES</button>
          <button class="klyric-close-btn" id="klyric-close">✕</button>
        </div>
      </div>
      <div class="klyric-status">Esperando subtítulos en coreano...</div>
      <div class="klyric-hint">Activa CC en el video si no aparecen</div>
      <div class="klyric-body" id="klyric-lyrics"></div>
    `;

    document.body.appendChild(panel);
    lyricsList = panel.querySelector("#klyric-lyrics");

    // Language toggle
    panel.querySelectorAll(".klyric-lang-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        targetLang = btn.dataset.lang;
        panel.querySelectorAll(".klyric-lang-btn").forEach((b) => {
          b.classList.toggle("klyric-lang-active", b.dataset.lang === targetLang);
        });
        translatePending(targetLang);
        applyTranslations(targetLang);
      });
    });

    // Close
    panel.querySelector("#klyric-close").addEventListener("click", () => {
      panel.style.display = "none";
      isActive = false;
      if (toggleBtn) toggleBtn.style.display = "flex";
    });

    // Drag
    const dragHandle = panel.querySelector("#klyric-drag-handle");
    dragHandle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      panel.style.transition = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      panel.style.left = `${e.clientX - dragOffset.x}px`;
      panel.style.top = `${e.clientY - dragOffset.y}px`;
      panel.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      if (panel) panel.style.transition = "";
    });
  }

  // ── Toggle button ──
  function createToggleButton() {
    toggleBtn = document.createElement("button");
    toggleBtn.id = "klyric-toggle";
    toggleBtn.innerHTML = "🎵";
    toggleBtn.title = "K-Lyric Neo";
    toggleBtn.addEventListener("click", () => {
      if (panel) {
        const showing = panel.style.display !== "none";
        panel.style.display = showing ? "none" : "flex";
        isActive = !showing;
        toggleBtn.style.display = isActive ? "none" : "flex";
      }
    });
    toggleBtn.style.display = "none";
    document.body.appendChild(toggleBtn);
  }

  // ── Start ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }
})();
