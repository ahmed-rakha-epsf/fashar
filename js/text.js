// تنظيف ومقارنة النصوص العربي
(function () {
  function normalize(s) {
    if (!s) return "";
    s = String(s).toLowerCase();
    s = s.replace(/[ً-ٰٟـ]/g, ""); // تشكيل وتطويل
    s = s.replace(/[إأآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
    s = s.replace(/[^\p{L}\p{N}\s]/gu, " "); // علامات وإيموجي
    s = s.split(/\s+/).filter(Boolean).map(w => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w)).join("");
    return s;
  }

  // شكل العرض: نشيل الإيموجي والعلامات الزيادة والمسافات
  function clean(s) {
    if (!s) return "";
    s = String(s).replace(/[\p{Extended_Pictographic}️‍]/gu, "");
    s = s.replace(/[!؟?.,،؛;:"'«»()\[\]{}*_~`|\\/<>@#$%^&+=]+/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    return s.slice(0, 25);
  }

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  // هل الكدبة دي هي الحقيقة؟
  function isTruth(text, q) {
    const n = normalize(text);
    if (!n) return false;
    const accepted = [q.truth].concat(q.accept || []).map(normalize);
    if (accepted.includes(n)) return true;
    if ((q.keywords || []).map(normalize).some(k => k && n.includes(k))) return true;
    if (n.length > 4 && accepted.some(a => lev(a, n) <= 1)) return true;
    return false;
  }

  window.TXT = { normalize, clean, isTruth };
})();
