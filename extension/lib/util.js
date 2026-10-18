// Small shared helpers for the popup and library pages.

export function sanitizeName(name, fallback = "screenshot") {
  const clean = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, " ") // illegal path chars
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean || fallback;
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Download a stored screenshot to disk. Chrome's downloads API treats a
// "/" in the filename as a subfolder inside the user's Downloads directory,
// so each folder becomes its own subdirectory.
export async function downloadScreenshot(shot, folderName) {
  const url = URL.createObjectURL(shot.blob);
  const stamp = new Date(shot.createdAt)
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const base = sanitizeName(shot.title);
  const dir = sanitizeName(folderName, "Snapfolder");
  const filename = `Snapfolder/${dir}/${base}-${stamp}.png`;
  try {
    await chrome.downloads.download({ url, filename, saveAs: false });
  } finally {
    // Revoke a little later so the download has time to read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
