// قسم «إزاي نلعب؟»: شرايح بصور حقيقية من اللعبة (مثال الكاتشب)
// الصور في img/howto — اتصوّرت من لعبة تجريبية بـ 4 لاعيبة
(function () {
  const IMG = "img/howto/";
  const SLIDES = [
    {
      t: "الفكرة ✍️",
      d: `هتظهر على الشاشة <b>معلومة حقيقية 100%</b>… بس فيها كلمة ناقصة مكانها نقط <span class="hdots">……</span><br><br>
          كل واحد يكتب على موبايله <b>كدبة</b> تكمّل الجملة وتبان حقيقية، عشان يضحك بيها على الباقيين.`,
      host: "h_write", phone: "p_write", cap: "سارة كتبت «مربى»… هل هتصدّقوها؟"
    },
    {
      t: "كتبت الإجابة الصح بالغلط؟ 🙈",
      d: `لو حد كتب الحقيقة، حتى لو بإملا مختلف (دواء = دوا)، الموبايل بيقوله:<br>
          <b>احفظها واختارها بعدين</b>… ودلوقتي اكتب كدبة غيرها.<br><br>
          عشان كده الحقيقة عمرها ما بتظهر مرتين.`,
      phone: "p_reject", cap: "أحمد كتب «دواء» وهي فعلاً الإجابة الصح"
    },
    {
      t: "دوّر على الحقيقة 🕵️",
      d: `كل الكدب بيظهر <b>ومعاه الحقيقة</b> متلخبطين مع بعض.<br><br>
          كل واحد يختار اللي شايفه <b>صح</b> من موبايله.<br>
          كدبتك نفسها مش هتقدر تختارها 😏`,
      host: "h_vote", phone: "p_vote", cap: "سارة اختارت «دوا»… وكدبتها «مربى» مقفولة عليها"
    },
    {
      t: "الكشف: كدبة ضحكت على ناس 😂",
      d: `المذيع بيكشف كل إجابة الناس اختاروها: <b>كدبة ولا حقيقة؟</b><br><br>
          لو كدبة، بيبان مين اللي صدّقها ومين اللي كتبها.<br>
          صاحب الكدبة ياخد <b class="g">+2</b> عن كل واحد صدّقه.`,
      host: "h_rv_busted", phone: "p_busted", cap: "كريم ومنى صدّقوا «مربى» ← سارة خدت +4"
    },
    {
      t: "كدبات محدش صدّقها 😅",
      d: `الكدب اللي محدش اختاره بيظهر كله مرة واحدة.<br><br><b>مفيهوش نقط</b>… المرة الجاية اكتب حاجة أقنع!`,
      host: "h_rv_nobody", cap: "«صابون» و«منظف» محدش صدّقهم"
    },
    {
      t: "والحقيقة! ✅",
      d: `في الآخر 🥁 الحقيقة بتظهر ومعاها <b>القصة الحقيقية</b> ورا المعلومة.<br><br>
          اللي لقاها ياخد <b class="g">+1</b>.`,
      host: "h_rv_truth", phone: "p_truth", cap: "الكاتشب كان بيتباع «دوا» فعلاً!"
    },
    {
      t: "النقط 🧮",
      pts: true,
      host: "h_scores", cap: "سارة: 4 من «مربى» + 1 عشان لقت الحقيقة = 5"
    },
    {
      t: "👑 اصطاد المتصدر",
      d: `من تاني سؤال، اللي في المركز الأول بيتعلّم عليه 👑<br><br>
          لو المتصدر صدّق كدبتك تاخد <b class="y">+3 بونص</b> فوق نقطك.<br>
          يعني الكل بيحاول يوقعه… والمتصدر لازم يركّز!`,
      host: "h_hunt", phone: "p_hunt", cap: "الكل بيحاول يضحك على سارة"
    },
    {
      t: "المتصدر وقع في الفخ 🎯",
      d: `كريم كتب «النوم»، وصدّقته سارة (المتصدرة) ومنى:<br><br>
          2 صدّقوه × 2 = <b class="g">4</b><br>+ بونص المتصدر <b class="y">3</b><br>= <b class="g">7 نقط</b> وطلع الأول 🚀`,
      host: "h_rv_hunt"
    },
    {
      t: "آخر سؤال 🔥 النقط ×2",
      d: `المذيع بيقرر إمتى آخر سؤال، وفيه <b>كل النقط بتتضاعف</b>:<br><br>
          كل واحد صدّقك = <b class="g">+4</b><br>لقيت الحقيقة = <b class="g">+2</b><br>(بونص المتصدر يفضل <b class="y">+3</b>)<br><br>
          يعني أي حد لسه يقدر يكسب!`,
      host: "h_last"
    },
    {
      t: "الجوايز 🏆",
      d: `في الآخر بنعلن الجوايز واحدة واحدة:<br><br>
          😈 <b>أكبر فشّار</b>: أكتر واحد صدّقوا كدبه<br>
          🕵️ <b>كاشف الكدب</b>: أكتر واحد لقى الحقيقة<br>
          🤍 <b>أطيب قلب</b>: أكتر واحد صدّق كدب زمايله<br>
          🏆 <b>بطل الفشّار</b>: أعلى نقط`,
      host: "h_champ"
    },
    { t: "يلا بينا! 🚀", end: true }
  ];

  let el = null, i = 0, open = false;
  const ptsHTML = `<div class="ho-pts">
      <div><span>😈</span><span>كل واحد صدّق كدبتك</span><b class="g">+2</b></div>
      <div><span>✅</span><span>لقيت الحقيقة</span><b class="g">+1</b></div>
      <div><span>🎯</span><span>المتصدر 👑 صدّق كدبتك</span><b class="y">+3 بونص</b></div>
      <div><span>🔥</span><span>آخر سؤال</span><b class="y">النقط ×2</b></div>
    </div>
    <div class="ho-note">الكدب أهم من الحقيقة… الفشّار الشاطر هو اللي بيكسب 😈</div>`;

  function render() {
    const s = SLIDES[i];
    const imgs = (s.host ? `<div class="ho-screen"><img src="${IMG + s.host}.jpg" alt=""></div>` : "") +
      (s.phone ? `<div class="ho-phone"><img src="${IMG + s.phone}.jpg" alt=""></div>` : "");
    const body = s.end
      ? `<div class="ho-end"><div class="ho-big">جاهزين؟ 😈</div><div class="ho-d">افتكروا: <b>اكتبوا كدبة تبان حقيقية</b>… واختاروا اللي شايفينه <b>صح</b></div>
          <button class="btn huge" id="hoClose2">يلا نرجع ونبدأ 🚀</button></div>`
      : `<div class="ho-text"><div class="ho-d">${s.pts ? ptsHTML : s.d}</div>${s.cap ? `<div class="ho-cap">📸 ${s.cap}</div>` : ""}</div>
         <div class="ho-imgs ${s.host && s.phone ? "both" : ""}">${imgs}</div>`;
    el.innerHTML = `<div class="ho-box">
        <div class="ho-head"><div class="ho-step">${i + 1} / ${SLIDES.length}</div><div class="ho-t">${s.t}</div><button class="btn small ghost" id="hoX">✕ قفل الشرح</button></div>
        <div class="ho-body">${body}</div>
        <div class="ho-nav">
          <button class="btn ghost" id="hoPrev" ${i === 0 ? "disabled" : ""}>→ اللي قبله</button>
          <div class="ho-dots">${SLIDES.map((_, k) => `<i class="${k === i ? "on" : k < i ? "past" : ""}" data-k="${k}"></i>`).join("")}</div>
          ${s.end ? `<span></span>` : `<button class="btn huge" id="hoNext">اللي بعده ←</button>`}
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
  window.addEventListener("load", () => setTimeout(() => SLIDES.forEach(s => [s.host, s.phone].forEach(n => { if (n) new Image().src = IMG + n + ".jpg"; })), 1500));

  window.HOWTO = { open: show, close, isOpen: () => open };
})();
