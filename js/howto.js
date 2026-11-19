// قسم «إزاي نلعب؟»: صور حقيقية من اللعبة (مثال الكاتشب) وعليها أسهم وكلمات قصيرة
// الصور في img/howto، وأماكن الأسهم في js/howto_marks.js (الاتنين بيتعملوا من سكريبت التصوير)
(function () {
  const IMG = "img/howto/", VER = "?v=11191358";
  const SLIDES = [
    { t: "<span class=ho-n>1</span> اكتب كدبة ✍️", shots: ["h_write", "p_write"] },
    { t: "<span class=ho-n>2</span> دوّر على الحقيقة 🕵️", shots: ["h_vote", "p_vote"] },
    { t: "<span class=ho-n>3</span> الكشف: مين ضحك على مين 😂", shots: ["h_rv_busted"] },
    { t: "<span class=ho-n>4</span> والحقيقة ✅", shots: ["h_rv_truth"] },
    { t: "👑 اصطاد المتصدر", shots: ["h_rv_hunt"] },
    { t: "🔥 آخر سؤال", shots: ["h_last"] },
    { t: "النقط 🧮", pts: true },
    { t: "يلا بينا! 🚀", end: true }
  ];

  const ptsHTML = `<div class="ho-pts">
      <div><span>😈</span><span>كل واحد صدّق كدبتك</span><b class="g">+2</b></div>
      <div><span>✅</span><span>لقيت الحقيقة</span><b class="g">+1</b></div>
      <div><span>🎯</span><span>المتصدر 👑 صدّق كدبتك</span><b class="y">+3 بونص</b></div>
      <div><span>🔥</span><span>آخر سؤال</span><b class="y">كل النقط ×2</b></div>
    </div>`;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function shot(n) {
    const phone = n.startsWith("p_");
    const marks = ((window.HOWTO_MARKS || {})[n] || []).map((m, k) =>
      `<div class="hm" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%;animation-delay:${300 + k * 350}ms">
         <div class="hm-lab ${m.p}">${esc(m.l)}</div></div>`).join("");
    return `<div class="shot ${phone ? "phone" : "screen"}"><img src="${IMG + n}.jpg${VER}" alt="">${marks}</div>`;
  }

  let el = null, i = 0, open = false;
  function render() {
    const s = SLIDES[i];
    let body;
    if (s.end) body = `<div class="ho-end"><div class="ho-big">جاهزين؟ 😈</div><button class="btn huge" id="hoClose2">يلا نرجع ونبدأ 🚀</button></div>`;
    else if (s.pts) body = `<div class="ho-ptswrap">${ptsHTML}</div>`;
    else body = `<div class="ho-imgs">${s.shots.map(shot).join("")}</div>`;
    el.innerHTML = `<div class="ho-box">
        <div class="ho-head"><div class="ho-t">${s.t}</div><button class="btn small ghost" id="hoX">✕ قفل الشرح</button></div>
        <div class="ho-body">${body}</div>
        <div class="ho-nav">
          <button class="btn ghost" id="hoPrev" ${i === 0 ? "disabled" : ""}>→ اللي قبله</button>
          <div class="ho-dots">${SLIDES.map((_, k) => `<i class="${k === i ? "on" : k < i ? "past" : ""}" data-k="${k}"></i>`).join("")}</div>
          ${s.end ? `<span style="width:120px"></span>` : `<button class="btn huge" id="hoNext">اللي بعده ←</button>`}
        </div></div>`;
    el.querySelector("#hoX").onclick = close;
    el.querySelector("#hoPrev").onclick = () => go(-1);
    if (el.querySelector("#hoNext")) el.querySelector("#hoNext").onclick = () => go(1);
    if (el.querySelector("#hoClose2")) el.querySelector("#hoClose2").onclick = close;
    el.querySelectorAll(".ho-dots i").forEach(d => d.onclick = () => { i = +d.dataset.k; render(); });
  }
  function go(d) { i = Math.max(0, Math.min(SLIDES.length - 1, i + d)); render(); }
  function show() {
    if (!el) { el = document.createElement("div"); el.className = "howto-ov"; document.body.appendChild(el); }
    i = 0; open = true; el.classList.remove("hidden"); render();
  }
  function close() { open = false; if (el) el.classList.add("hidden"); }

  document.addEventListener("keydown", e => {
    if (!open) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft" || e.key === " " || e.key === "PageDown") { if (i === SLIDES.length - 1) close(); else go(1); }
    else if (e.key === "ArrowRight" || e.key === "PageUp") go(-1);
  }, true);

  // نحمّل الصور بدري عشان التقليب يبقى سريع
  window.addEventListener("load", () => setTimeout(() => SLIDES.forEach(s => (s.shots || []).forEach(n => { new Image().src = IMG + n + ".jpg" + VER; })), 1500));

  window.HOWTO = { open: show, close, isOpen: () => open };
})();
