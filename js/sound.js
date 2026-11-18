// أصوات بسيطة بالـ WebAudio (من غير ملفات)
(function () {
  let ctx = null, muted = false;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, when) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, when) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + (when || 0);
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(i / 380));
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500;
    const g = c.createGain(); g.gain.setValueAtTime(vol || 0.25, t); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  }
  window.SFX = {
    unlock: ac,
    setMuted(m) { muted = m; },
    isMuted: () => muted,
    tick() { tone(1200, 0.06, "square", 0.08); },
    join() { tone(660, 0.1, "sine", 0.15); tone(990, 0.12, "sine", 0.15, 0.08); },
    pop() { tone(420, 0.08, "triangle", 0.2); tone(840, 0.08, "triangle", 0.12, 0.05); },
    voter() { tone(300 + Math.random() * 200, 0.07, "triangle", 0.15); },
    stamp() { tone(140, 0.25, "sawtooth", 0.2); noise(0.15, 0.25); },
    laugh() { [0, .13, .26, .39].forEach((w, i) => tone(520 - i * 40, 0.1, "square", 0.08, w)); },
    drum() { for (let i = 0; i < 18; i++) noise(0.07, 0.18 + i * 0.012, i * 0.075); },
    ding() { tone(880, 0.5, "sine", 0.22); tone(1320, 0.6, "sine", 0.15, 0.12); tone(1760, 0.7, "sine", 0.1, 0.24); },
    fanfare() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, "triangle", 0.18, i * 0.14)); },
    // صوت «غلط!» لما الكدبة تتكشف
    buzz() { tone(110, 0.45, "sawtooth", 0.16); tone(92, 0.45, "sawtooth", 0.12, 0.02); noise(0.2, 0.15); },
    whoosh() { const c = ac(); if (!c || muted) return; const t = c.currentTime; const o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.22); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.3); },
    coin() { tone(988, 0.08, "square", 0.08); tone(1319, 0.25, "square", 0.08, 0.08); },
    tada() { [523, 659, 784].forEach((f, i) => tone(f, 0.18, "triangle", 0.16, i * 0.09)); tone(1046, 0.7, "triangle", 0.2, 0.3); tone(1568, 0.7, "sine", 0.08, 0.3); },
    heart() { tone(70, 0.12, "sine", 0.35); tone(62, 0.14, "sine", 0.3, 0.16); }
  };
})();
