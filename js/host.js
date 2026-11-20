// شاشة المذيع (دي اللي بتتعمل شير سكرين)
(function () {
  const WRITE_SEC = 50;      // وقت كتابة الكدبة
  const VOTE_SEC = 30;       // وقت الاختيار
  const PTS_TRUTH = 1;       // لقيت الحقيقة
  const PTS_FOOL = 2;        // كل واحد صدّق كدبتك
  const PTS_HUNT = 3;        // بونص لو المتصدر صدّق كدبتك
  const Q = window.QUESTIONS;
  const $ = id => document.getElementById(id);
  const stage = $("stage");
  const esc = UI.esc, plus = UI.plus;
  const sleepers = new Set();
  function sleep(ms) { return new Promise(res => { const t = setTimeout(() => { sleepers.delete(o); res(); }, ms); const o = { t, res }; sleepers.add(o); }); }
  function skip() { for (const o of [...sleepers]) { clearTimeout(o.t); sleepers.delete(o); o.res(); } }

  // ---------- الغرفة ----------
  function newCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ"; let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  const params = new URLSearchParams(location.search);
  let room = params.get("room") || localStorage.getItem("fishar_host_room");
  if (!room || params.has("new")) room = newCode();
  localStorage.setItem("fishar_host_room", room);
  if (params.has("new")) history.replaceState(null, "", location.pathname + (DB.FORCE_LOCAL ? "?local=1" : ""));
  const db = DB.connect(room, true);
  const base = location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "");
  const joinUrl = base + "play.html?room=" + room + (DB.FORCE_LOCAL ? "&local=1" : "");
  $("roomLabel").innerHTML = `كود الغرفة <b>${room}</b>`;
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
  let lies = {}, votes = {}, options = null, script = null;
  let roundSubs = [], subRound = -1, renderedKey = "", ending = false;

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
    lies = {}; votes = {}; options = null; script = null;
    roundSubs.push(db.on(`r${r}/lies`, v => { lies = v || {}; onLies(); refresh(); }));
    roundSubs.push(db.on(`r${r}/votes`, v => { votes = v || {}; refresh(); checkAllDone(); }));
    roundSubs.push(db.on(`r${r}/options`, v => { options = v; refresh(); }));
    roundSubs.push(db.on(`r${r}/script`, v => { script = v; refresh(); }));
  }

  const name = pid => UI.nameOf(players, pid);
  const chip = (p, cls, extra) => UI.chip(players, p, cls, extra);
  const namesOf = list => UI.names(players, list);
  const pids = () => UI.order(players);
  const onlinePids = () => pids().filter(p => players[p].online !== false);
  const mult = () => (S && S.mult) || 1;
  const huntOn = () => !!(S && S.hunt && (S.leaders || []).length);
  const curQ = () => Q[S.qIndex] || { prompt: S.prompt, truth: "" };
  // اختيار الأسئلة وترتيبها من نافذة «⚙️ الأسئلة» (js/qsettings.js)
  QSET.init(() => (S && S.usedQ) || []);
  QSET.onClose = () => { if (S && S.phase === "lobby") renderPhase(); };
  const nextQ = used => QSET.nextQ(used);
  function promptHTML(p, fill) {
    return esc(p).replace("____", fill != null ? `<span class="blank filled">${esc(fill)}</span>` : '<span class="blank dots">……</span>');
  }
  function metaKey(r) { return `fishar_meta_${room}_${r}`; }

  // ---------- الانتقالات ----------
  async function startIntro(r, last) {
    const used = S.usedQ || [];
    const qi = nextQ(used);
    let leaders = [];
    if (r >= 1) {
      const max = Math.max(0, ...pids().map(p => scores[p] || 0));
      if (max > 0) leaders = pids().filter(p => (scores[p] || 0) === max);
    }
    await db.remove(`r${r}`);
    await db.set("state", { phase: "intro", round: r, qIndex: qi, usedQ: used.concat([qi]), leaders, prompt: Q[qi].prompt, mult: last ? 2 : 1, hunt: leaders.length > 0, last: !!last, lastTi: S.lastTi === undefined ? -1 : S.lastTi });
  }
  async function startWrite() {
    if (!S || S.phase !== "intro") return;
    ending = false;
    await db.update({ "state/phase": "write", "state/endsAt": db.now() + WRITE_SEC * 1000, "state/total": WRITE_SEC * 1000 });
  }
  async function swapQuestion() {
    if (!S || !["intro", "write"].includes(S.phase)) return;
    const qi = nextQ(S.usedQ || []);
    const upd = { "state/qIndex": qi, "state/usedQ": (S.usedQ || []).concat([qi]), "state/prompt": Q[qi].prompt };
    upd[`r${S.round}/lies`] = null; upd[`r${S.round}/rej`] = null;
    if (S.phase === "write") { upd["state/endsAt"] = db.now() + WRITE_SEC * 1000; upd["state/total"] = WRITE_SEC * 1000; }
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
    // الحقيقة مكانها عشوائي، ومتجيش في نفس الرقم بتاع السؤال اللي فات (عشان محدش يلاحظ نمط)
    let ti = list.findIndex(o => o.truth);
    if (list.length > 2 && ti === S.lastTi) {
      let j; do { j = Math.floor(Math.random() * list.length); } while (j === ti);
      [list[ti], list[j]] = [list[j], list[ti]]; ti = j;
    }
    list.forEach((o, i) => { if (o.bot) bots.push(i); });
    localStorage.setItem(metaKey(r), JSON.stringify({ ti, bots }));
    const clean = list.map(o => ({ t: o.t, a: o.a.length ? o.a : ["-"] }));
    await db.update({ [`r${r}/options`]: clean, "state/lastTi": ti, "state/phase": "vote", "state/endsAt": db.now() + VOTE_SEC * 1000, "state/total": VOTE_SEC * 1000 });
    ending = false;
  }

  function readMeta(r) {
    try { const m = JSON.parse(localStorage.getItem(metaKey(r))); if (m) return m; } catch (e) {}
    const q = curQ(); const ti = (options || []).findIndex(o => TXT.isTruth(o.t, q));
    return { ti, bots: [] };
  }

  const authorsOf = o => ((o && o.a) || []).filter(x => x !== "-");
  const votersOf = i => pids().concat(Object.keys(votes).filter(v => !players[v])).filter(v => votes[v] === i);

  // سيناريو الكشف: كل خطوة بتستنى المذيع يدوس «التالي»
  function buildScript(ti, bots) {
    const opts = (options || []).map((o, i) => ({ i, a: authorsOf(o), v: votersOf(i).length }));
    const sc = [{ k: "intro" }];
    opts.filter(o => o.i !== ti && o.v).sort((a, b) => a.v - b.v || a.i - b.i).forEach(o => {
      const bot = bots.includes(o.i) || !o.a.length;
      sc.push({ k: "lie", o: o.i, s: 0, bot }, { k: "lie", o: o.i, s: 1, bot });
    });
    if (opts.some(o => o.i !== ti && !o.v && o.a.length)) sc.push({ k: "nobody" });
    if (ti >= 0) sc.push({ k: "drum" }, { k: "truth", o: ti });
    return sc;
  }

  async function endVote() {
    if (ending || S.phase !== "vote") return; ending = true;
    const r = S.round, m = mult(), { ti, bots } = readMeta(r);
    const gain = {}, st = JSON.parse(JSON.stringify(stats || {}));
    const add = (p, n) => { gain[p] = (gain[p] || 0) + n; };
    const bump = (p, k) => { st[p] = st[p] || { fooled: 0, found: 0, gullible: 0 }; st[p][k] = (st[p][k] || 0) + 1; };
    const leaders = S.hunt ? (S.leaders || []) : [];
    for (const v of Object.keys(votes)) {
      const c = votes[v]; const o = options[c]; if (!o) continue;
      if (c === ti) { add(v, PTS_TRUTH * m); bump(v, "found"); continue; }
      bump(v, "gullible");
      for (const a of o.a || []) {
        if (a === "-" || a === v) continue;
        add(a, PTS_FOOL * m); bump(a, "fooled");
        if (leaders.includes(v)) add(a, PTS_HUNT);
      }
    }
    const upd = { "state/phase": "reveal", "state/rstep": 0, [`r${r}/gain`]: gain, [`r${r}/script`]: buildScript(ti, bots || []), [`r${r}/ti`]: ti, stats: st };
    for (const p of pids()) { upd[`scores/${p}`] = (scores[p] || 0) + (gain[p] || 0); upd[`prev/${p}`] = scores[p] || 0; }
    await db.update(upd);
    ending = false;
  }

  async function toScores() { await db.update({ "state/phase": "scores" }); }
  async function toFinal() {
    const ps = pids();
    const best = (fn) => { const max = Math.max(0, ...ps.map(fn)); return max > 0 ? { who: ps.filter(p => fn(p) === max), max } : null; };
    const s = p => scores[p] || 0, f = p => (stats[p] || {}).fooled || 0, d = p => (stats[p] || {}).found || 0, g = p => (stats[p] || {}).gullible || 0;
    const awards = [];
    const add = (key, em, title, desc, res, unit) => { if (res) awards.push({ key, em, title, desc, who: res.who, v: res.max + " " + unit }); };
    add("liar", "😈", "أكبر فشّار في التيم", "أكتر واحد الناس صدّقت كدبه", best(f), "مرة صدّقوه");
    add("detector", "🕵️", "كاشف الكدب", "أكتر واحد لقى الحقيقة", best(d), "مرة لقى الحقيقة");
    add("kind", "🤍", "أطيب قلب في التيم", "أكتر واحد صدّق كدب زمايله", best(g), "مرة صدّق");
    add("champ", "🏆", "بطل الفشّار", "صاحب أعلى نقط", best(s), "نقطة");
    await db.update({ awards, "state/phase": "final" });
  }
  async function newGame() {
    skip();
    if (db.mode === "local" && db.wipe) db.wipe();
    location.href = location.pathname + "?new=1" + (DB.FORCE_LOCAL ? "&local=1" : "");
  }

  // زرار «التالي» في الكشف
  let lastAdvance = 0;
  function advance() {
    if (!S || S.phase !== "reveal" || !script) return;
    const now = Date.now(); if (now - lastAdvance < 450) return; lastAdvance = now;
    const st = S.rstep || 0;
    if (st < script.length - 1) db.update({ "state/rstep": st + 1 });
  }

  // ---------- العرض ----------
  function refresh() {
    if (!S) return;
    const ph = S.phase;
    const key = [ph, S.round, S.qIndex, ph === "vote" ? (options || []).length : "", ph === "reveal" ? (script ? "s" : "-") + (S.rstep || 0) : ""].join("|");
    if (key !== renderedKey) { renderedKey = key; renderPhase(); }
    updateDynamic();
    updateControls();
  }

  const PHASES = {
    lobby: ["👋", "مستنيين الناس تدخل"], intro: ["📣", "جولة جديدة"], write: ["✍️", "اكتبوا كدبة"],
    vote: ["🕵️", "دوّروا على الحقيقة"], reveal: ["👀", "الكشف"], scores: ["🏆", "الترتيب"], final: ["🎉", "الجوايز"]
  };
  function updateControls() {
    const ph = S.phase;
    $("btnPlus").classList.toggle("hidden", !["write", "vote"].includes(ph));
    $("btnEnd").classList.toggle("hidden", !["write", "vote"].includes(ph));
    $("btnSwap").classList.toggle("hidden", !["intro", "write"].includes(ph));
    const r = S.round, inGame = !["lobby", "final"].includes(ph);
    const roundTxt = inGame ? `السؤال ${r + 1}${S.last ? " · آخر سؤال ×2 🔥" : S.hunt ? " · 👑" : ""}` : "";
    const p = PHASES[ph] || ["", ""];
    const html = (roundTxt ? `<span class="pill round">${roundTxt}</span>` : "") + `<span class="pill phase">${p[0]} ${p[1]}</span>`;
    if ($("phaseInfo").innerHTML !== html) $("phaseInfo").innerHTML = html;
  }

  function qrSVG(text) {
    const qr = new QRLib.QRCode(-1, QRLib.ECL.M); qr.addData(text); qr.make();
    const n = qr.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#1d1533"/></svg>`;
  }

  const ptsLine = m => `<span class="pt"><i>😈</i> كل واحد صدّق كدبتك = <b>${plus(PTS_FOOL * m)}</b></span><span class="pt"><i>✅</i> لقيت الحقيقة = <b>${plus(PTS_TRUTH * m)}</b></span>`;
  const nextBar = (inner) => `<div class="nextbar">${inner}</div>`;
  const keyHint = `<span class="keyhint">أو دوس <kbd>مسافة</kbd></span>`;
  const timerHTML = () => `<div class="ring" id="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="ringfg" cx="60" cy="60" r="52"/></svg><div class="num" id="tnum"></div><div class="lbl">ثانية</div></div>`;

  function renderPhase() {
    skip();
    const ph = S.phase, r = S.round;
    stage.className = "stage ph-" + ph;
    if (ph !== "reveal") revealShell = null;
    if (ph === "lobby") {
      stage.innerHTML = `
        <div class="lobby">
          <div class="joinbox sticker tilt-r">
            <div class="qrbox">${qrSVG(joinUrl)}</div>
            <div class="jl">📱 امسح الكود بكاميرا الموبايل</div>
            <div class="or">أو افتح اللينك ده</div>
            <div class="link">${esc(joinUrl.replace(/^https?:\/\//, ""))}</div>
            <div class="code">كود الغرفة: <b>${room}</b></div>
          </div>
          <div class="lobby-main">
            <h1 class="title">الفشّار <span class="wob">🤥</span></h1>
            <div class="lobbybtns"><button class="btn ghost howbtn" id="btnHow">📖 إزاي نلعب؟</button><button class="btn ghost howbtn" id="btnQs2">⚙️ الأسئلة (${QSET.plan().length})</button></div>
            ${db.mode === "local" ? `<div class="localnote">⚠️ اللعبة شغالة في <b>وضع التجربة</b>: اللاعبين لازم يفتحوا اللينك في تابات تانية <b>في نفس المتصفح ده</b>. الموبايلات مش هتظهر هنا غير بعد ما تحط إعدادات Firebase في js/config.js وترفع على GitHub.</div>` : ""}
            <div class="lp-head">اللي دخلوا: <b id="pcount">0</b></div>
            <div class="names" id="names"></div>
            <div class="startrow"><button class="btn huge" id="btnStart">يلا نبدأ 🚀</button><span class="keyhint" id="startHint"></span></div>
          </div>
        </div>`;
      $("btnStart").onclick = () => { SFX.unlock(); startIntro(0); };
      $("btnHow").onclick = () => HOWTO.open();
      $("btnQs2").onclick = () => QSET.open();
    } else if (ph === "intro") {
      const ls = S.leaders || [], m = mult();
      let title, body;
      if (r === 0) {
        title = "أول سؤال";
        body = `<div class="rule-card">هقولكم معلومة <b>غريبة… بس حقيقية 100%</b> وفيها كلمة ناقصة</div>
          <div class="steps3">
            <div class="s3"><span class="e">✍️</span><b>اكتب كدبة</b><small>إجابة غلط تبان حقيقية</small></div>
            <div class="arrow">←</div>
            <div class="s3"><span class="e">🕵️</span><b>اختار الحقيقة</b><small>وسط كدب زمايلك</small></div>
            <div class="arrow">←</div>
            <div class="s3"><span class="e">🏆</span><b>اجمع نقط</b><small>من الحقيقة ومن اللي صدّقوك</small></div>
          </div>
          <div class="ptsline">${ptsLine(m)}</div>`;
      } else if (!S.last) {
        title = "👑 اصطاد المتصدر";
        body = ls.length
          ? `<div class="rule-card">المتصدر دلوقتي:</div><div class="leaders">${ls.map(p => chip(p, "big crown")).join("")}</div>
             <div class="rule-card hot">🎯 لو المتصدر صدّق كدبتك تاخد <b>${plus(PTS_HUNT)} بونص</b>… اكتبوا كدبة على مقاسه!</div>`
          : `<div class="rule-card">لسه مفيش متصدر… العبوا عادي 😄</div>`;
        body += `<div class="ptsline">${ptsLine(m)}</div>`;
      } else {
        title = "آخر سؤال 🔥";
        body = `<div class="x2 sticker tilt-l">النقط ×2 🔥</div><div class="rule-card">أي حد لسه يقدر يكسب… ركّزوا!</div><div class="ptsline">${ptsLine(m)}</div>`;
      }
      stage.innerHTML = `<div class="intro">
          <div class="round-num pop">السؤال ${r + 1}</div>
          <div class="big pop d1">${title}</div>
          <div class="pop d2">${body}</div>
        </div>
        ${nextBar(`<button class="btn huge" id="btnGo" data-primary>يلا نبدأ نكتب ✍️</button>${keyHint}`)}`;
      $("btnGo").onclick = () => { SFX.unlock(); startWrite(); };
      SFX.whoosh();
    } else if (ph === "write") {
      const ls = S.leaders || [];
      stage.innerHTML = `
        <div class="qcard sticker pop"><div class="q">${promptHTML(S.prompt)}</div></div>
        <div class="instr drop"><span class="big-e">📱</span><span>اكتبوا على موبايلاتكم إجابة <u>غلط</u>… بس تبان حقيقية، عشان تضحكوا بيها على الباقيين</span></div>
        ${huntOn() ? `<div class="instr hot drop">🎯 اللي يضحك على ${namesOf(ls)} ياخد ${plus(PTS_HUNT)} بونص</div>` : ""}
        <div class="botrow">${timerHTML()}<div class="statusbox"><div class="stc" id="stc"></div><div class="statusrow" id="status"></div></div></div>`;
      SFX.whoosh();
    } else if (ph === "vote") {
      const opts = options || [], m = mult();
      stage.innerHTML = `
        <div class="qcard sticker small"><div class="q">${promptHTML(S.prompt)}</div></div>
        <div class="instr drop"><span class="big-e">📱</span><span>فيهم إجابة <b>واحدة بس صح</b>… اختاروها من موبايلاتكم <span class="muted">(لقيتها = ${plus(PTS_TRUTH * m)})</span></span></div>
        <div class="opts ${opts.length > 8 ? "many" : ""} ${opts.length <= 4 ? "few" : ""}">${opts.map((o, i) => `<div class="opt" style="animation-delay:${i * 90}ms"><span class="n">${i + 1}</span><span class="t">${esc(o.t)}</span></div>`).join("")}</div>
        <div class="botrow">${timerHTML()}<div class="statusbox"><div class="stc" id="stc"></div><div class="statusrow" id="status"></div></div></div>`;
      SFX.whoosh();
    } else if (ph === "reveal") {
      renderReveal();
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
      const html = ps.length ? ps.map(p => chip(p, "big pop" + (players[p].online === false ? " off" : ""))).join("") : `<span class="waiting">مستنيين أول واحد يدخل… 👀</span>`;
      if ($("names").innerHTML !== html) $("names").innerHTML = html;
      $("pcount").textContent = ps.length;
      $("btnStart").disabled = ps.length < 2;
      $("startHint").textContent = ps.length < 2 ? "محتاجين 2 على الأقل" : "";
    }
    if ((S.phase === "write" || S.phase === "vote") && $("status")) {
      const done = p => S.phase === "write" ? !!(lies[p] && lies[p].final) : (votes[p] !== undefined && votes[p] !== null);
      const typing = p => S.phase === "write" && lies[p] && !lies[p].final && lies[p].text;
      const html = pids().map(p => chip(p, (done(p) ? "done" : typing(p) ? "typing" : "") + (players[p].online === false ? " off" : ""), done(p) ? `<i class="st">✅</i>` : typing(p) ? `<i class="st">✏️</i>` : `<i class="st">⏳</i>`)).join("");
      if ($("status").innerHTML !== html) $("status").innerHTML = html;
      const on = onlinePids(), n = on.filter(done).length;
      $("stc").innerHTML = S.phase === "write" ? `<b>${n}</b> من ${on.length} بعتوا كدبتهم` : `<b>${n}</b> من ${on.length} اختاروا`;
    }
  }

  setInterval(() => {
    if (!S || !["write", "vote"].includes(S.phase) || !S.endsAt) return;
    const left = Math.max(0, S.endsAt - db.now());
    const total = S.total || (S.phase === "write" ? WRITE_SEC : VOTE_SEC) * 1000;
    const sec = Math.ceil(left / 1000);
    const fg = $("ringfg"), num = $("tnum"), ring = $("ring");
    if (fg) fg.style.strokeDashoffset = (326.7 * (1 - Math.min(1, left / total))).toFixed(1);
    if (num && num.textContent !== String(sec)) num.textContent = sec;
    if (ring) { ring.classList.toggle("hurry", sec <= 10); ring.classList.toggle("panic", sec <= 5 && sec > 0); }
    if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; SFX.tick(); }
    else if (sec <= 10 && sec > 5 && sec !== lastTick) { lastTick = sec; SFX.heart(); }
    if (left <= 0) { if (S.phase === "write") endWrite(); else endVote(); }
  }, 250);

  // ---------- الكشف (خطوة بخطوة بالزرار) ----------
  let revealShell = null;
  function lieMeta(i) {
    const o = (options || [])[i] || { t: "", a: [] };
    const r = S.round, m = mult(), leaders = S.hunt ? (S.leaders || []) : [];
    const a = authorsOf(o), v = votersOf(i), hunters = v.filter(x => leaders.includes(x));
    return { t: o.t, a, v, hunters, pts: v.length * PTS_FOOL * m + hunters.length * PTS_HUNT };
  }

  function renderReveal() {
    const r = S.round;
    if (!script || !options) { stage.innerHTML = `<div class="loading">⏳ لحظة…</div>`; revealShell = null; return; }
    const stp = Math.min(S.rstep || 0, script.length - 1), it = script[stp];
    // الهيكل ثابت طول الكشف (السؤال فوق + النقط + زرار التالي)، واللي بيتغير المحتوى بس
    if (revealShell !== r || !$("rvb")) {
      revealShell = r;
      stage.innerHTML = `<div class="rv-top"><div class="qmini">${promptHTML(S.prompt)}</div><div class="rdots" id="rdots"></div></div>
        <div class="rv-body" id="rvb"></div>
        ${nextBar(`<button class="btn huge" id="btnStep" data-primary>التالي ⏭</button><span class="keyhint" id="khint">أو دوس <kbd>مسافة</kbd></span>`)}`;
      $("btnStep").onclick = () => { SFX.unlock(); advance(); };
    }
    // نقط التقدم: كارت لكل إجابة + الحقيقة
    const cards = []; script.forEach((x, i) => { if ((x.k === "lie" && x.s === 0) || x.k === "nobody" || x.k === "truth") cards.push(i); });
    const curCard = cards.filter(i => i <= stp).length - 1;
    $("rdots").innerHTML = cards.map((c, i) => `<i class="${i < curCard ? "past" : i === curCard ? "cur" : ""} ${script[c].k === "truth" ? "tr" : ""}"></i>`).join("");
    const last = stp >= script.length - 1;
    const nb = document.querySelector(".nextbar");
    if (last) {
      nb.innerHTML = `<button class="btn huge" id="btnBoard" data-primary>نشوف الترتيب 🏆</button>${keyHint}`;
      $("btnBoard").onclick = toScores;
    } else if (!$("btnStep")) {
      nb.innerHTML = `<button class="btn huge" id="btnStep" data-primary>التالي ⏭</button>${keyHint}`;
      $("btnStep").onclick = () => { SFX.unlock(); advance(); };
    }
    if ($("btnStep")) {
      const nx = script[stp + 1];
      $("btnStep").textContent = it.k === "lie" && it.s === 0 ? "اكشفها! 🔍" : nx && nx.k === "drum" ? "يلا نشوف الحقيقة 🥁" : it.k === "drum" ? "اكشف الحقيقة ✅" : "التالي ⏭";
    }
    const rvb = $("rvb"), m = mult();
    if (it.k !== "truth") { const qm = promptHTML(S.prompt); const el = stage.querySelector(".qmini"); if (el.innerHTML !== qm) el.innerHTML = qm; }
    if (it.k === "intro") {
      rvb.innerHTML = `<div class="rv-intro">
        <div class="big pop">يلا نشوف مين ضحك على مين 👀</div>
        <div class="sub pop d1">هنعرض كل إجابة الناس اختاروها… ونكشف: <b class="pink">كدبة</b> ولا <b class="green">حقيقة</b>؟</div>
        <div class="ptsline pop d2">${ptsLine(m)}${huntOn() ? `<span class="pt"><i>🎯</i> المتصدر صدّقك = <b>${plus(PTS_HUNT)}</b> بونص</span>` : ""}</div></div>`;
      SFX.whoosh();
    } else if (it.k === "lie") {
      const L = lieMeta(it.o);
      let card = rvb.querySelector(".rcard.lie");
      const fresh = !(card && +card.dataset.o === it.o);
      if (fresh) {
        rvb.innerHTML = `<div class="rcard lie sticker pop" data-o="${it.o}">
          <div class="rc-label">الإجابة دي…</div>
          <div class="stamp-slot"></div><div class="rc-answer"><span class="txt">${esc(L.t)}</span></div>
          <div class="rc-who"><span class="rc-k" id="vk">اختارها ${L.v.length === 1 ? "واحد" : L.v.length} 👇</span><div class="voters" id="vs"></div></div>
          <div class="rc-result" id="rres"><div class="suspense">حقيقة ولا كدبة؟ 🤔</div></div></div>`;
        card = rvb.querySelector(".rcard.lie");
        SFX.pop();
        if (it.s === 0) staggerVoters(L.v);
        else $("vs").innerHTML = L.v.map(p => chip(p, "big")).join("");
      }
      if (it.s === 1) bust(card, L, it.bot, m);
    } else if (it.k === "nobody") {
      const items = (options || []).map((o, i) => ({ i, t: o.t, a: authorsOf(o) })).filter(o => o.i !== (script.find(x => x.k === "truth") || {}).o && o.a.length && !votersOf(o.i).length);
      rvb.innerHTML = `<div class="rv-nobody"><div class="big2 pop">ودي كدبات محدش صدّقها 😅</div><div class="sub2 pop d1">مفيهاش نقط… المرة الجاية اكتبوا حاجة أقنع!</div>
        <div class="nb-grid">${items.map((o, k) => `<div class="nb sticker pop" style="animation-delay:${200 + k * 120}ms"><div class="nt">${esc(o.t)}</div><div class="na">كتبها: ${o.a.map(p => chip(p)).join("")}</div></div>`).join("")}</div></div>`;
      SFX.pop();
    } else if (it.k === "drum") {
      rvb.innerHTML = `<div class="rv-drum"><div class="drum-e">🥁</div><div class="big">والإجابة الصح هي…</div><div class="qbig sticker">${promptHTML(S.prompt)}</div></div>`;
      SFX.drum();
    } else if (it.k === "truth") {
      const o = (options || [])[it.o] || { t: curQ().truth }, finders = votersOf(it.o);
      stage.querySelector(".qmini").innerHTML = promptHTML(S.prompt, o.t);
      rvb.innerHTML = `<div class="rcard truth sticker pop">
        <div class="rc-label">✅ دي الحقيقة!</div>
        <div class="rc-answer"><span class="txt">${esc(o.t)}</span></div>
        ${curQ().story ? `<div class="story">💡 ${esc(curQ().story)}</div>` : `<div class="qfill">${promptHTML(S.prompt, o.t)}</div>`}
        ${finders.length ? `<div class="rc-who"><span class="rc-k">اللي عرفوها 🕵️</span><div class="voters">${finders.map(p => chip(p, "big done")).join("")}</div></div>
          <div class="points pop d2">${plus(PTS_TRUTH * m)} لكل واحد فيهم 🎉</div>`
          : `<div class="points sad pop d2">ولا حد عرفها! 😂 الفشّارين كسبوا الجولة</div>`}</div>`;
      SFX.tada(); UI.confetti(finders.length ? 200 : 90, { sides: true });
    }
  }

  async function staggerVoters(list) {
    const key = renderedKey;
    await sleep(500);
    for (const p of list) {
      if (renderedKey !== key || !$("vs")) return;
      $("vs").insertAdjacentHTML("beforeend", chip(p, "big drop"));
      SFX.voter(); await sleep(420);
    }
  }

  function bust(card, L, bot, m) {
    $("vs").innerHTML = L.v.map(p => chip(p, "big")).join("");
    card.classList.add("busted");
    card.querySelector(".stamp-slot").innerHTML = `<div class="stamp">كدبة! 🤥</div>`;
    $("vk").textContent = bot ? "صدّقوها 😅" : "اتضحك عليهم 😂";
    let html;
    if (bot) {
      html = `<div class="verdict"><div class="vline"><span class="vk">🤖 الكدبة دي من عندنا</span><span class="muted">مش من حد فيكم… فمحدش أخد عليها نقط</span></div></div>`;
    } else {
      html = `<div class="verdict">
        <div class="vline pop d1"><span class="vk">😈 كتبها:</span>${L.a.map(p => chip(p, "big author")).join("")}</div>
        <div class="points pop d2">${plus(L.pts)} ${L.a.length > 1 ? "لكل واحد فيهم" : "ل" + esc(name(L.a[0]))}<small>(${L.v.length === 1 ? "واحد صدّقها" : L.v.length + " صدّقوها"} × ${PTS_FOOL} نقط${m > 1 ? " × 2" : ""}${L.hunters.length ? " + بونص المتصدر" : ""})</small></div>
        ${L.hunters.length ? `<div class="hunt pop d3">🎯 المتصدر ${namesOf(L.hunters)} وقع في الفخ! ${plus(PTS_HUNT)} بونص</div>` : ""}
      </div>`;
      if (L.v.length >= 3) card.insertAdjacentHTML("beforeend", `<div class="fire">🔥 فشرة جامدة!</div>`);
    }
    $("rres").innerHTML = html;
    SFX.buzz();
    if (!bot) setTimeout(() => SFX.coin(), 650);
    if (!bot && L.v.length >= 3) setTimeout(() => SFX.laugh(), 900);
  }

  // ---------- الترتيب ----------
  function rankMap(list, val) { const m = {}; list.forEach((p, i) => { m[p] = i && val(list[i - 1]) === val(p) ? m[list[i - 1]] : i + 1; }); return m; }
  function renderScores() {
    const r = S.round, myKey = renderedKey;
    Promise.all([db.get(`r${r}/gain`), db.get("prev")]).then(([gain, prev]) => {
      if (renderedKey !== myKey) return;
      gain = gain || {}; prev = prev || {};
      const ps = pids();
      const now = p => scores[p] || 0, before = p => (prev[p] !== undefined ? prev[p] : Math.max(0, now(p) - (gain[p] || 0)));
      const oldO = ps.slice().sort((a, b) => before(b) - before(a) || ps.indexOf(a) - ps.indexOf(b));
      const newO = ps.slice().sort((a, b) => now(b) - now(a) || oldO.indexOf(a) - oldO.indexOf(b));
      const oldR = rankMap(oldO, before), newR = rankMap(newO, now);
      const moved = new Set(ps.map(before)).size > 1; // أول جولة الكل كان صفر: مفيش «طلع/نزل»
      const top = now(newO[0]);
      const left = Q.length - (S.usedQ || []).length, planLeft = QSET.plannedLeft(S.usedQ || []);
      const n = ps.length, rowH = n > 8 ? 56 : n > 6 ? 66 : 76;
      const endBtn = (primary) => `<button class="btn ${primary ? "huge" : "ghost"}" id="btnFinal"${primary ? " data-primary" : ""}>${primary ? "النتيجة النهائية والجوايز 🏆" : "ننهي هنا ونعلن النتيجة 🏁"}</button>`;
      let bar;
      if (S.last || left <= 0) bar = (left > 0 ? `<button class="btn ghost" id="btnMore">سؤال زيادة 🔁</button>` : "") + endBtn(true);
      else if (planLeft <= 1 || left === 1) bar = endBtn(false) + `<button class="btn huge" id="btnLast" data-primary>آخر سؤال (النقط ×2) 🔥</button>`;
      else bar = endBtn(false) + `<button class="btn ghost" id="btnLast">آخر سؤال (×2) 🔥</button><button class="btn huge" id="btnNext" data-primary>السؤال الجاي ⏭</button>`;
      bar += keyHint;
      stage.innerHTML = `<div class="sc-head pop">الترتيب بعد السؤال ${r + 1}</div>
        <div class="board" style="height:${n * rowH}px;--rh:${rowH}px">${oldO.map((p, i) => {
          const a = UI.avatar(players, p), d = moved ? (oldR[p] || 0) - (newR[p] || 0) : 0;
          return `<div class="brow" data-p="${p}" style="top:${i * rowH}px;--c:${a.c}">
            <div class="rank">${oldR[p]}</div><div class="av">${a.e}</div><div class="nm">${esc(name(p))}</div>
            <div class="move ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "▲" + d : d < 0 ? "▼" + -d : ""}</div>
            <div class="gain ${gain[p] ? "" : "zero"}">${plus(gain[p] || 0)}</div>
            <div class="pts">${before(p)}</div></div>`;
        }).join("")}</div>
        ${nextBar(bar)}`;
      if ($("btnNext")) $("btnNext").onclick = () => startIntro(r + 1);
      if ($("btnLast")) $("btnLast").onclick = () => startIntro(r + 1, true);
      if ($("btnMore")) $("btnMore").onclick = () => startIntro(r + 1, true);
      if ($("btnFinal")) $("btnFinal").onclick = toFinal;
      SFX.whoosh();
      // 1) النقط الجديدة تطلع  2) العدّ يطلع  3) الصفوف تتحرك لمكانها الجديد
      (async () => {
        await sleep(700); if (renderedKey !== myKey) return;
        stage.querySelectorAll(".brow").forEach(el => el.classList.add("show-gain"));
        if (Object.values(gain).some(Boolean)) SFX.coin();
        await sleep(600); if (renderedKey !== myKey) return;
        const t0 = performance.now(), dur = 900;
        const els = [...stage.querySelectorAll(".brow")];
        const tickNums = () => {
          const k = Math.min(1, (performance.now() - t0) / dur);
          els.forEach(el => { const p = el.dataset.p; el.querySelector(".pts").textContent = Math.round(before(p) + (now(p) - before(p)) * k); });
          if (k < 1 && renderedKey === myKey) requestAnimationFrame(tickNums);
        };
        requestAnimationFrame(tickNums);
        setTimeout(() => els.forEach(el => { const p = el.dataset.p; el.querySelector(".pts").textContent = now(p); }), dur + 50);
        await sleep(dur + 150); if (renderedKey !== myKey) return;
        els.forEach(el => {
          const p = el.dataset.p;
          el.style.top = newO.indexOf(p) * rowH + "px";
          el.querySelector(".rank").textContent = top > 0 && now(p) === top ? "👑" : newR[p];
          el.classList.toggle("first", top > 0 && now(p) === top);
          el.classList.add("moved");
        });
        SFX.pop();
      })();
    });
  }

  // ---------- الجوايز ----------
  let aStep = 0, awardsCache = null;
  async function runFinal() {
    const myKey = renderedKey;
    awardsCache = (await db.get("awards")) || [];
    if (renderedKey !== myKey) return;
    aStep = 0;
    showAward();
  }
  function showAward() {
    const aw = awardsCache || [];
    const champIdx = aw.findIndex(a => a.key === "champ");
    // خطوات: عنوان، كل جايزة، (طبلة قبل البطل)، الملخص
    const steps = [{ k: "title" }];
    aw.forEach((a, i) => { if (i === champIdx) steps.push({ k: "drum" }); steps.push({ k: "award", a }); });
    steps.push({ k: "summary" });
    const st = steps[Math.min(aStep, steps.length - 1)], last = aStep >= steps.length - 1;
    const who = a => (a.who || []).map(p => chip(p, "huge")).join("");
    let body = "";
    if (st.k === "title") { body = `<div class="aw-title"><div class="big pop">🏅 جوايز الفشّار</div><div class="sub pop d1">مين كدب أحسن… ومين اتضحك عليه أكتر؟</div></div>`; SFX.whoosh(); }
    else if (st.k === "drum") { body = `<div class="rv-drum"><div class="drum-e">🥁</div><div class="big">وبطل الفشّار هو…</div></div>`; SFX.drum(); }
    else if (st.k === "award") {
      const a = st.a, champ = a.key === "champ";
      body = `<div class="award-big sticker pop ${champ ? "champ" : ""}"><div class="em">${a.em}</div><div class="t">${esc(a.title)}</div><div class="d">${esc(a.desc || "")}</div>
        <div class="w">${who(a)}</div><div class="v">${esc(a.v)}</div></div>`;
      if (champ) { SFX.fanfare(); UI.confetti(260, { sides: true }); setTimeout(() => UI.confetti(160), 900); } else SFX.stamp();
    } else {
      const champ = aw.find(a => a.key === "champ"), rest = aw.filter(a => a.key !== "champ");
      body = `<div class="summary">
        ${champ ? `<div class="award-big sticker champ small pop"><div class="em">🏆</div><div class="t">بطل الفشّار</div><div class="w">${who(champ)}</div><div class="v">${esc(champ.v)}</div></div>` : ""}
        <div class="awards">${rest.map((a, i) => `<div class="award sticker pop" style="animation-delay:${200 + i * 150}ms"><div class="em">${a.em}</div><div class="t">${esc(a.title)}</div><div class="w">${(a.who || []).map(p => chip(p, "big")).join("")}</div><div class="v">${esc(a.v)}</div></div>`).join("")}</div>
        <div class="thanks pop d3">شكراً إنكم لعبتوا 💛 يلا على الميتينج!</div></div>`;
      UI.confetti(120);
    }
    stage.innerHTML = `<div class="final-body">${body}</div>${nextBar(last
      ? `<button class="btn ghost" id="btnAgain">لعبة جديدة 🆕</button>`
      : `<button class="btn huge" id="btnAward" data-primary>${steps[aStep + 1] && steps[aStep + 1].k === "summary" ? "الملخص 📋" : "الجايزة الجاية ⏭"}</button>${keyHint}`)}`;
    if ($("btnAward")) $("btnAward").onclick = () => { aStep++; showAward(); };
    if ($("btnAgain")) $("btnAgain").onclick = () => { if ($("btnAgain").dataset.armed) newGame(); else { $("btnAgain").dataset.armed = 1; $("btnAgain").textContent = "متأكد؟ دوس تاني"; } };
  }

  // ---------- الأزرار ----------
  $("btnPlus").onclick = () => { if (S && S.endsAt) { const ends = Math.max(S.endsAt, db.now()) + 15000; db.update({ "state/endsAt": ends, "state/total": Math.max(S.total || 0, ends - db.now()) }); } };
  $("btnEnd").onclick = () => { if (!S) return; if (S.phase === "write") endWrite(); else if (S.phase === "vote") endVote(); };
  $("btnSwap").onclick = swapQuestion;
  $("btnQs").onclick = () => QSET.open();
  $("btnMute").onclick = () => { SFX.setMuted(!SFX.isMuted()); $("btnMute").textContent = SFX.isMuted() ? "🔇" : "🔊"; };
  let newArmed = null;
  $("btnNew").onclick = () => {
    if (newArmed) { clearTimeout(newArmed); newGame(); return; }
    $("btnNew").textContent = "متأكد؟ دوس تاني";
    newArmed = setTimeout(() => { newArmed = null; $("btnNew").textContent = "🆕"; }, 3000);
  };
  // مسافة / الأسهم / زرار الريموت (PageDown) = الزرار الأساسي اللي على الشاشة
  let lastKey = 0;
  document.addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight", " ", "PageDown"].includes(e.key) || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if ((window.HOWTO && HOWTO.isOpen()) || (window.QSET && QSET.isOpen())) return;
    e.preventDefault();
    if (e.repeat || Date.now() - lastKey < 400) return; lastKey = Date.now();
    const b = stage.querySelector("[data-primary]");
    if (b && !b.disabled) b.click(); else skip();
  });
  document.addEventListener("click", e => { SFX.unlock(); if (e.target.closest && e.target.closest("button")) setTimeout(() => document.activeElement && document.activeElement.blur && document.activeElement.blur(), 0); });

  window.__host = { get S() { return S; }, room, joinUrl };
})();
