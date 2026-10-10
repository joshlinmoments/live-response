// ═══════════════════════════════════════════════════════════
// 即時回應系統 — 主程式（三介面共用）
//   #host / #host-<場次>     → 主持介面（控制台，私人裝置）
//   #screen / #screen-<場次> → 投影介面（大畫面，無按鈕）
//   其餘                      → 手機介面（學員作答）
// 資料流：主持端寫 config；學員端 push responses；三端 onSnapshot 即時同步
// ═══════════════════════════════════════════════════════════
(function () {
  "use strict";

  const hash = location.hash || "";
  const ROLE = /^#host(-|$)/.test(hash) ? "host"
            : /^#screen(-|$)/.test(hash) ? "screen"
            : "join";

  let config = null;
  const responsesCache = {};        // id -> {q,text,name,ts}
  const screenRendered = new Set();  // 投影牆已渲染的卡片 id

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const activeIdx = () => (config && typeof config.activeIndex === "number") ? config.activeIndex : -1;

  function joinUrl() {
    const base = location.origin + location.pathname;
    return (ROOM && ROOM !== "main") ? base + "?room=" + encodeURIComponent(ROOM) : base;
  }
  function screenUrl() {
    const base = location.origin + location.pathname;
    return base + "#screen" + (ROOM && ROOM !== "main" ? "-" + ROOM : "");
  }
  function makeQR(el, size) {
    if (!el || typeof QRCode === "undefined") return;
    el.innerHTML = "";
    new QRCode(el, { text: joinUrl(), width: size, height: size, colorDark: "#2B2520", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  }

  // ---------- config 監聽 ----------
  CONFIG_REF.on("value", (snap) => {
    const val = snap.val();
    if (!val) {
      if (ROLE === "host") { CONFIG_REF.set(DEFAULT_CONFIG); config = DEFAULT_CONFIG; }
      else config = null;
    } else {
      config = val;
      if (!Array.isArray(config.questions)) config.questions = [];
    }
    render();
  });
  function patchConfig(patch) { return CONFIG_REF.update(patch); }

  function render() {
    if (ROLE === "host") renderHost();
    else if (ROLE === "screen") renderScreen();
    else renderJoin();
  }

  // ════════════════════════════════════════════════════════
  //  ①  手機介面（學員）
  // ════════════════════════════════════════════════════════
  let sentThisQuestion = false, lastIdxJoin = -99;

  function renderJoin() {
    $("#view-join").hidden = false; $("#view-host").hidden = true; $("#view-screen").hidden = true;
    const body = $("#join-body");
    if (!config) { body.innerHTML = waitingHtml("正在連線…", "Connecting…"); return; }

    const idx = activeIdx();
    const q = (config.questions || [])[idx];
    if (idx !== lastIdxJoin) { sentThisQuestion = false; lastIdxJoin = idx; }

    if (!q) { body.innerHTML = waitingHtml("請稍候片刻", "Please wait — the next question is on its way"); return; }
    if (config.accepting === false) {
      body.innerHTML = questionHtml(idx, q) +
        `<div class="hint">本題暫停收集中，講師開放後即可作答。<br><span class="en">Submissions are paused for now.</span></div>`;
      return;
    }
    if (sentThisQuestion) { body.innerHTML = sentHtml(); $("#again").onclick = () => { sentThisQuestion = false; renderJoin(); }; return; }
    body.innerHTML = questionHtml(idx, q) + answerFormHtml();
    bindForm(idx);
  }

  function questionHtml(idx, q) {
    return `<div class="qcard"><span class="qbadge">Q${idx + 1}</span>
      <h2 class="qtext">${esc(q.zh)}</h2>${q.en ? `<div class="qtext-en">${esc(q.en)}</div>` : ""}</div>`;
  }
  function answerFormHtml() {
    return `<div class="answer-area">
      <textarea id="ans" maxlength="300" placeholder="把你的想法打在這裡…"></textarea>
      <div class="counter"><span id="cc">0</span>/300</div>
      <div class="row mt"><input id="nick" maxlength="16" placeholder="暱稱（可留白＝匿名）" /></div>
      <button class="btn block jade" id="send" style="margin-top:14px">送出 · Send</button>
      <div class="hint">可以送出多則；換題時畫面會自動更新。</div></div>`;
  }
  function sentHtml() {
    return `<div class="sent-box">
      <div class="sent-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>
      <div class="sent-title">已送出，謝謝你！</div>
      <div class="hint" style="font-size:15px">你的回應已經出現在大螢幕上。<br><span class="en">Your response is now on the big screen.</span></div>
      <button class="btn jade" id="again" style="margin-top:20px">再補一則 · Add another</button></div>`;
  }
  function waitingHtml(zh, en) {
    return `<div class="waiting"><div style="font-family:var(--font-cjk);font-weight:900;font-size:26px;color:var(--jade-d)">${esc(zh)}</div>
      <div class="en" style="margin-top:6px">${esc(en)}</div><div class="dots"><i></i><i></i><i></i></div></div>`;
  }
  function bindForm(idx) {
    const ans = $("#ans"), cc = $("#cc"), send = $("#send");
    const saved = ssGet("nick"); if (saved) $("#nick").value = saved;
    ans.addEventListener("input", () => { cc.textContent = ans.value.length; });
    ans.focus();
    send.addEventListener("click", async () => {
      const text = ans.value.trim();
      if (!text) { ans.focus(); ans.style.borderColor = "var(--vermilion)"; return; }
      const name = $("#nick").value.trim().slice(0, 16);
      ssSet("nick", name);
      send.disabled = true; send.textContent = "送出中…";
      try {
        await RESP_REF.push({ q: idx, text: text.slice(0, 300), name: name || "", ts: Date.now() });
        sentThisQuestion = true; renderJoin();
      } catch (e) { send.disabled = false; send.textContent = "送出 · Send"; alert("送出失敗，請確認網路後再試一次。"); }
    });
  }

  // ════════════════════════════════════════════════════════
  //  ②  投影介面（大畫面，無控制）
  // ════════════════════════════════════════════════════════
  let lastIdxScreen = -99, qrChipDone = false;

  function renderScreen() {
    $("#view-screen").hidden = false; $("#view-host").hidden = true; $("#view-join").hidden = true;
    if (!config) { $("#s-stage").innerHTML = `<div class="idle-stage"><div class="big title-fx outlined">連線中…</div></div>`; return; }

    $("#s-brand-zh").textContent = config.title || "即時回應";
    $("#s-brand-en").textContent = config.titleEn || "";
    if (!qrChipDone) { makeQR($("#s-qrchip"), 112); qrChipDone = true; }

    const idx = activeIdx();
    if (idx !== lastIdxScreen) { screenRendered.clear(); $("#s-wall").innerHTML = ""; lastIdxScreen = idx; }
    const q = (config.questions || [])[idx];

    const stage = $("#s-stage");
    if (!q) {
      stage.innerHTML = `<div class="idle-stage big-qr">
        <div class="big title-fx outlined">${esc(config.title || "準備開始")}</div>
        <div class="idle-en en">${esc(config.titleEn || "Let's begin")}</div>
        <div class="big-qr-box"><div id="s-bigqr"></div><div class="scan-label"><b>掃碼加入作答</b><span class="en">Scan to join</span></div></div>
      </div>`;
      makeQR($("#s-bigqr"), 300);
    } else {
      stage.innerHTML = `<div class="q-display">
        <div class="q-num">${idx + 1}<small>QUESTION</small></div>
        <div class="q-main"><h1 class="q-zh">${esc(q.zh)}</h1>${q.en ? `<div class="q-en">${esc(q.en)}</div>` : ""}</div></div>`;
    }
    $("#s-qrwrap").hidden = (idx < 0); // 題目進行中才在角落顯示小 QR
    renderScreenWall();

    // 放大投影 QR（由主持端 showQR 控制）
    const ov = $("#s-qr-ov");
    if (config.showQR) { ov.hidden = false; makeQR($("#s-qr-ovbox"), 360); $("#s-qr-ovurl").textContent = joinUrl(); }
    else ov.hidden = true;
  }

  function renderScreenWall() {
    const wall = $("#s-wall");
    const idx = activeIdx();
    if (config.reveal === false) {
      wall.innerHTML = `<div class="wall-empty"><div style="font-family:var(--font-cjk);font-weight:900;font-size:30px;color:var(--jade-d)">留言牆暫時收起</div><div class="en" style="margin-top:8px;font-size:20px">Wall is hidden</div></div>`;
      screenRendered.clear(); return;
    }
    const items = Object.entries(responsesCache).filter(([, r]) => r.q === idx).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
    if (items.length === 0) {
      if (!wall.querySelector(".wcard")) wall.innerHTML = `<div class="wall-empty"><div style="font-family:var(--font-cjk);font-weight:900;font-size:28px;color:var(--ink-soft)">等待大家的回應…</div><div class="en" style="margin-top:8px;font-size:20px">Responses appear here live</div></div>`;
      return;
    }
    if (!wall.querySelector(".wcard")) { wall.innerHTML = ""; screenRendered.clear(); }
    items.forEach(([id, r]) => {
      if (screenRendered.has(id)) return;
      screenRendered.add(id);
      const el = document.createElement("div");
      el.className = "wcard c" + (hashInt(id) % 5);
      el.innerHTML = `<div class="txt">${esc(r.text)}</div><div class="who">— <b>${esc(r.name && r.name.trim() ? r.name : "匿名夥伴")}</b></div>`;
      wall.appendChild(el);
    });
  }

  // ════════════════════════════════════════════════════════
  //  ③  主持介面（控制台）
  // ════════════════════════════════════════════════════════
  function renderHost() {
    $("#view-host").hidden = false; $("#view-screen").hidden = true; $("#view-join").hidden = true;
    if (!config) return;

    $("#h-brand-zh").textContent = config.title || "即時回應";
    $("#h-brand-en").textContent = config.titleEn || "";
    const qs = config.questions || [], idx = activeIdx();

    $("#h-room").textContent = (ROOM && ROOM !== "main") ? ("場次 " + ROOM) : "場次 main";
    $("#h-qpos").innerHTML = idx >= 0 ? `第 <b>${idx + 1}</b>/${qs.length} 題` : `共 ${qs.length} 題`;

    // 目前題目預覽
    const now = $("#h-now");
    if (idx < 0 || !qs[idx]) {
      now.innerHTML = `<div class="now-idle">尚未開始　<span class="en">Not started</span></div>`;
    } else {
      now.innerHTML = `<div class="now-q"><span class="now-badge">Q${idx + 1}</span><div><div class="now-zh">${esc(qs[idx].zh)}</div>${qs[idx].en ? `<div class="now-en en">${esc(qs[idx].en)}</div>` : ""}</div></div>`;
    }

    $("#h-prev").disabled = idx <= 0;
    $("#h-next").disabled = idx >= qs.length - 1;
    $("#h-start").hidden = idx >= 0;
    $("#h-stepwrap").hidden = idx < 0;
    $("#h-accept").checked = config.accepting !== false;
    $("#h-reveal").checked = config.reveal !== false;
    $("#h-showqr").checked = !!config.showQR;

    makeQR($("#h-qr"), 128);
    $("#h-joinurl").textContent = joinUrl();

    renderModList();
  }

  function renderModList() {
    const box = $("#h-modlist"); if (!box || !config) return;
    const idx = activeIdx();
    const items = Object.entries(responsesCache).filter(([, r]) => r.q === idx).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    $("#h-count2").textContent = items.length;
    if (idx < 0) { box.innerHTML = `<div class="mod-empty">開始題目後，學員回應會顯示在這裡。</div>`; return; }
    if (items.length === 0) { box.innerHTML = `<div class="mod-empty">尚無回應。</div>`; return; }
    box.innerHTML = items.map(([id, r]) =>
      `<div class="modrow"><div class="modtxt">${esc(r.text)}<span class="modwho">— ${esc(r.name && r.name.trim() ? r.name : "匿名")}</span></div>
       <button class="modx" data-del="${esc(id)}" title="移除">✕</button></div>`).join("");
  }

  // ---------- 回應監聽 ----------
  RESP_REF.on("child_added", (snap) => {
    responsesCache[snap.key] = snap.val();
    if (ROLE === "screen") renderScreenWall();
    else if (ROLE === "host") renderModList();
  });
  RESP_REF.on("child_removed", (snap) => {
    delete responsesCache[snap.key];
    screenRendered.delete(snap.key);
    if (ROLE === "screen") { const w = $("#s-wall"); if (w && !hasActiveCard()) { /* rebuild */ } renderScreenWall(); rebuildScreenWallIfNeeded(); }
    else if (ROLE === "host") renderModList();
  });
  function hasActiveCard(){ return false; }
  function rebuildScreenWallIfNeeded() {
    // 投影牆用增量渲染，刪除後整塊重建一次以移除該卡
    const wall = $("#s-wall"); if (!wall) return;
    screenRendered.clear(); wall.innerHTML = ""; renderScreenWall();
  }
  function hashInt(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  // ---------- 主持控制 ----------
  function stepTo(newIdx) { screenRendered.clear(); patchConfig({ activeIndex: newIdx }); }
  function wireHost() {
    $("#h-prev").addEventListener("click", () => { if (activeIdx() > 0) stepTo(activeIdx() - 1); });
    $("#h-next").addEventListener("click", () => { if (activeIdx() < config.questions.length - 1) stepTo(activeIdx() + 1); });
    $("#h-start").addEventListener("click", () => patchConfig({ activeIndex: 0, accepting: true }));
    $("#h-accept").addEventListener("change", (e) => patchConfig({ accepting: e.target.checked }));
    $("#h-reveal").addEventListener("change", (e) => patchConfig({ reveal: e.target.checked }));
    $("#h-showqr").addEventListener("change", (e) => patchConfig({ showQR: e.target.checked }));
    $("#h-open-screen").addEventListener("click", () => window.open(screenUrl(), "_blank", "noopener"));
    $("#h-setup").addEventListener("click", openSetup);

    $("#h-clear").addEventListener("click", async () => {
      const idx = activeIdx(); if (idx < 0) return;
      if (!confirm(`清除「第 ${idx + 1} 題」的所有回應？此動作無法復原。`)) return;
      const ids = Object.entries(responsesCache).filter(([, r]) => r.q === idx).map(([k]) => k);
      const updates = {}; ids.forEach((k) => (updates[k] = null));
      await RESP_REF.update(updates);
    });
    $("#h-clear-all").addEventListener("click", async () => {
      if (!confirm("清除「所有題目」的全部回應？通常在換一場新課程前才需要。此動作無法復原。")) return;
      await RESP_REF.remove();
    });

    $("#h-modlist").addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-del");
      if (id) RESP_REF.child(id).remove();
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input,textarea")) return;
      if (e.key === "ArrowRight") $("#h-next").click();
      if (e.key === "ArrowLeft") $("#h-prev").click();
    });
  }

  // ---------- 設定題目 ----------
  function openSetup() {
    $("#setup-overlay").hidden = false;
    $("#set-title").value = config.title || "";
    $("#set-title-en").value = config.titleEn || "";
    drawQEdits(config.questions || []);
  }
  function drawQEdits(qs) { $("#q-edit-list").innerHTML = qs.map((q, i) => qEditRow(i, q)).join(""); }
  function qEditRow(i, q) {
    return `<div class="q-edit" data-i="${i}"><div class="qn">Q${i + 1}</div>
      <button class="del" title="刪除" data-del="${i}">×</button>
      <input class="qz" data-z="${i}" value="${esc(q.zh || "")}" placeholder="中文題目" />
      <input class="qe" data-e="${i}" value="${esc(q.en || "")}" placeholder="English (optional)" /></div>`;
  }
  function readQEdits() {
    return Array.from(document.querySelectorAll("#q-edit-list .q-edit")).map((row) => ({
      zh: row.querySelector(".qz").value.trim(), en: row.querySelector(".qe").value.trim(),
    })).filter((q) => q.zh);
  }
  function wireSetup() {
    $("#q-add").addEventListener("click", () => {
      const cur = readQEdits(); cur.push({ zh: "", en: "" }); drawQEdits(cur);
      const z = document.querySelectorAll("#q-edit-list .qz"); z[z.length - 1]?.focus();
    });
    $("#q-edit-list").addEventListener("click", (e) => {
      const d = e.target.getAttribute("data-del");
      if (d !== null && d !== undefined) { const cur = readQEdits(); cur.splice(+d, 1); drawQEdits(cur); }
    });
    $("#set-save").addEventListener("click", async () => {
      const qs = readQEdits();
      if (qs.length === 0) { alert("至少要有一題喔。"); return; }
      const patch = { title: $("#set-title").value.trim() || "即時回應", titleEn: $("#set-title-en").value.trim(), questions: qs };
      if (activeIdx() >= qs.length) patch.activeIndex = qs.length - 1;
      await patchConfig(patch);
      $("#setup-overlay").hidden = true;
    });
    $("#set-cancel").addEventListener("click", () => { $("#setup-overlay").hidden = true; });
  }

  // ---------- sessionStorage ----------
  function ssGet(k){ try { return sessionStorage.getItem("lr_"+k); } catch(e){ return null; } }
  function ssSet(k,v){ try { sessionStorage.setItem("lr_"+k, v); } catch(e){} }

  // ---------- 啟動 ----------
  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("role-" + ROLE);
    if (ROLE === "host") { wireHost(); wireSetup(); }
  });
})();
