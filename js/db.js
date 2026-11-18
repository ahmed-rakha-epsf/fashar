// طبقة البيانات: Firebase Realtime Database، أو «وضع التجربة» المحلي (BroadcastChannel)
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const USE_FIREBASE = !!(cfg.apiKey && cfg.databaseURL);

  function splitPath(p) { return (p || "").split("/").filter(Boolean); }
  function getAt(tree, path) {
    let cur = tree;
    for (const k of splitPath(path)) { if (cur == null || typeof cur !== "object") return null; cur = cur[k]; }
    return cur === undefined ? null : cur;
  }
  function setAt(tree, path, val) {
    const keys = splitPath(path);
    if (!keys.length) return (val && typeof val === "object") ? JSON.parse(JSON.stringify(val)) : {};
    let cur = tree;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (val === null || val === undefined) delete cur[last];
    else cur[last] = JSON.parse(JSON.stringify(val));
    return tree;
  }

  // ---------- Firebase ----------
  function FirebaseDB(room) {
    firebase.initializeApp(cfg);
    const fdb = firebase.database();
    const root = fdb.ref("rooms/" + room);
    let offset = 0;
    fdb.ref(".info/serverTimeOffset").on("value", s => { offset = s.val() || 0; });
    const ref = p => (splitPath(p).length ? root.child(splitPath(p).join("/")) : root);
    const errs = [], report = e => { console.error("Firebase:", e); errs.forEach(f => f(e)); };
    const guard = pr => pr.catch(e => { report(e); });
    return {
      mode: "firebase",
      set: (p, v) => guard(ref(p).set(v === undefined ? null : v)),
      update: obj => guard(root.update(obj)),
      remove: p => guard(ref(p).remove()),
      get: p => ref(p).once("value").then(s => s.val()).catch(e => { report(e); return null; }),
      on: (p, cb) => { const r = ref(p); const h = s => cb(s.val()); r.on("value", h, report); return () => r.off("value", h); },
      onError: f => errs.push(f),
      onStatus: f => {
        let seen = false;
        fdb.ref(".info/connected").on("value", s => { if (s.val() === true) { seen = true; f(true); } else if (seen) f(false); });
        setTimeout(() => { if (!seen) f(false); }, 6000);
      },
      now: () => Date.now() + offset,
      presence: pid => {
        fdb.ref(".info/connected").on("value", s => {
          if (s.val() === true) {
            const r = ref("players/" + pid + "/online");
            r.onDisconnect().set(false);
            r.set(true);
          }
        });
      }
    };
  }

  // ---------- وضع التجربة (نفس المتصفح) ----------
  function LocalDB(room, isServer) {
    const key = "fishar_local_" + room;
    const ch = new BroadcastChannel("fishar_" + room);
    let tree = {};
    if (isServer) { try { tree = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { tree = {}; } }
    const listeners = [];
    function notify() {
      for (const l of listeners) {
        const v = getAt(tree, l.path);
        const s = JSON.stringify(v);
        if (s !== l.last) { l.last = s; l.cb(v == null ? null : JSON.parse(s)); }
      }
    }
    function persistAndBroadcast() {
      try { localStorage.setItem(key, JSON.stringify(tree)); } catch (e) {}
      ch.postMessage({ type: "tree", tree });
    }
    function applyOp(op) {
      if (op.kind === "set") tree = setAt(tree, op.path, op.val);
      else if (op.kind === "update") for (const k in op.obj) tree = setAt(tree, k, op.obj[k]);
    }
    function doOp(op) {
      applyOp(op);
      notify();
      if (isServer) persistAndBroadcast(); else ch.postMessage({ type: "op", op });
      return Promise.resolve();
    }
    let gotTree = isServer; const statusFns = [];
    ch.onmessage = e => {
      const m = e.data || {};
      if (!isServer && m.type === "tree" && !gotTree) { gotTree = true; statusFns.forEach(f => f(true)); }
      if (isServer) {
        if (m.type === "op") { applyOp(m.op); notify(); persistAndBroadcast(); }
        else if (m.type === "hello") ch.postMessage({ type: "tree", tree });
      } else if (m.type === "tree") { tree = m.tree || {}; notify(); }
    };
    if (!isServer) ch.postMessage({ type: "hello" });
    return {
      mode: "local",
      set: (p, v) => doOp({ kind: "set", path: p, val: v === undefined ? null : v }),
      update: obj => doOp({ kind: "update", obj }),
      remove: p => doOp({ kind: "set", path: p, val: null }),
      get: p => Promise.resolve(getAt(tree, p)),
      on: (p, cb) => {
        const l = { path: p, cb, last: undefined };
        listeners.push(l);
        setTimeout(() => { const v = getAt(tree, p); l.last = JSON.stringify(v); cb(v == null ? null : JSON.parse(JSON.stringify(v))); }, 0);
        return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
      },
      now: () => Date.now(),
      presence: () => {},
      onError: () => {},
      onStatus: f => { statusFns.push(f); if (gotTree) f(true); else setTimeout(() => { if (!gotTree) f(false); }, 2500); },
      wipe: () => { tree = {}; notify(); persistAndBroadcast(); }
    };
  }

  window.DB = {
    USE_FIREBASE,
    connect(room, isServer) { return USE_FIREBASE ? FirebaseDB(room) : LocalDB(room, isServer); }
  };
})();
