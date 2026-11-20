// نافذة «⚙️ الأسئلة»: المذيع يختار أسئلة اللعبة وترتيبها (بتتحفظ في المتصفح)
// اللي متعلّم عليه = أسئلة اللعبة بالترتيب، وآخر واحد فيهم هو «آخر سؤال ×2»
// اللي مش متعلّم عليه = احتياطي (بيُستخدم بس في «سؤال تاني 🔄» أو «سؤال زيادة 🔁»)
(function () {
  const Q = window.QUESTIONS;
  const KEY = "fishar_qcfg";
  const ids = Q.map(q => q.id);
  const idx = id => ids.indexOf(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const defaults = () => ({ order: ids.slice(), off: Q.filter(q => q.reserve).map(q => q.id) });

  function load() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
    if (!c || !Array.isArray(c.order)) c = defaults();
    // أسئلة جديدة اتضافت للبنك تتحط في الآخر، واللي اتشال يتشال
    c.order = c.order.filter(id => ids.includes(id)).concat(ids.filter(id => !c.order.includes(id)));
    c.off = (c.off || []).filter(id => ids.includes(id));
    return c;
  }
  let C = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(C)); } catch (e) { } };

  let getUsed = () => [];
  const plan = () => C.order.filter(id => !C.off.includes(id)).map(idx);
  function nextQ(used) {
    for (const i of plan()) if (!used.includes(i)) return i;
    for (const id of C.order) { const i = idx(id); if (!used.includes(i)) return i; }
    return Math.floor(Math.random() * Q.length);
  }
  const plannedLeft = used => plan().filter(i => !used.includes(i)).length;

  // ---------- النافذة ----------
  let el = null, open = false, showTruth = false;
  const blank = p => esc(p).replace(/_{2,}/, '<span class="hdots">……</span>');

  function render() {
    const used = getUsed();
    const on = C.order.filter(id => !C.off.includes(id));
    const lastOn = on[on.length - 1];
    // نفس الإجابة في سؤالين متعلّم عليهم
    const seen = {}, dup = new Set();
    on.forEach(id => { const t = Q[idx(id)].truth; if (seen[t]) { dup.add(t); } seen[t] = 1; });
    let n = 0;
    const rows = C.order.map((id, k) => {
      const q = Q[idx(id)], isOn = !C.off.includes(id), wasUsed = used.includes(idx(id));
      const num = isOn ? ++n : "";
      return `<div class="qs-row ${isOn ? "on" : "off"} ${wasUsed ? "used" : ""}" data-id="${id}">
        <label class="qs-chk"><input type="checkbox" ${isOn ? "checked" : ""} data-act="tog"><span></span></label>
        <div class="qs-num">${num}</div>
        <div class="qs-q">${blank(q.prompt)}
          ${showTruth ? `<span class="qs-t">← ${esc(q.truth)}</span>` : ""}
          ${dup.has(q.truth) && isOn && showTruth ? `<span class="qs-warn">⚠️ نفس الإجابة متكررة</span>` : ""}
          ${id === lastOn ? `<span class="qs-badge">🔥 آخر سؤال ×2</span>` : ""}
          ${wasUsed ? `<span class="qs-badge used">✔ اتسأل</span>` : ""}
          ${!isOn ? `<span class="qs-badge res">احتياطي</span>` : ""}</div>
        <div class="qs-mv"><button class="btn small ghost" data-act="up" ${k === 0 ? "disabled" : ""}>▲</button><button class="btn small ghost" data-act="down" ${k === C.order.length - 1 ? "disabled" : ""}>▼</button></div>
      </div>`;
    }).join("");
    el.innerHTML = `<div class="qs-box">
      <div class="qs-head">
        <div class="qs-title">⚙️ أسئلة اللعبة</div>
        <div class="qs-sum">في اللعبة <b>${on.length}</b> سؤال${on.length ? ` · حوالي <b>${Math.round(on.length * 2.7)}</b> دقيقة` : ""}</div>
        <button class="btn small ghost" id="qsX">✕ قفل</button>
      </div>
      <div class="qs-tools">
        <button class="btn small ghost" id="qsShuf">🎲 رتّب عشوائي</button>
        <button class="btn small ghost" id="qsAll">✔ علّم على الكل</button>
        <button class="btn small ghost" id="qsNone">✖ شيل الكل</button>
        <button class="btn small ghost" id="qsReset">↺ الترتيب الأصلي</button>
        <button class="btn small ${showTruth ? "" : "ghost"}" id="qsTruth">${showTruth ? "🙈 خبّي الإجابات" : "👁 اظهر الإجابات"}</button>
        <span class="qs-tip">⚠️ متفتحش الإجابات وانت عامل شير سكرين</span>
      </div>
      <div class="qs-help">علّم على الأسئلة اللي عايزها ورتّبها بـ ▲▼ أو اسحبها. اللي مش متعلّم عليه بيبقى احتياطي لزرار «سؤال تاني 🔄».</div>
      <div class="qs-list">${rows}</div>
      <div class="qs-foot"><button class="btn huge" id="qsOk">تمام ✓</button></div>
    </div>`;
    el.querySelector("#qsX").onclick = close;
    el.querySelector("#qsOk").onclick = close;
    el.querySelector("#qsShuf").onclick = () => { const o = C.order.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } C.order = o; save(); render(); };
    el.querySelector("#qsAll").onclick = () => { C.off = []; save(); render(); };
    el.querySelector("#qsNone").onclick = () => { C.off = ids.slice(); save(); render(); };
    el.querySelector("#qsReset").onclick = () => { C = defaults(); save(); render(); };
    el.querySelector("#qsTruth").onclick = () => { showTruth = !showTruth; render(); };
    el.querySelectorAll(".qs-row").forEach(row => {
      const id = row.dataset.id;
      row.querySelectorAll("[data-act]").forEach(b => b.onclick = b.onchange = e => {
        const act = b.dataset.act, k = C.order.indexOf(id);
        if (act === "tog") { if (e.type !== "change") return; C.off = b.checked ? C.off.filter(x => x !== id) : C.off.concat([id]); }
        if (act === "up" && k > 0) [C.order[k - 1], C.order[k]] = [C.order[k], C.order[k - 1]];
        if (act === "down" && k < C.order.length - 1) [C.order[k + 1], C.order[k]] = [C.order[k], C.order[k + 1]];
        save(); render();
      });
      // سحب وإفلات
      row.draggable = true;
      row.ondragstart = e => { e.dataTransfer.setData("text/plain", id); row.classList.add("drag"); };
      row.ondragend = () => row.classList.remove("drag");
      row.ondragover = e => { e.preventDefault(); row.classList.add("over"); };
      row.ondragleave = () => row.classList.remove("over");
      row.ondrop = e => {
        e.preventDefault(); row.classList.remove("over");
        const from = e.dataTransfer.getData("text/plain"); if (!from || from === id) return;
        const o = C.order.filter(x => x !== from); o.splice(o.indexOf(id), 0, from); C.order = o; save(); render();
      };
    });
  }
  function show() {
    if (!el) { el = document.createElement("div"); el.className = "qs-ov"; document.body.appendChild(el); }
    C = load(); showTruth = false; open = true; el.classList.remove("hidden"); render();
  }
  function close() { open = false; if (el) el.classList.add("hidden"); if (window.QSET.onClose) window.QSET.onClose(); }
  document.addEventListener("keydown", e => {
    if (!open || /INPUT/.test(e.target.tagName) && e.key !== "Escape") return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if ([" ", "ArrowLeft", "ArrowRight", "PageDown"].includes(e.key)) { e.stopPropagation(); }
  }, true);

  window.QSET = { init(fn) { getUsed = fn; }, nextQ, plan, plannedLeft, open: show, close, isOpen: () => open, onClose: null };
})();
