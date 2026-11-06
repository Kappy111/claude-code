// the1min — shared helpers for the popup and lock screen.

const HE_LOCKS = {
  pin:     { label: "PIN code",      icon: "\u{1F522}", badge: "PIN" },
  phrase:  { label: "Secret phrase", icon: "\u{1F4AC}", badge: "Phrase" },
  pattern: { label: "Pattern",       icon: "⠿",    badge: "Pattern" },
};

async function heHash(str) {
  const data = new TextEncoder().encode("hawkeye::" + str);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Turn anything the user typed ("poki.com", "https://poki.com/games", "www.Poki.com")
// into a clean host: "poki.com". Returns "" if it can't find one.
function heHost(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    return new URL(s).hostname.replace(/^www\./i, "").toLowerCase();
  } catch (e) {
    return "";
  }
}

const heUid = () => Math.random().toString(36).slice(2, 9);
const heEsc = (s) =>
  String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

async function heGetSites() {
  const { sites } = await chrome.storage.local.get("sites");
  return Array.isArray(sites) ? sites : [];
}
async function heSetSites(sites) {
  await chrome.storage.local.set({ sites });
}

// Build a tap-to-connect 3x3 pattern pad. onChange gets "0-1-4-8".
function heBuildPattern(onChange) {
  const wrap = document.createElement("div");
  wrap.className = "pattern-wrap";
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 210 210");
  const poly = document.createElementNS(svgNS, "polyline");
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke", "var(--accent)");
  poly.setAttribute("stroke-width", "4");
  poly.setAttribute("stroke-linejoin", "round");
  poly.setAttribute("stroke-linecap", "round");
  svg.appendChild(poly);
  wrap.appendChild(svg);

  const grid = document.createElement("div");
  grid.className = "pat-grid";
  const seq = [];
  const centers = [];
  for (let i = 0; i < 9; i++) centers.push([35 + (i % 3) * 70, 35 + ((i / 3) | 0) * 70]);
  for (let i = 0; i < 9; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    d.innerHTML = "<b></b>";
    d.addEventListener("click", () => {
      if (seq.includes(i)) return;
      seq.push(i);
      d.classList.add("on");
      poly.setAttribute("points", seq.map((k) => centers[k].join(",")).join(" "));
      onChange(seq.join("-"));
    });
    grid.appendChild(d);
  }
  wrap.appendChild(grid);

  const clr = document.createElement("button");
  clr.className = "btn btn-ghost small";
  clr.textContent = "Clear";
  clr.style.cssText = "display:block;margin:8px auto 0";
  clr.addEventListener("click", () => {
    seq.length = 0;
    poly.setAttribute("points", "");
    [...grid.children].forEach((d) => d.classList.remove("on"));
    onChange("");
  });

  const box = document.createElement("div");
  box.appendChild(wrap);
  box.appendChild(clr);
  return box;
}

const HE_EYE_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <defs><radialGradient id="heir" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#f3d78a"/><stop offset="55%" stop-color="#c8972b"/><stop offset="100%" stop-color="#7a5a10"/>
  </radialGradient></defs>
  <path d="M24 10 C10 10 3 24 3 24 S10 38 24 38 45 24 45 24 38 10 24 10Z" fill="none" stroke="#e4b23e" stroke-width="3"/>
  <circle cx="24" cy="24" r="10" fill="url(#heir)"/>
  <circle cx="24" cy="24" r="4.4" fill="#17120a"/>
  <circle cx="27" cy="21" r="1.6" fill="#fff" opacity=".85"/>
</svg>`;
