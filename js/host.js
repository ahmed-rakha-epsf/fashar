// شاشة المذيع
(function () {
  const ROUNDS = 3;          // عدد الجولات الأساسية
  const WRITE_SEC = 50;      // وقت كتابة الكدبة
  const VOTE_SEC = 30;       // وقت الاختيار
  const Q = window.QUESTIONS;
  const $ = id => document.getElementById(id);
  const stage = $("stage");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleepers = new Set();
  function sleep(ms) { return new Promise(res => { const t = setTimeout(() => { sleepers.delete(o); res(); }, ms); const o = { t, res }; sleepers.add(o); }); }
  function skip() { for (const o of [...sleepers]) { clearTimeout(o.t); sleepers.delete(o); o.res(); } }

  // ---------- الغرفة ----------
  function newCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ"; let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  const params = new URLSearchParams(location.search);
  let room = params.get("room") || localStorage.getItem("fishar_host_room");
  if (!room || params.has("new")) room = newCode();
  localStorage.setItem("fishar_host_room", room);
  if (params.has("new")) history.replaceState(null, "", location.pathname);
  const db = DB.connect(room, true);
  const base = location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "");
  const joinUrl = base + "play.html?room=" + room;
  $("roomLabel").textContent = "كود الغرفة: " + room;
  if (db.mode === "local") $("modeBadge").classList.remove("hidden");
  const alertBox = $("alert");
  const showAlert = html => { alertBox.innerHTML = html; alertBox.classList.remove("hidden"); };
  if (db.mode === "firebase") {
    db.onStatus(ok => { if (ok) alertBox.classList.add("hidden"); else showAlert("🔴 شاشة المذيع مش قادرة توصل لـ Firebase. اتأكد من databaseURL في js/config.js"); });
    db.onError(e => {
      const c = String((e && (e.code || e.message)) || e);
      showAlert("🔴 Firebase رفض الطلب (" + esc(c) + ")" + (/permission/i.test(c) ? " · راجع الـ Rules في Realtime Database (الخطوة 1 رقم 3 في README)" : ""));
    });
  }

  // ---------- الحالة ----------
  let S = null, players = {}, scores = {}, stats = {};
  let lies = {}, votes = {}, options = null;
  let roundSubs = [], subRound = -1, renderedKey = "", ending = false, revealRunning = false;

  db.on("players", v => { const before = Object.keys(players).length; players = v || {}; if (Object.keys(players).length > before && S && S.phase === "lobby") SFX.join(); refresh(); });
  db.on("scores", v => { scores = v || {}; });
  db.on("stats", v => { stats = v || {}; });
  db.on("state", v => {
    if (!v) { db.set("state", { phase: "lobby", round: 0, usedQ: [] }); return; }
    S = v; if (!S.usedQ) S.usedQ = [];
    subscribeRound(S.round);
    refresh();
  });

  function subscribeRound(r) {
    if (r === subRound) return;
    roundSubs.forEach(u => u()); roundSubs = []; subRound = r;
    lies = {}; votes = {}; options = null;
    roundSubs.push(db.on(`r${r}/lies`, v => { lies = v || {}; onLies(); refresh(); }));
    roundSubs.push(db.on(`r${r}/votes`, v => { votes = v || {}; refresh(); checkAllDone(); }));
    roundSubs.push(db.on(`r${r}/options`, v => { options = v; refresh(); }));
  }

  const name = pid => (players[pid] && players[pid].name) || "؟";
  const pids = () => Object.keys(players).sort((a, b) => (players[a].joined || 0) - (players[b].joined || 0));
  const onlinePids = () => pids().filter(p => players[p].online !== false);
  const mult = r => (r >= 2 ? 2 : 1);
  const curQ = () => Q[S.qIndex];
  function nextQ(used) { for (let i = 0; i < Q.length; i++) if (!used.includes(i)) return i; return Math.floor(Math.random() * Q.length); }
  function promptHTML(p) { return esc(p).replace("____", '<span class="blank">؟</span>'); }
  function metaKey(r) { return `fishar_meta_${room}_${r}`; }

  // ---------- الانتقالات ----------
  async function startIntro(r) {
    const used = S.usedQ || [];
    const qi = nextQ(used);
    let leaders = [];
    if (r === 1) {
      const max = Math.max(0, ...pids().map(p => scores[p] || 0));
      if (max > 0) leaders = pids().filter(p => (scores[p] || 0) === max);
    }
    await db.remove(`r${r}`);
    await db.set("state", { phase: "intro", round: r, qIndex: qi, usedQ: used.concat([qi]), leaders, prompt: Q[qi].prompt, hint: Q[qi].hint, mult: mult(r) });
  }
  async function startWrite() {
    ending = false;
    await db.update({ "state/phase": "write", "state/endsAt": db.now() + WRITE_SEC * 1000 });
  }
  async function swapQuestion() {
    if (!S || !["intro", "write"].includes(S.phase)) return;
    const qi = nextQ(S.usedQ || []);
    const upd = { "state/qIndex": qi, "state/usedQ": (S.usedQ || []).concat([qi]), "state/prompt": Q[qi].prompt, "state/hint": Q[qi].hint };
    upd[`r${S.round}/lies`] = null; upd[`r${S.round}/rej`] = null;
    if (S.phase === "write") upd["state/endsAt"] = db.now() + WRITE_SEC * 1000;
    renderedKey = "";
    await db.update(upd);
  }

  function onLies() {
    if (!S || S.phase !== "write") return;
    const q = curQ(); const upd = {};
    for (const pid in lies) {
      const l = lies[pid];
      if (l && l.final && TXT.isTruth(l.text, q)) { upd[`r${S.round}/rej/${pid}`] = db.now(); upd[`r${S.round}/lies/${pid}/final`] = false; }
    }
    if (Object.keys(upd).length) db.update(upd); else checkAllDone();
  }

  function checkAllDone() {
    if (!S || ending) return;
    const on = onlinePids(); if (!on.length) return;
    if (S.phase === "write" && on.every(p => lies[p] && lies[p].final)) endWrite();
    if (S.phase === "vote" && options && on.every(p => votes[p] !== undefined && votes[p] !== null)) endVote();
  }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  async function endWrite() {
    if (ending || S.phase !== "write") return; ending = true;
    const r = S.round, q = curQ();
    const groups = new Map();
    for (const pid of Object.keys(lies)) {
      const t = TXT.clean(lies[pid] && lies[pid].text);
      if (!t || TXT.isTruth(t, q)) continue;
      const k = TXT.normalize(t); if (!k) continue;
      if (!groups.has(k)) groups.set(k, { t, a: [] });
      groups.get(k).a.push(pid);
    }
    let list = [...groups.values()];
    const bots = [];
    for (const d of q.decoys || []) {
      if (list.length >= 3) break;
      if (groups.has(TXT.normalize(d))) continue;
      list.push({ t: d, a: [], bot: true });
    }
    list.push({ t: q.truth, a: [], truth: true });
    shuffle(list);
    const ti = list.findIndex(o => o.truth);
    list.forEach((o, i) => { if (o.bot) bots.push(i); });
    localStorage.setItem(metaKey(r), JSON.stringify({ ti, bots }));
    const clean = list.map(o => ({ t: o.t, a: o.a.length ? o.a : ["-"] }));
    await db.update({ [`r${r}/options`]: clean, "state/phase": "vote", "state/endsAt": db.now() + VOTE_SEC * 1000 });
    ending = false;
  }

  function readMeta(r) {
    try { const m = JSON.parse(localStorage.getItem(metaKey(r))); if (m) return m; } catch (e) {}
    const q = curQ(); const ti = (options || []).findIndex(o => TXT.isTruth(o.t, q));
    return { ti, bots: [] };
  }

  async function endVote() {
    if (ending || S.phase !== "vote") return; ending = true;
    const r = S.round, m = mult(r), { ti } = readMeta(r);
    const gain = {}, st = JSON.parse(JSON.stringify(stats || {}));
    const add = (p, n) => { gain[p] = (gain[p] || 0) + n; };
    const bump = (p, k) => { st[p] = st[p] || { fooled: 0, found: 0, gullible: 0 }; st[p][k] = (st[p][k] || 0) + 1; };
    const leaders = (r === 1 && S.leaders) ? S.leaders : [];
    for (const v of Object.keys(votes)) {
      const c = votes[v]; const o = options[c]; if (!o) continue;
      if (c === ti) { add(v, 2 * m); bump(v, "found"); continue; }
      bump(v, "gullible");
      for (const a of o.a || []) {
        if (a === "-" || a === v) continue;
        add(a, 1 * m); bump(a, "fooled");
        if (leaders.includes(v)) add(a, 3);
      }
    }
    const upd = { "state/phase": "reveal", [`r${r}/gain`]: gain, stats: st };
    for (const p of pids()) upd[`scores/${p}`] = (scores[p] || 0) + (gain[p] || 0);
    await db.update(upd);
    ending = false;
  }

  async function toScores() { await db.update({ "state/phase": "scores" }); }
  async function toFinal() {
    const ps = pids();
    const best = (fn) => { const max = Math.max(0, ...ps.map(fn)); return max > 0 ? { who: ps.filter(p => fn(p) === max), max } : null; };
    const s = p => scores[p] || 0, f = p => (stats[p] || {}).fooled || 0, d = p => (stats[p] || {}).found || 0, g = p => (stats[p] || {}).gullible || 0;
    const awards = [];
    const add = (key, em, title, res, unit) => { if (res) awards.push({ key, em, title, who: res.who, v: res.max + " " + unit }); };
    add("liar", "😈", "أكبر فشّار في التيم", best(f), "واحد صدّقوه");
    add("detector", "🕵️", "كاشف الكدب", best(d), "مرة لقى الحقيقة");
    add("kind", "🤍", "أطيب قلب في التيم", best(g), "مرة صدّق");
    add("champ", "🏆", "بطل الفشّار", best(s), "نقطة");
    await db.update({ awards, "state/phase": "final" });
  }
  async function newGame() {
    skip();
    if (db.mode === "local" && db.wipe) db.wipe();
    location.href = location.pathname + "?new=1";
  }

  // ---------- العرض ----------
  function refresh() {
    if (!S) return;
    const key = [S.phase, S.round, S.qIndex, S.phase === "vote" ? (options || []).length : ""].join("|");
    if (key !== renderedKey) { renderedKey = key; renderPhase(); }
    updateDynamic();
    updateControls();
  }

  function updateControls() {
    const ph = S.phase;
    $("btnPlus").classList.toggle("hidden", !["write", "vote"].includes(ph));
    $("btnEnd").classList.toggle("hidden", !["write", "vote"].includes(ph));
    $("btnSwap").classList.toggle("hidden", !["intro", "write"].includes(ph));
  }

  function qrSVG(text) {
    const qr = new QRLib.QRCode(-1, QRLib.ECL.M); qr.addData(text); qr.make();
    const n = qr.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#17112b"/></svg>`;
  }

  function roundBadge() {
    const r = S.round;
    const label = r === 1 ? " · 👑 اصطاد المتصدر" : r >= 2 ? " · النقط ×2 🔥" : "";
    return `<div class="round-badge">الجولة <b>${r + 1}</b>${r < ROUNDS ? " من " + ROUNDS : " (زيادة)"}${label}</div>`;
  }

  function renderPhase() {
    skip();
    const ph = S.phase;
    if (ph === "lobby") {
      stage.innerHTML = `
        <div class="lobby">
          <div class="qrbox">${qrSVG(joinUrl)}</div>
          <div>
            <h1>الفشّار 🤥</h1>
            <div class="tag">امسح الكود بموبايلك أو افتح اللينك… واكتب اسمك</div>
            <div class="link">${esc(joinUrl)}</div>
            ${db.mode === "local" ? `<div class="localnote">⚠️ اللعبة شغالة في <b>وضع التجربة</b>: اللاعبين لازم يفتحوا اللينك في تابات تانية <b>في نفس المتصفح ده</b>. الموبايلات مش هتظهر هنا غير بعد ما تحط إعدادات Firebase في js/config.js وترفع على GitHub.</div>` : ""}
            <div class="names" id="names"></div>
            <button class="btn" id="btnStart" style="font-size:26px;padding:16px 40px">يلا نبدأ 🚀</button>
          </div>
        </div>`;
      $("btnStart").onclick = () => { SFX.unlock(); startIntro(0); };
    } else if (ph === "intro") {
      const r = S.round;
      let big, sub, rule = "";
      if (r === 0) { big = "الجولة الأولى"; sub = "هقولكم معلومة غريبة… بس حقيقية 100%"; rule = "كل واحد يكتب كدبة تبان حقيقية · لو لقيت الحقيقة = 2 نقطة · كل واحد يصدّق كدبتك = نقطة"; }
      else if (r === 1) {
        big = "👑 اصطاد المتصدر";
        const ls = (S.leaders || []).map(name);
        sub = ls.length ? `المتصدر دلوقتي: <span class="leaders">${ls.map(esc).join(" و ")}</span>` : "لسه مفيش متصدر… العبوا عادي";
        rule = ls.length ? "اللي يضحك على المتصدر بكدبته ياخد +3 بونص 🎯" : "";
      } else if (r === 2) { big = "الجولة الأخيرة 🔥"; sub = "كل النقط ×2… أي حد لسه يقدر يكسب"; }
      else { big = "جولة زيادة 🔥"; sub = "والنقط لسه ×2"; }
      stage.innerHTML = `<div class="intro pop"><div class="big">${big}</div><div class="sub">${sub}</div><div class="rule">${rule}</div>
        <div style="margin-top:40px"><button class="btn" id="btnGo" style="font-size:26px;padding:16px 40px">اكتبوا كدبكم ✍️</button></div></div>`;
      $("btnGo").onclick = () => { SFX.unlock(); startWrite(); };
    } else if (ph === "write") {
      stage.innerHTML = `${roundBadge()}
        <div class="prompt pop">${promptHTML(S.prompt)}</div>
        <div class="hint">(${esc(S.hint)}) · اكتبوا كدبة مقنعة على موبايلاتكم</div>
        <div class="timerwrap"><div class="timerbar" id="tbar"><i></i></div><div class="num" id="tnum"></div></div>
        <div class="statusrow" id="status"></div>`;
    } else if (ph === "vote") {
      const opts = options || [];
      stage.innerHTML = `${roundBadge()}
        <div class="prompt sm">${promptHTML(S.prompt)}</div>
        <div class="opts ${opts.length > 8 ? "many" : ""}">${opts.map((o, i) => `<div class="opt" style="animation-delay:${i * 60}ms"><span class="n">${i + 1}</span>${esc(o.t)}</div>`).join("")}</div>
        <div class="timerwrap"><div class="timerbar" id="tbar"><i></i></div><div class="num" id="tnum"></div></div>
        <div class="statusrow" id="status"></div>`;
    } else if (ph === "reveal") {
      runReveal();
    } else if (ph === "scores") {
      renderScores();
    } else if (ph === "final") {
      runFinal();
    }
  }

  let lastTick = -1;
  function updateDynamic() {
    if (!S) return;
    if (S.phase === "lobby" && $("names")) {
      const ps = pids();
      $("names").innerHTML = ps.length ? ps.map(p => `<span class="chip ${players[p].online === false ? "off" : ""}">${esc(name(p))}</span>`).join("") : `<span class="pmuted" style="font-size:22px;color:var(--muted)">مستنيين أول واحد يدخل… 👀</span>`;
      $("btnStart").disabled = ps.length < 2;
    }
    if ((S.phase === "write" || S.phase === "vote") && $("status")) {
      const done = p => S.phase === "write" ? !!(lies[p] && lies[p].final) : (votes[p] !== undefined && votes[p] !== null);
      $("status").innerHTML = pids().map(p => `<span class="chip ${done(p) ? "done" : ""} ${players[p].online === false ? "off" : ""}">${esc(name(p))}</span>`).join("");
    }
  }

  setInterval(() => {
    if (!S || !["write", "vote"].includes(S.phase) || !S.endsAt) return;
    const left = Math.max(0, S.endsAt - db.now());
    const total = (S.phase === "write" ? WRITE_SEC : VOTE_SEC) * 1000;
    const sec = Math.ceil(left / 1000);
    const bar = $("tbar"), num = $("tnum");
    if (bar) { bar.firstElementChild.style.width = Math.min(100, (left / total) * 100) + "%"; bar.classList.toggle("hurry", sec <= 10); }
    if (num) { num.textContent = sec; num.classList.toggle("hurry", sec <= 5 && sec > 0); }
    if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; SFX.tick(); }
    if (left <= 0) { if (S.phase === "write") endWrite(); else endVote(); }
  }, 250);

  // ---------- الكشف ----------
  async function runReveal() {
    if (revealRunning) return; revealRunning = true;
    const myKey = renderedKey;
    const alive = () => renderedKey === myKey;
    try {
      let tries = 0;
      while ((!options || !Object.keys(votes).length && tries < 6) && tries < 20) { await sleep(150); tries++; }
      const r = S.round, m = mult(r), { ti, bots } = readMeta(r);
      const opts = (options || []).map((o, i) => ({ i, t: o.t, a: (o.a || []).filter(x => x !== "-"), voters: Object.keys(votes).filter(v => votes[v] === i) }));
      const leaders = r === 1 ? (S.leaders || []) : [];
      const liesWithVotes = opts.filter(o => o.i !== ti && o.voters.length).sort((a, b) => a.voters.length - b.voters.length);
      const nobody = opts.filter(o => o.i !== ti && !o.voters.length && o.a.length);
      const truth = opts[ti];

      stage.innerHTML = `${roundBadge()}<div class="prompt sm">${promptHTML(S.prompt)}</div><div class="reveal" id="rv" style="margin-top:26px"></div>
        <div class="controls-bottom"><button class="btn ghost small" id="btnSkip">التالي ⏭</button></div>`;
      $("btnSkip").onclick = skip;
      const rv = $("rv");

      for (const o of liesWithVotes) {
        if (!alive()) return;
        const isBot = bots.includes(o.i) || !o.a.length;
        rv.innerHTML = `<div class="rcard" id="card"><div class="label">مين صدّق دي؟ 🤔</div><div class="lie">${esc(o.t)}</div>
          <div class="voters" id="vs"></div><div class="count" id="cnt"></div><div id="stp"></div><div class="hunt" id="hunt"></div></div>`;
        SFX.pop(); await sleep(1400);
        for (const v of o.voters) { if (!alive()) return; $("vs").insertAdjacentHTML("beforeend", `<span class="chip">${esc(name(v))}</span>`); SFX.voter(); await sleep(380); }
        $("cnt").textContent = o.voters.length === 1 ? "واحد بس صدّقها 😅" : `${o.voters.length} صدّقوها! 😱`;
        await sleep(1100); if (!alive()) return;
        if (isBot) {
          $("stp").innerHTML = `<div class="stamp bot">🤖 دي كدبة جاهزة!</div>`;
        } else {
          const hunters = o.voters.filter(v => leaders.includes(v));
          const pts = o.voters.length * m + hunters.length * 3;
          $("stp").innerHTML = `<div class="stamp">😈 كتبها ${o.a.map(a => esc(name(a))).join(" و ")} +${pts}</div>`;
          if (hunters.length) { $("hunt").innerHTML = `🎯 المتصدر ${hunters.map(h => esc(name(h))).join(" و ")} وقع في الفخ! +3`; $("card").classList.add("hunt-hit"); }
        }
        SFX.stamp();
        if (o.voters.length >= 3 && !isBot) { $("card").classList.add("fire"); SFX.laugh(); }
        await sleep(2600);
      }
      if (!alive()) return;
      if (nobody.length) {
        rv.innerHTML = `<div class="rcard"><div class="label">ودول محدش صدّقهم 😅</div>
          <div class="nobody">${nobody.map(o => `<div class="item">${esc(o.t)}<small>${o.a.map(a => esc(name(a))).join(" و ")}</small></div>`).join("")}</div></div>`;
        SFX.pop(); await sleep(3800);
      }
      if (!alive()) return;
      rv.innerHTML = `<div class="rcard"><div class="drum">والحقيقة يا جماعة… 🥁</div></div>`;
      SFX.drum(); await sleep(1800);
      if (!alive() || !truth) return;
      const finders = truth.voters;
      rv.innerHTML = `<div class="rcard truth"><div class="label">✅ الحقيقة</div><div class="lie">${esc(truth.t)}</div>
        <div class="voters">${finders.map(v => `<span class="chip done">${esc(name(v))}</span>`).join("")}</div>
        <div class="count">${finders.length ? `اللي لقوها: +${2 * m} لكل واحد` : "ولا حد لقاها! 😂 الفشّارين كسبوا"}</div></div>`;
      SFX.ding();
      $("btnSkip").outerHTML = `<button class="btn" id="btnBoard" style="font-size:22px">الترتيب 🏆</button>`;
      $("btnBoard").onclick = toScores;
    } finally { revealRunning = false; }
  }

  function renderScores() {
    const r = S.round;
    db.get(`r${r}/gain`).then(gain => {
      gain = gain || {};
      const ps = pids().sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
      const top = scores[ps[0]] || 0;
      const lastMain = r >= ROUNDS - 1;
      stage.innerHTML = `${roundBadge()}
        <div class="board ${ps.length > 8 ? "compact" : ""}">${ps.map((p, i) => `
          <div class="brow ${(scores[p] || 0) === top && top > 0 ? "first" : ""}" style="animation-delay:${i * 70}ms">
            <div class="rank">${(scores[p] || 0) === top && top > 0 ? "👑" : i + 1}</div>
            <div class="nm">${esc(name(p))}</div>
            <div class="gain">${gain[p] ? "+" + gain[p] : ""}</div>
            <div class="pts">${scores[p] || 0}</div>
          </div>`).join("")}</div>
        <div style="margin-top:26px;display:flex;gap:14px">
          ${lastMain ? `<button class="btn ghost" id="btnExtra">جولة زيادة 🔁</button><button class="btn" id="btnFinal" style="font-size:24px">النتيجة النهائية 🏆</button>`
                     : `<button class="btn" id="btnNext" style="font-size:24px">الجولة الجاية ⏭</button>`}
        </div>`;
      if ($("btnNext")) $("btnNext").onclick = () => startIntro(r + 1);
      if ($("btnExtra")) $("btnExtra").onclick = () => startIntro(r + 1);
      if ($("btnFinal")) $("btnFinal").onclick = toFinal;
    });
  }

  async function runFinal() {
    const myKey = renderedKey;
    const awards = (await db.get("awards")) || [];
    stage.innerHTML = `<div class="awards" id="aw"></div><div class="controls-bottom"><button class="btn ghost small" id="btnSkip2">التالي ⏭</button></div>`;
    $("btnSkip2").onclick = skip;
    const aw = $("aw");
    for (const a of awards) {
      if (renderedKey !== myKey) return;
      const champ = a.key === "champ";
      if (champ) { aw.insertAdjacentHTML("beforeend", `<div class="award champ"><div class="drum">والبطل… 🥁</div></div>`); SFX.drum(); await sleep(1900); aw.lastElementChild.remove(); }
      aw.insertAdjacentHTML("beforeend", `<div class="award ${champ ? "champ" : ""}"><div class="em">${a.em}</div><div class="t">${esc(a.title)}</div>
        <div class="w">${(a.who || []).map(p => esc(name(p))).join(" و ")}</div><div class="v">${esc(a.v)}</div></div>`);
      champ ? SFX.fanfare() : SFX.stamp();
      await sleep(champ ? 500 : 2200);
    }
    const b = $("btnSkip2"); if (b) b.remove();
  }

  // ---------- الأزرار ----------
  $("btnPlus").onclick = () => { if (S && S.endsAt) db.update({ "state/endsAt": Math.max(S.endsAt, db.now()) + 15000 }); };
  $("btnEnd").onclick = () => { if (!S) return; if (S.phase === "write") endWrite(); else if (S.phase === "vote") endVote(); };
  $("btnSwap").onclick = swapQuestion;
  $("btnMute").onclick = () => { SFX.setMuted(!SFX.isMuted()); $("btnMute").textContent = SFX.isMuted() ? "🔇" : "🔊"; };
  let newArmed = null;
  $("btnNew").onclick = () => {
    if (newArmed) { clearTimeout(newArmed); newGame(); return; }
    $("btnNew").textContent = "متأكد؟ دوس تاني";
    newArmed = setTimeout(() => { newArmed = null; $("btnNew").textContent = "🆕"; }, 3000);
  };
  document.addEventListener("keydown", e => { if (e.key === "ArrowLeft" || e.key === " ") { if (e.target.tagName !== "INPUT") { e.preventDefault(); skip(); } } });
  document.addEventListener("click", () => SFX.unlock(), { once: true });

  window.__host = { get S() { return S; }, room, joinUrl };
})();
