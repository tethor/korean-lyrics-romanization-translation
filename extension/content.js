// K-Lyric Neo — YouTube Content Script v5
// Fix: strict dedup + single source of truth

(function () {
  "use strict";

  let widget = null;
  let targetLang = "en";
  let translationCache = {};
  let videoEl = null;
  let captionObserver = null;
  let lastRomanized = "";     // what's currently on screen
  let lastRawText = "";       // raw Korean for translation
  let debounceTimer = null;
  let cooldownTimer = null;
  let inCooldown = false;

  const KOREAN_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

  function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function init() {
    if (widget) return;
    videoEl = document.querySelector("video");
    if (!videoEl) { setTimeout(init, 1500); return; }

    createWidget();
    startCaptionObserver();
    observeYouTubeNavigation();
  }

  function observeYouTubeNavigation() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastRomanized = "";
        lastRawText = "";
        inCooldown = false;
        clearTimeout(cooldownTimer);
        setWidget("—", null, "Esperando subtítulos...");
        setTimeout(() => {
          videoEl = document.querySelector("video");
          startCaptionObserver();
        }, 2000);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function startCaptionObserver() {
    if (captionObserver) captionObserver.disconnect();

    const target =
      document.querySelector(".ytp-caption-window-container") ||
      document.querySelector("#movie_player");

    if (!target) { setTimeout(startCaptionObserver, 2000); return; }

    captionObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(readCaption, 200);
    });

    captionObserver.observe(target, { childList: true, subtree: true, characterData: true });
  }

  function readCaption() {
    // During cooldown, ignore all reads
    if (inCooldown) return;

    const segments = document.querySelectorAll(".ytp-caption-segment");
    if (!segments.length) return;

    // Build full text from all segments
    let raw = "";
    segments.forEach(s => {
      const t = s.textContent.trim();
      if (t) raw += (raw ? " " : "") + t;
    });

    const text = normalize(raw);
    if (!text || !KOREAN_RE.test(text)) return;

    // Generate romanized
    const romanized = Aromanize.romanize(text);

    // Skip if same romanized text is already showing
    if (romanized === lastRomanized) return;

    // Update state
    lastRomanized = romanized;
    lastRawText = text;

    // Show immediately
    const cached = translationCache[`${targetLang}::${text}`];
    setWidget(romanized, cached || null, cached ? null : "...");

    // Translate if not cached
    if (!cached) translateOne(text, romanized);

    // Start cooldown — ignore any mutations for next 800ms
    // This prevents the same caption from being read multiple times
    // as YouTube updates the DOM
    inCooldown = true;
    clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => { inCooldown = false; }, 800);
  }

  async function translateOne(text, romanized) {
    const key = `${targetLang}::${text}`;
    if (translationCache[key]) return;

    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|${targetLang}&de=pocapay@pocapay.com`
      );
      const data = await res.json();
      translationCache[key] = data.responseStatus === 200
        ? data.responseData.translatedText
        : "...";
    } catch {
      translationCache[key] = "...";
    }

    // Update only if still showing same caption
    if (lastRomanized === romanized) {
      setWidget(romanized, translationCache[key], null);
    }
  }

  function setWidget(romanized, translation, loadingMsg) {
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

  function createWidget() {
    widget = document.createElement("div");
    widget.id = "klyric-widget";
    widget.innerHTML = `
      <div class="kn-drag" id="kn-drag-handle">
        <span class="kn-title">🎵</span>
        <div class="kn-controls">
          <button class="kn-lang kn-lang-active" data-lang="en">EN</button>
          <button class="kn-lang" data-lang="es">ES</button>
          <button class="kn-hide" id="kn-close">✕</button>
        </div>
      </div>
      <div class="kn-body">
        <div class="kn-roman">—</div>
        <div class="kn-trans kn-loading">Esperando subtítulos...</div>
      </div>
    `;
    document.body.appendChild(widget);

    widget.querySelectorAll(".kn-lang").forEach(btn => {
      btn.addEventListener("click", () => {
        targetLang = btn.dataset.lang;
        widget.querySelectorAll(".kn-lang").forEach(b =>
          b.classList.toggle("kn-lang-active", b.dataset.lang === targetLang)
        );
        if (lastRawText) {
          const cached = translationCache[`${targetLang}::${lastRawText}`];
          if (cached) setWidget(lastRomanized, cached, null);
          else translateOne(lastRawText, lastRomanized);
        }
      });
    });

    widget.querySelector("#kn-close").addEventListener("click", () => {
      widget.style.display = "none";
      document.getElementById("klyric-toggle").style.display = "flex";
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
      widget.style.transform = "none";
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
      toggleBtn.style.display = "none";
    });
    document.body.appendChild(toggleBtn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }
})();
