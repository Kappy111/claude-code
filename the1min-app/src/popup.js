/* The1Min popup renderer */
const BUDDY = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <line class="ant" x1="50" y1="24" x2="50" y2="13"/>
  <circle class="bulb" cx="50" cy="10" r="4.5"/>
  <rect class="head" x="18" y="22" width="64" height="62" rx="16"/>
  <circle class="eye" cx="39" cy="50" r="5"/>
  <circle class="eye" cx="61" cy="50" r="5"/>
  <path class="mouth" d="M 40 68 Q 50 77 60 68"/>
</svg>`;
document.querySelectorAll('.buddy').forEach(b => b.innerHTML = BUDDY);

const views = ['think', 'result', 'nokey', 'noperm', 'error'];
function view(name) {
  views.forEach(v => document.getElementById('v-' + v).classList.toggle('hidden', v !== name));
}

function renderResult(r) {
  document.getElementById('rProblem').textContent = r.problem;
  const ol = document.getElementById('rSteps'); ol.innerHTML = '';
  (r.steps || []).forEach(s => {
    const li = document.createElement('li');
    const sp = document.createElement('span'); sp.textContent = s;
    li.appendChild(sp); ol.appendChild(li);
  });
  document.getElementById('rResource').textContent = r.resource;
  document.getElementById('rPrompt').textContent = r.prompt;
  document.getElementById('rCheer').textContent = '“' + r.cheer + '”';
  view('result');
}

window.the1min.onState((p) => {
  if (p.kind === 'thinking') {
    document.getElementById('thinkNote').textContent =
      p.reason === 'deeper' ? 'Trying a different angle this time.'
      : p.reason === 'manual' ? 'You tapped for help — on it.'
      : 'You went quiet for a minute, so here I am.';
    view('think');
  } else if (p.kind === 'result') {
    renderResult(p.data);
  } else if (p.kind === 'nokey') {
    view('nokey');
  } else if (p.kind === 'noperm') {
    view('noperm');
  } else if (p.kind === 'error') {
    document.getElementById('errMsg').textContent = p.message || 'Something went wrong.';
    view('error');
  }
});

document.getElementById('x').addEventListener('click', () => window.the1min.close());
document.getElementById('permClose').addEventListener('click', () => window.the1min.close());
document.getElementById('done').addEventListener('click', () => window.the1min.close());
document.getElementById('deeper').addEventListener('click', () => window.the1min.deeper());
document.getElementById('toSettings').addEventListener('click', () => window.the1min.openSettings());
document.getElementById('errSettings').addEventListener('click', () => window.the1min.openSettings());
document.getElementById('errRetry').addEventListener('click', () => window.the1min.deeper());

document.getElementById('copyBtn').addEventListener('click', function () {
  const txt = document.getElementById('rPrompt').textContent;
  const btn = this;
  const done = () => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1400); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(select);
  } else select();
  function select() {
    const r = document.createRange(); r.selectNodeContents(document.getElementById('rPrompt'));
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    btn.textContent = 'Select + copy'; setTimeout(() => btn.textContent = 'Copy', 1800);
  }
});
