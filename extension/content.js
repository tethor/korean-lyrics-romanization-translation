// K-Lyric Neo — YouTube Content Script v3
// Compact floating box: romanized + translation of current line

(function () {
  "use strict";

  // ── State ──
  let widget = null;
  let isActive = true;
  let targetLang = "en";
  let translationCache = {};
  let currentCaptionText = "";
  let videoEl = null;
  let captionObserver = null;
  let seenCaptions = new Map();

  const KOREAN_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

  // ── Init ──
  function init() {
    if (widget) return;
    videoEl = document.querySelector("video");
    if (!videoEl) { setTimeout(init, 1500); return; }

    createWidget();
    startCaptionObserver();
    observeYouTubeNavigation();
  }

  // ── SPA navigation ──
  function observeYouTubeNavigation() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        seenCaptions.clear();
        currentCaptionText = "";
        setWidgetText("", "", "Esperando...");
        setTimeout(() => {
          videoEl = document.querySelector("video");
          startCaptionObserver();
        }, 2000);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ── Watch caption DOM ──
  function startCaptionObserver() {
    if (captionObserver) captionObserver.disconnect();

    const target =
      document.querySelector(".ytp-caption-window-container") ||
      document.querySelector("#movie_player");

    if (!target) { setTimeout(startCaptionObserver, 2000); return; }

    captionObserver = new MutationObserver(() => readCaption());
    captionObserver.observe(target, { childList: true, subtree: true, characterData: true });
    readCaption();
  }

  // ── Read current caption ──
  function readCaption() {
    const segments = document.querySelectorAll(".ytp-caption-segment, .captions-text");
    if (!segments.length) return;

    let text = "";
    segments.forEach(s => { const t = s.textContent.trim(); if (t) text += (text ? " " : "") + t; });

    if (!text || text === currentCaptionText) return;
    currentCaptionText = text;

    if (!KOREAN_RE.test(text)) return;

    // Already seen → just show cached
    if (seenCaptions.has(text)) {
      showCaption(text);
      return;
    }

    // New caption
    seenCaptions.set(text, true);
    showCaption(text);
    translateOne(text);
  }

  // ── Show caption in widget ──
  function showCaption(text) {
    const romanized = Aromanize.romanize(text);
    const cached = translationCache[`${targetLang}::${text}`];
    setWidgetText(romanized, cached || null, cached ? null : "...");
  }

  // ── Translate a single text ──
  async function translateOne(text) {
    const key = `${targetLang}::${text}`;
    if (translationCache[key]) return;

    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|${targetLang}&de=pocapay@pocapay.com`
      );
      const data = await res.json();
      if (data.responseStatus === 200) {
        translationCache[key] = data.responseData.translatedText;
      }
    } catch {
      translationCache[key] = "...";
    }

    // Update widget if still showing same text
    if (currentCaptionText === text) {
      setWidgetText(Aromanize.romanize(text), translationCache[key], null);
    }
  }

  // ── Set widget content ──
  function setWidgetText(romanized, translation, loadingMsg) {
    if (!widget) return;
    const romanEl = widget.querySelector(".kn-roman");
    const transEl = widget.querySelector(".kn-trans");

    if (romanEl) romanEl.textContent = romanized || "—";

    if (transEl) {
      if (loadingMsg) {
        transEl.textContent = loadingMsg;
        transEl.classList.add("kn-loading");
      } else {
        transEl.textContent = translation || "";
        transEl.classList.remove("kn-loading");
      }
    }
  }

  // ── Create compact widget ──
  function createWidget() {
    widget = document.createElement("div");
    widget.id = "klyric-widget";
    widget.innerHTML = `
      <div class="kn-drag" id="kn-drag-handle">
        <span class="kn-title">🎵</span>
        <div class="kn-controls">
          <button class="kn-lang" data-lang="en">EN</button>
          <button class="kn-lang kn-lang-active" data-lang="es">ES</button>
          <button class="kn-hide" id="kn-close">✕</button>
        </div>
      </div>
      <div class="kn-body">
        <div class="kn-roman">—</div>
        <div class="kn-trans kn-loading">Esperando subtítulos...</div>
      </div>
    `;
    document.body.appendChild(widget);

    // Lang toggle
    widget.querySelectorAll(".kn-lang").forEach(btn => {
      btn.addEventListener("click", () => {
        targetLang = btn.dataset.lang;
        widget.querySelectorAll(".kn-lang").forEach(b =>
          b.classList.toggle("kn-lang-active", b.dataset.lang === targetLang)
        );
        // Re-show current with new lang
        if (currentCaptionText) showCaption(currentCaptionText);
      });
    });

    // Close
    widget.querySelector("#kn-close").addEventListener("click", () => {
      widget.style.display = "none";
      isActive = false;
      const btn = document.getElementById("klyric-toggle");
      if (btn) btn.style.display = "flex";
    });

    // Drag
    const handle = widget.querySelector("#kn-drag-handle");
    let dragging = false, off = { x: 0, y: 0 };
    handle.addEventListener("mousedown", e => {
      if (e.target.closest("button")) return;
      dragging = true;
      const r = widget.getBoundingClientRect();
      off.x = e.clientX - r.left;
      off.y = e.clientY - r.top;
      widget.style.transition = "none";
    });
    document.addEventListener("mousemove", e => {
      if (!dragging) return;
      widget.style.left = `${e.clientX - off.x}px`;
      widget.style.top = `${e.clientY - off.y}px`;
      widget.style.right = "auto";
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
      if (widget) widget.style.transition = "";
    });

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "klyric-toggle";
    toggleBtn.innerHTML = "🎵";
    toggleBtn.title = "K-Lyric Neo";
    toggleBtn.style.display = "none";
    toggleBtn.addEventListener("click", () => {
      widget.style.display = "flex";
      isActive = true;
      toggleBtn.style.display = "none";
    });
    document.body.appendChild(toggleBtn);
  }

  // ── Start ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }
})();
