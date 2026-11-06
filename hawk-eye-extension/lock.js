// the1min — lock screen. Shown by the background worker before a locked site loads.

document.getElementById("crest").innerHTML = HE_EYE_SVG;

const params = new URLSearchParams(location.search);
const sid = params.get("sid") || "";
const target = params.get("target") || "";

document.getElementById("backBtn").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else location.href = "about:blank";
});

let site = null;
let fails = 0;
let lockedUntil = 0;

init();

async function init() {
  const sites = await heGetSites();
  site = sites.find((s) => s.id === sid);
  if (!site) {
    // Lock was removed while this screen was open — just let them through.
    if (target) location.replace(target);
    return;
  }
  document.getElementById("siteName").innerHTML =
    `${heEsc(site.name || site.host)} <span class="host">(${heEsc(site.host)})</span>`;
  const lk = HE_LOCKS[site.type];
  document.getElementById("askLine").textContent = `${lk.icon} Enter your ${lk.label.toLowerCase()} to get in`;
  renderChallenge();
}

function renderChallenge() {
  if (Date.now() < lockedUntil) return renderLockout();
  const area = document.getElementById("chArea");
  area.innerHTML = "";
  document.getElementById("chErr").textContent = "";
  if (site.type === "pin") buildPin(area);
  else if (site.type === "phrase") buildPhrase(area);
  else buildPattern(area);
}

function renderLockout() {
  const area = document.getElementById("chArea");
  const secs = Math.ceil((lockedUntil - Date.now()) / 1000);
  area.innerHTML = `<div class="lockout">🔒 Too many wrong tries. the1min is watching.<br>Try again in <b id="loc">${secs}</b>s.</div>`;
  const t = setInterval(() => {
    const left = Math.ceil((lockedUntil - Date.now()) / 1000);
    const c = document.getElementById("loc");
    if (!c) return clearInterval(t);
    if (left <= 0) { clearInterval(t); fails = 0; renderChallenge(); }
    else c.textContent = left;
  }, 500);
}

function wrong(msg, reset) {
  fails++;
  document.getElementById("chErr").textContent = msg;
  shake();
  if (fails >= 3) { lockedUntil = Date.now() + 30000; fails = 0; renderLockout(); }
  else if (reset) reset();
}

function shake() {
  const box = document.querySelector(".lockbox");
  box.animate?.(
    [{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
    { duration: 180 }
  );
}

function pass() {
  chrome.runtime.sendMessage({ type: "unlock", host: site.host }, () => {
    document.getElementById("chArea").innerHTML =
      `<div class="granted"><div class="seal">✓</div>
         <div style="color:var(--ok);font-weight:700;font-family:'Chakra Petch',sans-serif;letter-spacing:.06em">ACCESS GRANTED</div>
         <div class="hint">Opening ${heEsc(site.host)} …</div></div>`;
    document.getElementById("askLine").textContent = "";
    setTimeout(() => location.replace(target || "https://" + site.host), 650);
  });
}

function buildPin(area) {
  let entry = "";
  area.innerHTML =
    `<div class="pin-dots" id="pd"></div>
     <div class="keypad" id="kp">
       ${[1,2,3,4,5,6,7,8,9].map((n) => `<button class="key" data-n="${n}">${n}</button>`).join("")}
       <button class="key fn" data-a="clear">clear</button>
       <button class="key" data-n="0">0</button>
       <button class="key fn" data-a="ok">enter</button>
     </div>`;
  const paint = () => {
    const pd = document.getElementById("pd");
    pd.innerHTML = entry ? entry.split("").map(() => '<i class="on"></i>').join("")
                         : '<i></i><i></i><i></i><i></i>';
  };
  paint();
  document.getElementById("kp").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.n != null) { if (entry.length < 8) { entry += b.dataset.n; paint(); } }
    else if (b.dataset.a === "clear") { entry = ""; paint(); }
    else if (b.dataset.a === "ok") {
      if (entry.length < 3) { document.getElementById("chErr").textContent = "Enter your PIN."; return; }
      const h = await heHash(entry);
      if (h === site.secret) pass();
      else wrong("Wrong PIN.", () => { entry = ""; paint(); });
    }
  });
}

function buildPhrase(area) {
  area.innerHTML =
    `<input class="inp" id="phIn" placeholder="type the secret phrase" autocomplete="off">
     <button class="btn btn-primary block" id="phGo" style="margin-top:12px">Unlock</button>`;
  const go = async () => {
    const v = (document.getElementById("phIn").value || "").trim().toLowerCase();
    if (!v) { document.getElementById("chErr").textContent = "Type the phrase."; return; }
    const h = await heHash(v);
    if (h === site.secret) pass();
    else wrong("That's not the phrase.");
  };
  document.getElementById("phGo").addEventListener("click", go);
  document.getElementById("phIn").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  setTimeout(() => document.getElementById("phIn")?.focus(), 60);
}

function buildPattern(area) {
  const box = heBuildPattern((seq) => { area.dataset.seq = seq; });
  area.appendChild(box);
  const go = document.createElement("button");
  go.className = "btn btn-primary block";
  go.textContent = "Unlock";
  go.style.marginTop = "8px";
  go.addEventListener("click", async () => {
    const seq = area.dataset.seq || "";
    if (seq.split("-").filter(Boolean).length < 3) { document.getElementById("chErr").textContent = "Connect at least 3 dots."; return; }
    const h = await heHash(seq);
    if (h === site.secret) pass();
    else wrong("Pattern doesn't match.", () => {
      area.querySelectorAll(".dot").forEach((d) => d.classList.remove("on"));
      area.querySelector("polyline").setAttribute("points", "");
      area.dataset.seq = "";
    });
  });
  area.appendChild(go);
}
