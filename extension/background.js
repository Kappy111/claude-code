// Clicking the VidToText toolbar icon opens the app in a new tab.
const APP_URL = 'https://kappy111.github.io/claude-code/';
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: APP_URL });
});
