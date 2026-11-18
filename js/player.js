// شاشة اللاعب (الموبايل)
(function () {
  const $ = id => document.getElementById(id);
  const view = $("view"), banner = $("banner");
  const esc = UI.esc, plus = UI.plus;
  const params = new URLSearchParams(location.search);
  const room = (params.get("room") || "").toUpperCase().trim();
  const vib = p => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) {} };

  if (!room) {
    view.innerHTML = `<div class="pcard"><div class="pmid">اكتب كود الغرفة اللي على الشاشة</div>
      <input class="pinput" id="code" maxlength="4" style="text-align:center;letter-spacing:8px;direction:ltr;margin-top:12px" autocomplete="off">
      <button class="btn pbtn" id="go">ادخل</button></div>`;
    $("go").onclick = () => { const c = $("code").value.trim().toUpperCase(); if (c) location.search = "?room=" + encodeURIComponent(c) + (params.has("local") ? "&local=1" : ""); };
    return;
  }

  const db = DB.connect(room, false);
  // في وضع التجربة كل تاب لاعب مختلف، فبنحفظ في sessionStorage
  const store = db.mode === "local" ? sessionStorage : localStorage;
  let pid = store.getItem("fishar_pid_" + room);
  let savedName = store.getItem("fishar_name_" + room) || "";
  let S = null, players = null, scores = {}, awards = null, prev = {};
  let myLie = null, rej = null, options = null, myVote = null, gain = null, votes = {}, script = null;
  let roundSubs = [], subRound = -1, renderedKey = "", draftTimer = null, presenceOn = false;

  const palert = $("palert");
  const pAlert = html => { palert.innerHTML = html ? `<div class="pmsg warn" style="margin:0 0 12px">${html}</div>` : ""; };
  db.onStatus(ok => {
    if (ok) pAlert("");
    else pAlert(db.mode === "local"
      ? "😕 مش لاقي شاشة المذيع. اللعبة لسه في «وضع التجربة» وده بيشتغل بس في تابات نفس المتصفح اللي فاتح شاشة المذيع. عشان الموبايلات تدخل، المذيع لازم يظبط Firebase."
      : "😕 مش قادر أوصل للسيرفر… اتأكد من النت وجرّب تعمل refresh");
  });
  db.onError(e => {
    const c = String((e && (e.code || e.message)) || e);
    pAlert("🔴 السيرفر رفض (" + esc(c) + ")" + (/permission/i.test(c) ? "، قول للمذيع يراجع الـ Rules في Firebase" : ""));
  });
  const joined = () => !!(pid && players && players[pid]);
  const nameOf = p => UI.nameOf(players, p);
  const namesOf = l => UI.names(players, l);

  db.on("players", v => { players = v || {}; render(); });
  db.on("scores", v => { scores = v || {}; render(); });
  db.on("prev", v => { prev = v || {}; });
  db.on("awards", v => { awards = v; render(); });
  db.on("state", v => { S = v; if (S) subscribeRound(S.round); render(); });

  function subscribeRound(r) {
    if (r === subRound || !pid) return;
    roundSubs.forEach(u => u()); roundSubs = []; subRound = r;
    myLie = rej = options = myVote = gain = script = null; votes = {};
    roundSubs.push(db.on(`r${r}/lies/${pid}`, v => { myLie = v; render(); }));
    roundSubs.push(db.on(`r${r}/rej/${pid}`, v => { const was = rej; rej = v; if (v && v !== was) vib([80, 60, 80]); render(); }));
    roundSubs.push(db.on(`r${r}/options`, v => { options = v; render(); }));
    roundSubs.push(db.on(`r${r}/votes/${pid}`, v => { myVote = v; render(); }));
    roundSubs.push(db.on(`r${r}/gain/${pid}`, v => { gain = v; render(); }));
    roundSubs.push(db.on(`r${r}/script`, v => { script = v; render(); }));
    roundSubs.push(db.on(`r${r}/votes`, v => { votes = v || {}; if (S && S.phase === "reveal") render(); }));
  }

  // ---------- الدخول ----------
  function renderJoin(msg) {
    setBanner("");
    view.innerHTML = `<div class="pcard pop">
      <div class="pbig">أهلاً 👋</div>
      <div class="pmuted" style="margin:6px 0 16px">اكتب اسمك اللي هيظهر على الشاشة</div>
      <input class="pinput" id="nm" maxlength="12" placeholder="اسمك" autocomplete="off" value="${esc(savedName)}">
      ${msg ? `<div class="pmsg warn">${msg}</div>` : ""}
      <button class="btn pbtn" id="join">ادخل اللعبة 🎮</button></div>`;
    const go = () => {
      const n = $("nm").value.replace(/\s+/g, " ").trim().slice(0, 12);
      if (!n) { $("nm").classList.add("shake"); setTimeout(() => $("nm").classList.remove("shake"), 500); return; }
      const taken = Object.keys(players || {}).some(p => p !== pid && TXT.normalize(players[p].name) === TXT.normalize(n));
      if (taken) { savedName = n; renderJoin("الاسم ده موجود 😅 زوّد حرف أو اكتب اسم العيلة"); return; }
      if (!pid) { pid = "p" + Math.random().toString(36).slice(2, 10); store.setItem("fishar_pid_" + room, pid); }
      store.setItem("fishar_name_" + room, n); savedName = n;
      db.set("players/" + pid, { name: n, joined: db.now(), online: true });
      vib(40);
      startPresence(); keepAwake();
      if (S) subscribeRound(S.round);
    };
    $("join").onclick = go;
    $("nm").onkeydown = e => { if (e.key === "Enter") go(); };
  }
  function startPresence() { if (presenceOn || !pid) return; presenceOn = true; db.presence(pid); }
  let wake = null;
  async function keepAwake() { try { if ("wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch (e) {} }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && joined()) keepAwake(); });

  // شريط «اعمل إيه دلوقتي» اللي فوق
  function setBanner(html, cls) {
    if (!html) { banner.classList.add("hidden"); return; }
    banner.classList.remove("hidden");
    banner.className = "pbanner " + (cls || "");
    if (banner.innerHTML !== html) banner.innerHTML = html;
  }

  // ---------- العرض ----------
  function render() {
    if (!players) return;
    if (!joined()) { $("me").innerHTML = ""; if (renderedKey !== "join") { renderedKey = "join"; renderJoin(); } return; }
    startPresence();
    if (players[pid].online === false) db.set(`players/${pid}/online`, true);
    const a = UI.avatar(players, pid);
    const meHTML = `<span class="pav" style="--c:${a.c}">${a.e}</span><b>${esc(nameOf(pid))}</b><span class="mscore">${scores[pid] || 0} نقطة</span>`;
    if ($("me").innerHTML !== meHTML) $("me").innerHTML = meHTML;
    $("foot").textContent = "كود الغرفة: " + room;
    if (!S) { view.innerHTML = `<div class="pmuted">بنوصل…</div>`; return; }
    const ph = S.phase;
    const key = [ph, S.round, S.qIndex, ph === "vote" ? (options || []).length : "", ph === "final" ? !!awards : "", ph === "scores" ? gain : "",
      ph === "reveal" ? (script ? "s" : "-") + (S.rstep || 0) + "|" + Object.keys(votes).length + "|" + !!options : ""].join("|");
    if (key !== renderedKey) { renderedKey = key; renderPhase(); }
    updateDynamic();
  }

  function promptHTML(p, fill) { return esc(p || "").replace("____", fill != null ? `<span class="blank filled">${esc(fill)}</span>` : '<span class="blank">؟؟</span>'); }
  function rankOf(p, sc) { const arr = Object.keys(players).map(x => sc[x] || 0).sort((a, b) => b - a); return arr.indexOf(sc[p] || 0) + 1; }
  const m = () => (S.round >= 2 ? 2 : 1);
  const mine = o => ((o && o.a) || []).includes(pid);
  const hasVote = () => myVote !== null && myVote !== undefined;

  function renderPhase() {
    const ph = S.phase, r = S.round, leaders = S.leaders || [];
    view.className = "pcenter ph-" + ph;
    if (ph === "lobby") {
      const a = UI.avatar(players, pid);
      setBanner("⏳ استنى المذيع يبدأ اللعبة", "wait");
      view.innerHTML = `<div class="bigav pop" style="--c:${a.c}">${a.e}</div>
        <div class="pbig">أهلاً يا ${esc(nameOf(pid))}!</div><div class="pmid">انت جوه ✅ اسمك ظاهر على الشاشة</div>
        <div class="pcard howto-p">
          <div><span>✍️</span> هتكتب كدبة تبان حقيقية</div>
          <div><span>🕵️</span> وتدوّر على الحقيقة وسط كدب زمايلك</div>
          <div><span>😈</span> كل واحد يصدّق كدبتك = نقطة ليك</div>
        </div>
        <div class="pmuted" id="cnt"></div>`;
    } else if (ph === "intro") {
      setBanner("👀 بص على الشاشة… هنبدأ دلوقتي", "look");
      let rule = "", extra = "";
      if (r === 0) rule = "هتظهر معلومة حقيقية فيها كلمة ناقصة… اكتب مكانها كدبة تقنع زمايلك";
      else if (r === 1) {
        rule = "👑 اصطاد المتصدر";
        if (leaders.length) extra = leaders.includes(pid)
          ? `<div class="pmsg gold">👑 انت المتصدر! كل الناس هتحاول تضحك عليك الجولة دي… خلي بالك</div>`
          : `<div class="pmsg gold">🎯 لو ${leaders.map(p => esc(nameOf(p))).join(" أو ")} صدّق كدبتك تاخد ${plus(3)} بونص</div>`;
      } else rule = "🔥 النقط ×2 في الجولة دي";
      view.innerHTML = `<div class="pround pop">الجولة ${r + 1}${r < 3 ? " من 3" : ""}</div><div class="pmid pop d1">${rule}</div>${extra}
        <div class="ppts pop d2"><span>✅ لقيت الحقيقة <b>${plus(2 * m())}</b></span><span>😈 كل واحد صدّقك <b>${plus(m())}</b></span></div>`;
    } else if (ph === "write") {
      const hunt = r === 1 && leaders.length
        ? (leaders.includes(pid) ? `<div class="pmsg gold" style="margin:0 0 12px">👑 كل الناس بتحاول تضحك عليك!</div>` : `<div class="pmsg gold" style="margin:0 0 12px">🎯 اضحك على ${leaders.map(p => esc(nameOf(p))).join(" أو ")} وخد ${plus(3)}</div>`)
        : "";
      view.innerHTML = `<div class="pcard">
        ${hunt}
        <div class="pprompt">${promptHTML(S.prompt)}</div>
        <div class="phint">${esc(S.hint)}</div>
        <div class="ptimer-row"><div class="timerbar" id="tbar"><i></i></div><span class="tsec" id="tsec"></span></div>
        <input class="pinput" id="lie" maxlength="25" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="اكتب كدبتك هنا…">
        <div class="pcount" id="cc">0/25</div>
        <div id="msg"></div>
        <button class="btn pbtn" id="send">ابعت الكدبة 😈</button>
      </div>`;
      const inp = $("lie");
      if (myLie && myLie.text) inp.value = myLie.text;
      $("cc").textContent = inp.value.length + "/25";
      inp.oninput = () => {
        $("cc").textContent = inp.value.length + "/25";
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => { if (!(myLie && myLie.final)) db.set(`r${S.round}/lies/${pid}`, { text: inp.value.slice(0, 25), final: false }); }, 450);
      };
      inp.onkeydown = e => { if (e.key === "Enter") $("send").click(); };
      $("send").onclick = () => {
        if (myLie && myLie.final) { db.set(`r${S.round}/lies/${pid}/final`, false); setTimeout(() => inp.focus(), 50); return; }
        const t = TXT.clean(inp.value);
        if (!t) { inp.classList.add("shake"); setTimeout(() => inp.classList.remove("shake"), 500); return; }
        clearTimeout(draftTimer);
        db.update({ [`r${S.round}/lies/${pid}`]: { text: t, final: true }, [`r${S.round}/rej/${pid}`]: null });
        vib(40);
        inp.blur();
      };
    } else if (ph === "vote") {
      const opts = options || [];
      view.innerHTML = `<div class="pcard">
        <div class="pprompt sm">${promptHTML(S.prompt)}</div>
        <div class="ptimer-row"><div class="timerbar" id="tbar"><i></i></div><span class="tsec" id="tsec"></span></div>
        <div class="pvote ${opts.length > 7 ? "many" : ""}" id="pv">${opts.map((o, i) => `<button data-i="${i}" class="${mine(o) ? "mine" : ""}"><span class="n">${i + 1}</span><span class="t">${esc(o.t)}</span></button>`).join("")}</div>
        <div id="msg"></div></div>`;
      view.querySelectorAll("#pv button").forEach(b => {
        b.onclick = () => { if (b.classList.contains("mine")) { vib([30, 40, 30]); return; } db.set(`r${S.round}/votes/${pid}`, +b.dataset.i); vib(30); };
      });
    } else if (ph === "reveal") {
      renderReveal();
    } else if (ph === "scores") {
      setBanner("🏆 الترتيب على الشاشة", "look");
      const g = gain || 0;
      const nowR = rankOf(pid, scores), oldR = rankOf(pid, prev), d = new Set(Object.keys(players).map(x => prev[x] || 0)).size > 1 ? oldR - nowR : 0;
      view.innerHTML = `<div class="pmuted">الجولة دي جبت</div><div class="gainbig pop ${g ? "" : "zero"}">${plus(g)}</div>
        <div class="pstats pop d1"><div><b>${scores[pid] || 0}</b><small>مجموعك</small></div><div><b>#${nowR}</b><small>ترتيبك</small></div></div>
        ${d > 0 ? `<div class="pmsg ok pop d2">▲ طلعت ${d} ${d === 1 ? "مركز" : "مراكز"} 🚀</div>` : d < 0 ? `<div class="pmsg warn pop d2">▼ نزلت ${-d} ${-d === 1 ? "مركز" : "مراكز"}… لسه فيه وقت!</div>` : ""}
        ${nowR === 1 && (scores[pid] || 0) > 0 ? `<div class="pmsg gold pop d2">👑 انت في المركز الأول!</div>` : ""}`;
      if (g) vib([40, 40, 80]);
    } else if (ph === "final") {
      setBanner("🎉 خلصنا! بص على الشاشة للجوايز", "look");
      const mineA = (awards || []).filter(a => (a.who || []).includes(pid));
      view.innerHTML = `<div class="pbig pop">خلصنا! 🎉</div>
        <div class="pstats pop d1"><div><b>${scores[pid] || 0}</b><small>نقطة</small></div><div><b>#${rankOf(pid, scores)}</b><small>ترتيبك</small></div></div>
        ${mineA.length ? `<div class="pawards">${mineA.map(a => `<div class="pa pop d2">${a.em} ${esc(a.title)}</div>`).join("")}</div>` : `<div class="pmuted">شكراً إنك لعبت 😄</div>`}`;
      if (mineA.some(a => a.key === "champ")) setTimeout(() => UI.confetti(180), 300);
    }
  }

  // على الموبايل وقت الكشف: بنقول للاعب إيه اللي حصله في الخطوة اللي على الشاشة
  function renderReveal() {
    setBanner("👀 بص على الشاشة", "look");
    const opts = options || [];
    if (!script) { view.innerHTML = `<div class="pbig">👀</div><div class="pmid">الكشف بيبدأ…</div>`; return; }
    const it = script[Math.min(S.rstep || 0, script.length - 1)] || { k: "intro" };
    const ti = (script.find(x => x.k === "truth") || {}).o;
    const myOpt = opts.findIndex(mine);
    const picked = hasVote() && opts[myVote] ? `<div class="ppick">انت اخترت: <b>«${esc(opts[myVote].t)}»</b></div>` : "";
    const fooled = myOpt >= 0 ? Object.keys(votes).filter(v => votes[v] === myOpt && v !== pid) : [];
    let html = "";
    if (it.k === "intro") {
      html = `<div class="pbig pop">يلا نشوف مين ضحك على مين 👀</div>${picked}`;
    } else if (it.k === "lie") {
      const o = opts[it.o] || { t: "" }, v = Object.keys(votes).filter(x => votes[x] === it.o);
      const isMine = mine(o), iPicked = myVote === it.o;
      html = `<div class="pmuted">على الشاشة دلوقتي:</div><div class="pans pop ${it.s ? "busted" : ""}">«${esc(o.t)}»${it.s ? `<span class="pstamp">كدبة! 🤥</span>` : ""}</div>`;
      if (it.s === 0) html += isMine ? `<div class="pmsg gold pop d1">😏 دي كدبتك! ${v.length} صدّقوها… اسكت متفضحش نفسك</div>`
        : iPicked ? `<div class="pmsg pop d1">🤞 انت اخترت دي… ياترى صح؟</div>` : `<div class="pmid pop d1">حقيقة ولا كدبة؟ 🤔</div>`;
      else {
        const pts = v.length * m() + v.filter(x => S.round === 1 && (S.leaders || []).includes(x)).length * 3;
        html += isMine ? `<div class="pmsg ok pop d1">😈 كدبتك ضحكت على ${v.length}! <b>${plus(pts)}</b></div>`
          : iPicked ? `<div class="pmsg warn pop d1">😅 اتضحك عليك! ${it.bot || !(o.a || []).filter(x => x !== "-").length ? "دي كدبة من عند اللعبة 🤖" : "دي كدبة " + esc(namesOf((o.a || []).filter(x => x !== "-")))}</div>`
          : `<div class="pmid pop d1">❌ طلعت كدبة</div>`;
        if (isMine || iPicked) vib(isMine ? [40, 40, 120] : [120]);
      }
    } else if (it.k === "nobody") {
      const mineNobody = myOpt >= 0 && myOpt !== ti && !fooled.length;
      html = mineNobody ? `<div class="pbig">😅</div><div class="pmsg pop">كدبتك محدش صدّقها المرة دي… الجولة الجاية!</div>` : `<div class="pbig">👀</div><div class="pmid">كدبات محدش صدّقها</div>`;
    } else if (it.k === "drum") {
      html = `<div class="pbig drumb">🥁</div><div class="pmid">والحقيقة هي…</div>${picked}`;
    } else if (it.k === "truth") {
      const o = opts[it.o] || { t: "" };
      html = `<div class="pmuted">✅ الحقيقة:</div><div class="pans truth pop">«${esc(o.t)}»</div>`;
      if (myVote === it.o) { html += `<div class="pmsg ok pop d1">🎉 عرفتها! <b>${plus(2 * m())}</b></div>`; UI.confetti(120); vib([40, 40, 120]); }
      else if (!hasVote()) html += `<div class="pmsg pop d1">⏰ مالحقتش تختار المرة دي</div>`;
      else html += `<div class="pmsg warn pop d1">😬 مالقيتهاش المرة دي</div>`;
      if (fooled.length) html += `<div class="pmsg gold pop d2">😈 وكدبتك ضحكت على ${fooled.length}</div>`;
    }
    view.innerHTML = html;
  }

  function updateDynamic() {
    const ph = S.phase;
    if (ph === "lobby" && $("cnt")) $("cnt").textContent = `${Object.keys(players).length} دخلوا لحد دلوقتي`;
    if (ph === "write" && $("lie")) {
      const sent = !!(myLie && myLie.final), inp = $("lie");
      inp.disabled = sent;
      $("send").textContent = sent ? "عدّل كدبتك ✏️" : "ابعت الكدبة 😈";
      $("send").className = "btn pbtn" + (sent ? " ghost" : "");
      let msg = "";
      if (sent) msg = `<div class="pmsg ok pop">اتبعت ✅ كدبتك جاهزة… استنى الباقيين</div>`;
      else if (rej) msg = `<div class="pmsg warn shake">🙈 انت كتبت الحقيقة! برافو… بس المطلوب كدبة، اكتب حاجة تانية</div>`;
      if ($("msg").innerHTML !== msg) $("msg").innerHTML = msg;
      if (sent) setBanner("✅ اتبعت! بص على الشاشة لحد ما الكل يخلص", "done");
      else setBanner("✍️ اكتب إجابة <u>غلط</u> تبان حقيقية", "act");
    }
    if (ph === "vote" && $("pv")) {
      view.querySelectorAll("#pv button").forEach(b => b.classList.toggle("sel", hasVote() && +b.dataset.i === myVote));
      const msg = hasVote() ? `<div class="pmsg ok">تمام ✅ تقدر تغيّر لحد ما الوقت يخلص</div>` : "";
      if ($("msg").innerHTML !== msg) $("msg").innerHTML = msg;
      if (hasVote()) setBanner("✅ اخترت! استنى الكشف على الشاشة", "done");
      else setBanner("👆 اختار الإجابة اللي شايفها <u>صح</u>", "act");
    }
  }

  setInterval(() => {
    if (!S || !S.endsAt || !["write", "vote"].includes(S.phase)) return;
    const bar = $("tbar"); if (!bar) return;
    const total = S.total || (S.phase === "write" ? 50000 : 30000);
    const left = Math.max(0, S.endsAt - db.now());
    bar.firstElementChild.style.width = Math.min(100, (left / total) * 100) + "%";
    bar.classList.toggle("hurry", left < 10000);
    const ts = $("tsec"); if (ts) { ts.textContent = Math.ceil(left / 1000); ts.classList.toggle("hurry", left < 10000); }
  }, 300);
})();
