'use strict';

const { nativeImage } = require('electron');

// Build the tray icon at runtime from an inline SVG so we don't ship image
// assets. Red microphone while recording, neutral grey otherwise.
function micIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    <rect x="9" y="3" width="4" height="9" rx="2" fill="${color}"/>
    <path d="M6 10a5 5 0 0 0 10 0" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="11" y1="15" x2="11" y2="18" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="8" y1="18" x2="14" y2="18" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  return nativeImage.createFromDataURL(dataUrl);
}

function trayIconFor(isRecording) {
  return micIcon(isRecording ? '#e5484d' : '#8a8a8a');
}

module.exports = { trayIconFor };
