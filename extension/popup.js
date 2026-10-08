// Popup: two actions — transcribe the current tab's audio, or open the app
// page to transcribe a file.

const warn = document.getElementById("warn");

function showWarn(msg) {
  warn.textContent = msg;
  warn.hidden = false;
}

document.getElementById("file-btn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "openApp" });
  window.close();
});

document.getElementById("tab-btn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showWarn("Couldn't find the current tab.");
    return;
  }
  // Can't capture Chrome's own pages (chrome://, the Web Store, etc.).
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("https://chromewebstore.google.com")
  ) {
    showWarn("This tab can't be captured. Open a normal web page or video first.");
    return;
  }
  await chrome.runtime.sendMessage({
    type: "startTabCapture",
    targetTabId: tab.id,
  });
  window.close();
});
