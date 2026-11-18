// أدوات عرض مشتركة بين شاشة المذيع والموبايل: أفاتار، شيبس، كونفيتي
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EMO = ["🦊", "🐸", "🐼", "🐵", "🦁", "🐯", "🐨", "🐷", "🐙", "🦄", "🐔", "🐢", "🦉", "🐝", "🐳", "🦖", "🐰", "🐧", "🦩", "🐻"];
  const COL = ["#ff3d7f", "#36d6ff", "#ffd23f", "#2ee59d", "#b46bff", "#ff8a3d", "#5d7bff", "#ff5c5c", "#22c7b8", "#f06bd8"];

  // ترتيب الدخول ثابت، فكل لاعب ليه نفس الأفاتار على الشاشة والموبايل
  function order(players) {
    return Object.keys(players || {}).sort((a, b) => ((players[a] || {}).joined || 0) - ((players[b] || {}).joined || 0));
  }
  function avatar(players, pid) {
    const i = Math.max(0, order(players).indexOf(pid));
    return { e: EMO[i % EMO.length], c: COL[i % COL.length] };
  }
  function nameOf(players, pid) { return (players && players[pid] && players[pid].name) || "؟"; }
  function chip(players, pid, cls, extra) {
    const a = avatar(players, pid);
    return `<span class="chip ${cls || ""}" style="--c:${a.c}"><i class="av">${a.e}</i><b>${esc(nameOf(players, pid))}</b>${extra || ""}</span>`;
  }
  function names(players, list) {
    const n = (list || []).map(p => esc(nameOf(players, p)));
    if (n.length <= 1) return n.join("");
    return n.slice(0, -1).join("، ") + " و" + n[n.length - 1];
  }

  // ---------- كونفيتي ----------
  let cv = null, cx = null, parts = [], raf = 0;
  function confetti(n, opts) {
    opts = opts || {};
    if (!cv) {
      cv = document.createElement("canvas"); cv.className = "confetti";
      document.body.appendChild(cv); cx = cv.getContext("2d");
    }
    const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const cols = opts.colors || ["#ffd23f", "#ff3d7f", "#36d6ff", "#2ee59d", "#ffffff", "#b46bff"];
    for (let i = 0; i < (n || 160); i++) {
      const fromSide = opts.sides;
      parts.push({
        x: fromSide ? (i % 2 ? -10 : W + 10) : Math.random() * W,
        y: fromSide ? H * (0.4 + Math.random() * 0.4) : -20 - Math.random() * H * 0.4,
        vx: fromSide ? (i % 2 ? 1 : -1) * (6 + Math.random() * 9) : (Math.random() - 0.5) * 4,
        vy: fromSide ? -(8 + Math.random() * 10) : 2 + Math.random() * 4,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 8 + Math.random() * 10, h: 5 + Math.random() * 7,
        c: cols[i % cols.length], life: 0
      });
    }
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step() {
    const W = cv.width, H = cv.height;
    cx.clearRect(0, 0, W, H);
    parts = parts.filter(p => p.y < H + 40 && p.life < 420);
    for (const p of parts) {
      p.life++; p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life / 6))); cx.restore();
    }
    raf = parts.length ? requestAnimationFrame(step) : 0;
    if (!raf) cx.clearRect(0, 0, W, H);
  }

  // الأرقام بعلامة + لازم تتكتب LTR وإلا تظهر «2+» في الصفحة العربي
  const plus = n => `<bdi class="ltr" dir="ltr">+${n}</bdi>`;

  window.UI = { plus, esc, avatar, nameOf, chip, names, order, confetti };
})();
