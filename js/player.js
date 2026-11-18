// شاشة اللاعب (الموبايل)
(function () {
  const $ = id => document.getElementById(id);
  const view = $("view");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  const room = (params.get("room") || "").toUpperCase().trim();
  const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  if (!room) {
    view.innerHTML = `<div class="pcard"><div class="pmid">اكتب كود الغرفة اللي على الشاشة</div>
      <input class="pinput" id="code" maxlength="4" style="text-align:center;letter-spacing:8px;direction:ltr;margin-top:12px" autocomplete="off">
      <button class="btn pbtn" id="go">ادخل</button></div>`;
    $("go").onclick = () => { const c = $("code").value.trim().toUpperCase(); if (c) location.search = "?room=" + encodeURIComponent(c); };
    return;
  }

  const db = DB.connect(room, false);
  // في وضع التجربة كل تاب لاعب مختلف، فبنحفظ في sessionStorage
  const store = db.mode === "local" ? sessionStorage : localStorage;
  let pid = store.getItem("fishar_pid_" + room);
  let savedName = store.getItem("fishar_name_" + room) || "";
  let S = null, players = null, scores = {}, awards = null;
  let myLie = null, rej = null, options = null, myVote = null, gain = null;
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
  const nameOf = p => (players && players[p] && players[p].name) || "؟";

  db.on("players", v => { players = v || {}; render(); });
  db.on("scores", v => { scores = v || {}; render(); });
  db.on("awards", v => { awards = v; render(); });
  db.on("state", v => { S = v; if (S) subscribeRound(S.round); render(); });

  function subscribeRound(r) {
    if (r === subRound || !pid) return;
    roundSubs.forEach(u => u()); roundSubs = []; subRound = r;
    myLie = rej = options = myVote = gain = null;
    roundSubs.push(db.on(`r${r}/lies/${pid}`, v => { myLie = v; render(); }));
    roundSubs.push(db.on(`r${r}/rej/${pid}`, v => { const was = rej; rej = v; if (v && v !== was) vib([80, 60, 80]); render(); }));
    roundSubs.push(db.on(`r${r}/options`, v => { options = v; render(); }));
    roundSubs.push(db.on(`r${r}/votes/${pid}`, v => { myVote = v; render(); }));
    roundSubs.push(db.on(`r${r}/gain/${pid}`, v => { gain = v; render(); }));
  }

  // ---------- الدخول ----------
  function renderJoin(msg) {
    view.innerHTML = `<div class="pcard">
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

  // ---------- العرض ----------
  function render() {
    if (!players) return;
    if (!joined()) { $("me").innerHTML = ""; if (renderedKey !== "join") { renderedKey = "join"; renderJoin(); } return; }
    startPresence();
    if (players[pid].online === false) db.set(`players/${pid}/online`, true);
    $("me").innerHTML = `<b>${esc(nameOf(pid))}</b> · ${scores[pid] || 0} نقطة`;
    $("foot").textContent = "كود الغرفة: " + room;
    if (!S) { view.innerHTML = `<div class="pmuted">بنوصل…</div>`; return; }
    const key = [S.phase, S.round, S.qIndex, S.phase === "vote" ? (options || []).length : "", S.phase === "final" ? !!awards : "", S.phase === "scores" ? gain : ""].join("|");
    if (key !== renderedKey) { renderedKey = key; renderPhase(); }
    updateDynamic();
  }

  function promptHTML(p) { return esc(p || "").replace("____", '<span class="blank">؟</span>'); }
  function rankOf(p) { const arr = Object.keys(players).map(x => scores[x] || 0).sort((a, b) => b - a); return arr.indexOf(scores[p] || 0) + 1; }

  function renderPhase() {
    const ph = S.phase, r = S.round, leaders = S.leaders || [];
    if (ph === "lobby") {
      view.innerHTML = `<div class="pbig">أهلاً يا ${esc(nameOf(pid))} 👋</div><div class="pmid">انت جوه! استنى المذيع يبدأ…</div><div class="pmuted" id="cnt"></div>`;
    } else if (ph === "intro") {
      let extra = "";
      if (r === 1 && leaders.length) {
        extra = leaders.includes(pid)
          ? `<div class="pmsg gold">👑 انت المتصدر! كل الناس هتحاول تضحك عليك الجولة دي… خلي بالك</div>`
          : `<div class="pmsg gold">🎯 لو ${leaders.map(p => esc(nameOf(p))).join(" أو ")} صدّق كدبتك تاخد +3</div>`;
      }
      if (r >= 2) extra = `<div class="pmsg gold">🔥 النقط ×2</div>`;
      view.innerHTML = `<div class="pbig">الجولة ${r + 1}</div><div class="pmid">بص على الشاشة… هنبدأ دلوقتي</div>${extra}`;
    } else if (ph === "write") {
      const hunt = r === 1 && leaders.length
        ? (leaders.includes(pid) ? `<div class="pmsg gold" style="margin:0 0 12px">👑 كل الناس بتحاول تضحك عليك!</div>` : `<div class="pmsg gold" style="margin:0 0 12px">🎯 اضحك على ${leaders.map(p => esc(nameOf(p))).join(" أو ")} وخد +3</div>`)
        : "";
      view.style.justifyContent = "flex-start";
      view.innerHTML = `<div class="pcard" style="text-align:right">
        ${hunt}
        <div class="pprompt">${promptHTML(S.prompt)}</div>
        <div class="phint">(${esc(S.hint)}) · اكتب كدبة تبان حقيقية</div>
        <div class="timerbar ptimer" id="tbar"><i></i></div>
        <input class="pinput" id="lie" maxlength="25" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="كدبتك هنا…">
        <div class="pcount" id="cc">0/25</div>
        <div id="msg"></div>
        <button class="btn pbtn" id="send">ابعت 😈</button>
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
        inp.blur();
      };
    } else if (ph === "vote") {
      view.style.justifyContent = "flex-start";
      const opts = options || [];
      view.innerHTML = `<div class="pcard" style="text-align:right">
        <div class="pprompt" style="font-size:18px">${promptHTML(S.prompt)}</div>
        <div class="phint">فيهم حقيقة واحدة بس… لقيتها = نقطتين${r >= 2 ? " ×2" : ""}</div>
        <div class="timerbar ptimer" id="tbar"><i></i></div>
        <div class="pvote" id="pv">${opts.map((o, i) => `<button data-i="${i}" class="${(o.a || []).includes(pid) ? "mine" : ""}"><span class="n">${i + 1}</span>${esc(o.t)}</button>`).join("")}</div>
        <div id="msg"></div></div>`;
      view.querySelectorAll("#pv button").forEach(b => {
        b.onclick = () => { if (b.classList.contains("mine")) return; db.set(`r${S.round}/votes/${pid}`, +b.dataset.i); vib(30); };
      });
    } else if (ph === "reveal") {
      view.style.justifyContent = "center";
      view.innerHTML = `<div class="pbig">👀 بص على الشاشة</div><div class="pmid">الكشف شغال… مين ضحك على مين؟</div>`;
    } else if (ph === "scores") {
      view.style.justifyContent = "center";
      const g = gain || 0;
      view.innerHTML = `<div class="pmuted">الجولة دي جبت</div><div class="gainbig ${g ? "" : "zero"}">+${g}</div>
        <div class="pmid">مجموعك: ${scores[pid] || 0} نقطة · ترتيبك #${rankOf(pid)}</div>`;
    } else if (ph === "final") {
      view.style.justifyContent = "center";
      const mine = (awards || []).filter(a => (a.who || []).includes(pid));
      view.innerHTML = `<div class="pbig">خلصنا! 🎉</div><div class="pmid">مجموعك ${scores[pid] || 0} نقطة · ترتيبك #${rankOf(pid)}</div>
        ${mine.length ? `<div class="pawards">${mine.map(a => `<div class="pa">${a.em} ${esc(a.title)}</div>`).join("")}</div>` : `<div class="pmuted">شكراً إنك لعبت 😄</div>`}`;
    }
    if (!["write", "vote"].includes(ph)) view.style.justifyContent = "center";
  }

  function updateDynamic() {
    const ph = S.phase;
    if (ph === "lobby" && $("cnt")) $("cnt").textContent = `${Object.keys(players).length} دخلوا لحد دلوقتي`;
    if (ph === "write" && $("lie")) {
      const sent = !!(myLie && myLie.final), inp = $("lie");
      inp.disabled = sent;
      $("send").textContent = sent ? "عدّل ✏️" : "ابعت 😈";
      $("send").className = "btn pbtn" + (sent ? " ghost" : "");
      let m = "";
      if (sent) m = `<div class="pmsg ok">اتبعت ✅ استنى الباقيين…</div>`;
      else if (rej) m = `<div class="pmsg warn">🙈 انت كتبت الحقيقة! برافو… بس اكتب كدبة تانية</div>`;
      if ($("msg").innerHTML !== m) $("msg").innerHTML = m;
    }
    if (ph === "vote" && $("pv")) {
      view.querySelectorAll("#pv button").forEach(b => b.classList.toggle("sel", myVote !== null && myVote !== undefined && +b.dataset.i === myVote));
      const m = (myVote !== null && myVote !== undefined) ? `<div class="pmsg ok">تمام ✅ تقدر تغيّر لحد ما الوقت يخلص</div>` : "";
      if ($("msg").innerHTML !== m) $("msg").innerHTML = m;
    }
  }

  setInterval(() => {
    if (!S || !S.endsAt || !["write", "vote"].includes(S.phase)) return;
    const bar = $("tbar"); if (!bar) return;
    const total = S.phase === "write" ? 50000 : 30000;
    const left = Math.max(0, S.endsAt - db.now());
    bar.firstElementChild.style.width = Math.min(100, (left / total) * 100) + "%";
    bar.classList.toggle("hurry", left < 10000);
  }, 300);
})();
