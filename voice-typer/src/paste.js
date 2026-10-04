'use strict';

// Simulate a paste keystroke (Cmd+V / Ctrl+V) in the currently focused
// application. We use built-in OS automation so there is no native module to
// compile — keeping the app easy to build on both macOS and Windows.
//
// The text itself is placed on the clipboard by the caller; here we only send
// the paste key combination to the foreground app.

const { execFile } = require('child_process');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err, _stdout, stderr) => {
      if (err) {
        err.message += stderr ? `\n${stderr}` : '';
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function pasteFromClipboard() {
  switch (process.platform) {
    case 'darwin':
      // Requires Accessibility permission for the app (System Settings →
      // Privacy & Security → Accessibility).
      return run('osascript', [
        '-e',
        'tell application "System Events" to keystroke "v" using command down',
      ]);

    case 'win32': {
      // Use PowerShell SendKeys to emit Ctrl+V to the active window.
      const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`;
      return run('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        script,
      ]);
    }

    default:
      // Linux (best effort): prefer wtype (Wayland) then xdotool (X11).
      try {
        return await run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
      } catch (_e) {
        return run('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl']);
      }
  }
}

module.exports = { pasteFromClipboard };
