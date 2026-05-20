// K-Lyric Neo — YouTube Content Script
// Extracts Korean captions, romanizes, and translates in real time

(function () {
  "use strict";

  // ── State ──
  let panel = null;
  let lyricsList = null;
  let toggleBtn = null;
  let captions = [];
  let isActive = false;
  let targetLang = "en";
  let translationCache = {};
  let currentCaptionIdx = -1;
  let videoEl = null;
  let syncInterval = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  // ── Korean detection regex ──
  const KOREAN_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

  // ── Initialize when on a video page ──
  function init() {
    if (panel) return; // already initialized

    // Wait for video element
    videoEl = document.querySelector("video");
    if (!videoEl) {
      setTimeout(init, 1000);
      return;
    }

    createPanel();
    createToggleButton();
    extractCaptions();

    // Re-extract when video changes (YouTube SPA navigation)
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        captions = [];
        currentCaptionIdx = -1;
        clearPanel();
        setTimeout(() => {
          videoEl = document.querySelector("video");
          extractCaptions();
        }, 2000);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Extract captions from YouTube ──
  async function extractCaptions() {
    // Method 1: Try to get captions from YouTube's player API
    try {
      const player = document.querySelector("#movie_player");
      if (player && player.getVideoData) {
        const videoData = player.getVideoData();
        if (videoData) {
          updatePanelStatus(
            `Video: ${videoData.title || "Unknown"}`
          );
        }
      }
    } catch {}

    // Method 2: Fetch caption track from YouTube page
    try {
      const pageHtml = document.documentElement.innerHTML;

      // Find caption track URLs in the page
      const captionRegex =
        /"captionTracks":\s*(\[.*?\])/;
      const match = pageHtml.match(captionRegex);

      if (match) {
        const tracks = JSON.parse(match[1]);

        // Find Korean track
        const koTrack = tracks.find(
          (t) =>
            t.languageCode === "ko" ||
            t.languageCode === "kr" ||
            (t.name && t.name.simpleText && /korean|한국어/i.test(t.name.simpleText))
        );

        if (koTrack && koTrack.baseUrl) {
          await fetchCaptionTrack(koTrack.baseUrl);
          return;
        }

        // If no Korean track, try auto-generated
        const autoTrack = tracks.find(
          (t) => t.kind === "asr" && t.languageCode === "ko"
        );
        if (autoTrack && autoTrack.baseUrl) {
          await fetchCaptionTrack(autoTrack.baseUrl);
          return;
        }

        // Show available languages if no Korean found
        const langs = tracks.map((t) => t.languageCode).join(", ");
        updatePanelStatus(`Sin subtítulos coreanos. Disponibles: ${langs}`);
        return;
      }

      // Method 3: Try player API for caption tracks
      const player = document.querySelector("#movie_player");
      if (player && player.getOption && player.getOption("captions", "tracklist")) {
        const tracklist = player.getOption("captions", "tracklist");
        const koTrack = tracklist.find((t) => t.language_code === "ko");
        if (koTrack) {
          // Enable Korean captions and read from DOM
          player.setOption("captions", "track", { languageCode: "ko" });
          setTimeout(readCaptionsFromDOM, 2000);
          return;
        }
      }

      updatePanelStatus("No se encontraron subtítulos. Intenta activarlos manualmente (CC).");
    } catch (err) {
      console.error("K-Lyric Neo: Error extracting captions", err);
      updatePanelStatus("Error al extraer subtítulos");
    }
  }

  // ── Fetch and parse caption track XML ──
  async function fetchCaptionTrack(url) {
    try {
      // Add fmt=srv3 for XML format
      const fetchUrl = url + "&fmt=srv3";
      const res = await fetch(fetchUrl);
      const xml = await res.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "text/xml");
      const textNodes = doc.querySelectorAll("p");

      captions = [];
      textNodes.forEach((node) => {
        const text = node.textContent.trim();
        if (!text) return;

        const start = parseInt(node.getAttribute("t"), 10) / 1000; // ms to seconds
        const dur = parseInt(node.getAttribute("d"), 10) / 1000;

        // Split multi-line captions
        const lines = text.split(/\n/).filter((l) => l.trim());
        lines.forEach((line) => {
          if (KOREAN_RE.test(line)) {
            captions.push({
              start,
              end: start + dur,
              original: line.trim(),
              romanized: Aromanize.romanize(line.trim()),
              translationEn: null,
              translationEs: null,
            });
          }
        });
      });

      if (captions.length > 0) {
        renderCaptions();
        startSync();
        updatePanelStatus(`${captions.length} líneas coreanas detectadas`);
        // Auto-translate current language
        translateAll(targetLang);
      } else {
        updatePanelStatus("No se encontraron líneas en coreano");
      }
    } catch (err) {
      console.error("K-Lyric Neo: Error parsing captions", err);
      updatePanelStatus("Error al procesar subtítulos");
    }
  }

  // ── Read captions from DOM (fallback) ──
  function readCaptionsFromDOM() {
    const captionSegments = document.querySelectorAll(
      ".ytp-caption-segment, .captions-text"
    );

    captions = [];
    const seen = new Set();

    captionSegments.forEach((el) => {
      const text = el.textContent.trim();
      if (text && KOREAN_RE.test(text) && !seen.has(text)) {
        seen.add(text);
        captions.push({
          start: 0,
          end: 0,
          original: text,
          romanized: Aromanize.romanize(text),
          translationEn: null,
          translationEs: null,
        });
      }
    });

    if (captions.length > 0) {
      renderCaptions();
      updatePanelStatus(`${captions.length} líneas (modo DOM)`);
      translateAll(targetLang);
    } else {
      updatePanelStatus("Activa los subtítulos (CC) y vuelve a intentar");
    }
  }

  // ── Translate all captions ──
  async function translateAll(lang) {
    const uncached = captions
      .filter((c) => !translationCache[`${lang}::${c.original}`])
      .map((c) => c.original);

    if (uncached.length === 0) {
      // All cached, apply
      applyTranslations(lang);
      return;
    }

    // Batch translate in groups of 10 lines
    const BATCH = 10;
    for (let i = 0; i < uncached.length; i += BATCH) {
      const batch = uncached.slice(i, i + BATCH);
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
        // Fallback: cache original
        batch.forEach((text) => {
          translationCache[`${lang}::${text}`] = text;
        });
      }
    }

    applyTranslations(lang);
  }

  // ── Apply cached translations to captions ──
  function applyTranslations(lang) {
    captions.forEach((c) => {
      const key = `${lang}::${c.original}`;
      const trans = translationCache[key] || c.original;
      if (lang === "en") c.translationEn = trans;
      else c.translationEs = trans;
    });

    // Re-render active items
    if (lyricsList) {
      const items = lyricsList.querySelectorAll(".klyric-line");
      items.forEach((item, idx) => {
        const transEl = item.querySelector(".klyric-translation");
        if (transEl && captions[idx]) {
          transEl.textContent =
            lang === "en"
              ? captions[idx].translationEn
              : captions[idx].translationEs;
          transEl.classList.remove("klyric-loading");
        }
      });
    }
  }

  // ── Sync with video playback ──
  function startSync() {
    if (syncInterval) clearInterval(syncInterval);

    syncInterval = setInterval(() => {
      if (!videoEl || !isActive) return;

      const time = videoEl.currentTime;
      let newIdx = -1;

      for (let i = 0; i < captions.length; i++) {
        if (time >= captions[i].start && time <= captions[i].end) {
          newIdx = i;
          break;
        }
      }

      if (newIdx !== currentCaptionIdx) {
        currentCaptionIdx = newIdx;
        highlightLine(newIdx);
      }
    }, 200);
  }

  // ── Highlight current line ──
  function highlightLine(idx) {
    if (!lyricsList) return;

    const items = lyricsList.querySelectorAll(".klyric-line");
    items.forEach((item, i) => {
      item.classList.toggle("klyric-active", i === idx);
      if (i === idx) {
        item.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  // ── Render captions list ──
  function renderCaptions() {
    if (!lyricsList) return;
    lyricsList.innerHTML = "";

    captions.forEach((cap, idx) => {
      const line = document.createElement("div");
      line.className = "klyric-line";
      line.innerHTML = `
        <div class="klyric-original">${cap.original}</div>
        <div class="klyric-romanized">${cap.romanized}</div>
        <div class="klyric-translation klyric-loading">...</div>
      `;
      line.addEventListener("click", () => {
        if (videoEl && cap.start > 0) {
          videoEl.currentTime = cap.start;
          videoEl.play();
        }
      });
      lyricsList.appendChild(line);
    });
  }

  // ── Clear panel ──
  function clearPanel() {
    if (lyricsList) lyricsList.innerHTML = "";
  }

  // ── Update status text ──
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
      <div class="klyric-status">Detectando subtítulos...</div>
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
        // Translate if needed
        const needsTranslation = captions.some(
          (c) => (targetLang === "en" ? !c.translationEn : !c.translationEs)
        );
        if (needsTranslation) translateAll(targetLang);
        else applyTranslations(targetLang);
      });
    });

    // Close button
    panel.querySelector("#klyric-close").addEventListener("click", () => {
      panel.style.display = "none";
      isActive = false;
      if (toggleBtn) toggleBtn.style.display = "flex";
    });

    // Drag functionality
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

    isActive = true;
  }

  // ── Create toggle button (YouTube UI) ──
  function createToggleButton() {
    toggleBtn = document.createElement("button");
    toggleBtn.id = "klyric-toggle";
    toggleBtn.innerHTML = "🎵";
    toggleBtn.title = "K-Lyric Neo";
    toggleBtn.addEventListener("click", () => {
      if (panel) {
        panel.style.display = panel.style.display === "none" ? "flex" : "none";
        isActive = panel.style.display !== "none";
        toggleBtn.style.display = isActive ? "none" : "flex";
      }
    });
    toggleBtn.style.display = "none"; // Hidden until panel is closed
    document.body.appendChild(toggleBtn);
  }

  // ── Start ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }
})();
