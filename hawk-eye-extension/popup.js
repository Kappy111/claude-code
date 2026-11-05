// Hawk Eye — popup: add locked sites, list them, remove them, re-lock all.

document.getElementById("logo").innerHTML =
  HE_EYE_SVG + '<div><h1>HAWK EYE</h1><p>an invention by <b>The I Min</b></p></div>';

const TILE = ["#c0392b","#8e44ad","#2980b9","#16a085","#d35400","#2c3e50","#c8972b","#27ae60","#7f3fbf","#1f6f8b"];
const colorFor = (s) => { let h=0; for (let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return TILE[h%TILE.length]; };

let setupType = "pin";

function renderLockTypes() {
  const box = document.getElementById("ltBox");
  box.innerHTML = Object.entries(HE_LOCKS).map(([k,v]) =>
    `<button type="button" class="lt" data-k="${k}" aria-pressed="${k===setupType}">
       <span class="ic">${v.icon}</span><span>${v.badge}</span>
     </button>`).join("");
  box.querySelectorAll(".lt").forEach((b) =>
    b.addEventListener("click", () => {
      setupType = b.dataset.k;
      box.querySelectorAll(".lt").forEach((x) => x.setAttribute("aria-pressed", x.dataset.k===setupType));
      renderSecretArea();
    }));
}

function renderSecretArea() {
  const a = document.getElementById("secretArea");
  if (setupType === "pin") {
    a.innerHTML = `<label class="fld">Set a PIN (3–8 digits)</label>
      <input class="inp mono" id="suSecret" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="off">`;
  } else if (setupType === "phrase") {
    a.innerHTML = `<label class="fld">Set a secret phrase</label>
      <input class="inp" id="suSecret" maxlength="40" placeholder="open sesame" autocomplete="off">`;
  } else {
    a.innerHTML = `<label class="fld">Draw a pattern — tap the dots in order</label>`;
    a.appendChild(heBuildPattern((seq) => { a.dataset.seq = seq; }));
    a.dataset.seq = "";
  }
}

async function render() {
  const sites = await heGetSites();
  const card = document.getElementById("listCard");
  if (!sites.length) { card.innerHTML = '<div class="empty">No sites locked yet.</div>'; return; }
  card.innerHTML = "";
  sites.forEach((s) => {
    const row = document.createElement("div");
    row.className = "site-row";
    const letter = (s.name || s.host).trim()[0].toUpperCase();
    row.innerHTML =
      `<div class="favic" style="background:${colorFor(s.host)}">${letter}</div>
       <div style="flex:1;min-width:0">
         <div class="nm">${heEsc(s.name || s.host)}</div>
         <div class="hs">${heEsc(s.host)}</div>
       </div>
       <span class="b">${HE_LOCKS[s.type].badge}</span>`;
    const del = document.createElement("button");
    del.className = "btn btn-danger small";
    del.textContent = "Remove";
    del.addEventListener("click", async () => {
      const left = (await heGetSites()).filter((x) => x.id !== s.id);
      await heSetSites(left);
      render();
    });
    row.appendChild(del);
    card.appendChild(row);
  });
}

async function saveNewSite() {
  const err = document.getElementById("suErr");
  err.textContent = "";
  const raw = document.getElementById("suUrl").value;
  const host = heHost(raw);
  if (!host || !host.includes(".")) { err.textContent = "Type a website like poki.com"; return; }
  const name = document.getElementById("suName").value.trim() || host;

  let secret = "";
  if (setupType === "pin") {
    const v = (document.getElementById("suSecret").value || "").trim();
    if (!/^\d{3,8}$/.test(v)) { err.textContent = "PIN must be 3–8 digits."; return; }
    secret = await heHash(v);
  } else if (setupType === "phrase") {
    const v = (document.getElementById("suSecret").value || "").trim();
    if (v.length < 3) { err.textContent = "Phrase needs at least 3 letters."; return; }
    secret = await heHash(v.toLowerCase());
  } else {
    const seq = document.getElementById("secretArea").dataset.seq || "";
    if (seq.split("-").filter(Boolean).length < 3) { err.textContent = "Connect at least 3 dots."; return; }
    secret = await heHash(seq);
  }

  const sites = await heGetSites();
  const existing = sites.find((s) => s.host === host);
  if (existing) { existing.name = name; existing.type = setupType; existing.secret = secret; }
  else sites.push({ id: heUid(), name, host, type: setupType, secret });
  await heSetSites(sites);

  // reset form
  document.getElementById("suUrl").value = "";
  document.getElementById("suName").value = "";
  setupType = "pin";
  renderLockTypes();
  renderSecretArea();
  render();
}

document.getElementById("suSave").addEventListener("click", saveNewSite);
document.getElementById("lockAll").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "lockAll" }, () => {
    const b = document.getElementById("lockAll");
    b.textContent = "✓ All sites re-locked";
    setTimeout(() => (b.textContent = "🦅 Re-lock everything now"), 1500);
  });
});

renderLockTypes();
renderSecretArea();
render();
