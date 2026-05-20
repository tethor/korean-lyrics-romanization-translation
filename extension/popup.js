// K-Lyric Neo — Popup Script

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const statusEl = document.getElementById("status");

  if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
    statusEl.textContent = "✅ Video de YouTube detectado. El panel debería estar visible.";
    statusEl.style.color = "#4ade80";
  } else {
    statusEl.textContent = "⚠️ Navega a un video de YouTube para activar.";
    statusEl.style.color = "#fbbf24";
  }
});
