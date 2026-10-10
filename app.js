// ═══════════════════════════════════════════════════════════
// 即時回應系統 — 簡報版（可切換頁的投影片）
//   #host / #host-<場次>     → 主持控制台（切頁、作答控制、回應管理）
//   #screen / #screen-<場次> → 投影畫面（封面/影片/圖片/agents/問題）
//   其餘                      → 學員手機（問題頁作答；其餘頁示意看大螢幕）
// 投影片類型 slide.type：cover / video / image / agents / question
// 問題頁沿用即時上牆；responses 以投影片索引 q 分類
// ═══════════════════════════════════════════════════════════
(function () {
  "use strict";

  const hash = location.hash || "";
  const ROLE = /^#host(-|$)/.test(hash) ? "host"
            : /^#screen(-|$)/.test(hash) ? "screen"
            : "join";

  let config = null;
  const responsesCache = {};
  const screenRendered = new Set();

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const slidesOf = () => (config && Array.isArray(config.slides)) ? config.slides : [];
  const activeIdx = () => (config && typeof config.activeIndex === "number") ? config.activeIndex : 0;
  const curSlide = () => slidesOf()[activeIdx()] || null;
  const isQuestion = (s) => s && s.type === "question";

  // AI 代理人牆（img = 本機彩色 App 圖示；logo = 單色 SVG；皆無 = 字母徽章）
  const AGENTS = [
    { n: "Claude Code", img: "agent-claudecode.png", t: "Anthropic", star: true },
    { n: "Codex", img: "agent-codex.png", t: "OpenAI" },
  ];

  function joinUrl() {
    const base = location.origin + location.pathname;
    return (ROOM && ROOM !== "main") ? base + "?room=" + encodeURIComponent(ROOM) : base;
  }
  function screenUrl() { return location.origin + location.pathname + "#screen" + (ROOM && ROOM !== "main" ? "-" + ROOM : ""); }
  function makeQR(el, size) {
    if (!el || typeof QRCode === "undefined") return;
    el.innerHTML = "";
    new QRCode(el, { text: joinUrl(), width: size, height: size, colorDark: "#2B2520", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  }

  // ---------- config 監聽 ----------
  CONFIG_REF.on("value", (snap) => {
    const val = snap.val();
    if (!val) { config = (ROLE === "host") ? seedDefault() : null; if (ROLE === "host" && config) CONFIG_REF.set(config); }
    else { config = val; if (!Array.isArray(config.slides)) config.slides = []; }
    render();
  });
  function seedDefault() {
    return { title: "讓 AI 幫你騰出雙手", titleEn: "Let AI Lend a Hand", activeIndex: 0, accepting: true, reveal: true, showQR: false,
      slides: [{ type: "cover" }, { type: "question", zh: "現在都用 AI 做些什麼？", en: "What do you use AI for these days?" }] };
  }
  function patchConfig(patch) { return CONFIG_REF.update(patch); }

  function render() {
    if (ROLE === "host") renderHost();
    else if (ROLE === "screen") renderScreen();
    else renderJoin();
  }

  // ════════════════════════════════════════════════════════
  //  ①  學員手機
  // ════════════════════════════════════════════════════════
  let sentThisQuestion = false, nameDone = false, lastIdxJoin = -99;

  function renderJoin() {
    $("#view-join").hidden = false; $("#view-host").hidden = true; $("#view-screen").hidden = true;
    const body = $("#join-body");
    if (!config) { body.innerHTML = waitingHtml("正在連線…", "Connecting…"); return; }

    const idx = activeIdx();
    const slide = curSlide();
    if (idx !== lastIdxJoin) { sentThisQuestion = false; nameDone = false; lastIdxJoin = idx; }

    const isName = slide && slide.type === "name";
    $("#view-join").classList.toggle("name-mode", !!isName);  // 填名字頁上下置中
    const poster = document.querySelector(".hero-poster"); if (poster) poster.hidden = isQuestion(slide) || isName;  // 問題頁/填名字頁去掉頂部海報

    if (isName) {
      if (nameDone) { body.innerHTML = welcomeHtml(); $("#rename").onclick = () => { nameDone = false; renderJoin(); }; }
      else { body.innerHTML = nameHtml(); bindName(); }
      return;
    }
    if (!isQuestion(slide)) { body.innerHTML = lookUpHtml(); return; }
    if (config.accepting === false) {
      body.innerHTML = questionHtml(qNumber(idx), slide) +
        `<div class="hint">本題暫停收集中，講師開放後即可作答。<br><span class="en">Submissions are paused for now.</span></div>`;
      return;
    }
    if (sentThisQuestion) { body.innerHTML = sentHtml(); $("#again").onclick = () => { sentThisQuestion = false; renderJoin(); }; return; }
    body.innerHTML = questionHtml(qNumber(idx), slide) + answerFormHtml();
    bindForm(idx);
  }

  // 問題在所有投影片中的第幾題（只數 question 類型）
  function qNumber(idx) { let n = 0; const s = slidesOf(); for (let i = 0; i <= idx && i < s.length; i++) if (s[i].type === "question") n++; return n; }

  function lookUpHtml() {
    return `<div class="lookup">
      <div class="lookup-eyes" aria-hidden="true">
        <svg viewBox="0 0 120 80" fill="none"><rect x="14" y="14" width="92" height="52" rx="16" fill="#2B2520"/><circle cx="44" cy="40" r="11" fill="#fff"/><circle cx="76" cy="40" r="11" fill="#fff"/><circle cx="47" cy="42" r="5" fill="#2B2520"/><circle cx="79" cy="42" r="5" fill="#2B2520"/></svg>
      </div>
      <div class="lookup-zh">請看大螢幕</div>
      <div class="lookup-en en">Eyes on the big screen 👀</div>
      <div class="hint" style="margin-top:14px">講師正在分享內容，輪到你作答時這裡會自動跳出題目。</div>
    </div>`;
  }
  function nameHtml() {
    const saved = ssGet("nick") || "";
    return `<div class="namecard">
      <div class="name-badge">START</div>
      <h2 class="name-title">先寫下你的名字吧！</h2>
      <div class="name-sub en">Enter your name to begin</div>
      <input id="myname" class="name-input" maxlength="16" placeholder="你的名字／暱稱" value="${esc(saved)}" />
      <button class="btn block jade" id="name-save" style="margin-top:14px">進入 · Enter</button>
      <div class="hint">之後每次作答都會自動帶上這個名字。</div>
    </div>`;
  }
  function bindName() {
    const inp = $("#myname"), btn = $("#name-save");
    inp.focus();
    const save = () => {
      const v = inp.value.trim().slice(0, 16);
      if (!v) { inp.focus(); inp.style.borderColor = "var(--vermilion, #C0392B)"; return; }
      ssSet("nick", v); nameDone = true; renderJoin();
    };
    btn.addEventListener("click", save);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  }
  function welcomeHtml() {
    const name = esc(ssGet("nick") || "夥伴");
    return `<div class="sent-box">
      <div class="sent-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div class="sent-title">歡迎，${name}！</div>
      <div class="hint" style="font-size:15px">名字記好了，接下來請看大螢幕一起作答。<br><span class="en">You're all set — eyes on the big screen.</span></div>
      <button class="btn ghost sm" id="rename" style="margin-top:18px">改名字</button>
    </div>`;
  }

  function questionHtml(n, q) {
    return `<div class="qcard"><span class="qbadge">Q${n}</span>
      <h2 class="qtext">${esc(q.zh)}</h2>${q.en ? `<div class="qtext-en">${esc(q.en)}</div>` : ""}${q.note ? `<div class="qcard-note">${esc(q.note)}</div>` : ""}</div>`;
  }
  function answerFormHtml() {
    return `<div class="answer-area">
      <textarea id="ans" maxlength="300" placeholder="把你的想法打在這裡…"></textarea>
      <div class="counter"><span id="cc">0</span>/300</div>
      <div class="row mt"><input id="nick" maxlength="16" placeholder="暱稱（可留白＝匿名）" /></div>
      <button class="btn block jade" id="send" style="margin-top:14px">送出 · Send</button>
      <div class="hint">可以送出多則；換頁時畫面會自動更新。</div></div>`;
  }
  function sentHtml() {
    return `<div class="sent-box">
      <div class="sent-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>
      <div class="sent-title">已送出，謝謝你！</div>
      <div class="hint" style="font-size:15px">你的回應已經出現在大螢幕上。<br><span class="en">Your response is now on the big screen.</span></div>
      <button class="btn jade" id="again" style="margin-top:20px">再補一則 · Add another</button></div>`;
  }
  function waitingHtml(zh, en) {
    return `<div class="waiting"><div style="font-family:var(--font-cjk);font-weight:900;font-style:italic;font-size:26px;color:var(--gold-d)">${esc(zh)}</div>
      <div class="en" style="margin-top:6px">${esc(en)}</div><div class="dots"><i></i><i></i><i></i></div></div>`;
  }
  function bindForm(idx) {
    const ans = $("#ans"), cc = $("#cc"), send = $("#send");
    const saved = ssGet("nick"); if (saved) $("#nick").value = saved;
    ans.addEventListener("input", () => { cc.textContent = ans.value.length; });
    ans.focus();
    send.addEventListener("click", async () => {
      const text = ans.value.trim();
      if (!text) { ans.focus(); ans.style.borderColor = "var(--ink)"; return; }
      const name = $("#nick").value.trim().slice(0, 16);
      ssSet("nick", name);
      send.disabled = true; send.textContent = "送出中…";
      try { await RESP_REF.push({ q: idx, text: text.slice(0, 300), name: name || "", ts: Date.now() }); sentThisQuestion = true; renderJoin(); }
      catch (e) { send.disabled = false; send.textContent = "送出 · Send"; alert("送出失敗，請確認網路後再試一次。"); }
    });
  }

  // ════════════════════════════════════════════════════════
  //  ②  投影畫面
  // ════════════════════════════════════════════════════════
  let lastIdxScreen = -99, lastSigScreen = "", qrChipDone = false;

  function renderScreen() {
    $("#view-screen").hidden = false; $("#view-host").hidden = true; $("#view-join").hidden = true;
    if (!config) { $("#s-stage").innerHTML = `<div class="idle-stage"><div class="big title-fx outlined">連線中…</div></div>`; return; }

    if (!qrChipDone) { makeQR($("#s-qrchip"), 112); qrChipDone = true; }

    const idx = activeIdx();
    const slide = curSlide();
    const sig = JSON.stringify(slide);
    const changed = (idx !== lastIdxScreen) || (sig !== lastSigScreen);
    if (changed) { lastIdxScreen = idx; lastSigScreen = sig; screenRendered.clear(); buildScreenStage(slide); }

    // 角落 QR：問題頁與內容頁都常駐（方便中途重新加入）；封面與已有大 QR 的頁(qr/填名字)不重複
    const bigQrSlide = slide && (slide.type === "cover" || slide.type === "qr" || slide.type === "name");
    $("#s-qrwrap").hidden = !slide || bigQrSlide;
    // 留言牆只在問題頁顯示
    $("#s-wall").hidden = !isQuestion(slide);
    if (isQuestion(slide)) renderScreenWall();

    const ov = $("#s-qr-ov");
    if (config.showQR) { ov.hidden = false; makeQR($("#s-qr-ovbox"), 360); $("#s-qr-ovurl").textContent = joinUrl(); }
    else ov.hidden = true;
  }

  function buildScreenStage(slide) {
    const stage = $("#s-stage"); const wall = $("#s-wall");
    wall.innerHTML = "";
    stage.dataset.type = slide ? slide.type : "";
    if (!slide) { stage.innerHTML = `<div class="idle-stage big-qr"><div class="big title-fx outlined">${esc(config.title || "準備開始")}</div><div class="big-qr-box"><div id="s-bigqr"></div><div class="scan-label"><b>掃碼加入作答</b><span class="en">Scan to join</span></div></div></div>`; makeQR($("#s-bigqr"), 300); return; }

    if (slide.type === "cover") {
      stage.innerHTML = `<div class="slide-cover"><img class="cover-img" src="assets/img/hero-poster.jpg?v=19" alt="讓 AI 幫你騰出雙手"/></div>`;
    } else if (slide.type === "qr") {
      stage.innerHTML = `<div class="idle-stage big-qr">
        <div class="big title-fx outlined">${esc(slide.zh || "掃碼加入")}</div>
        <div class="idle-en en">${esc(slide.en || "Scan to join")}</div>
        <div class="big-qr-box"><div id="s-bigqr"></div><div class="scan-label"><b>${esc(slide.label || "掃碼加入作答")}</b><span class="en">Scan the QR code to join</span></div></div></div>`;
      makeQR($("#s-bigqr"), 340);
    } else if (slide.type === "name") {
      stage.innerHTML = `<div class="idle-stage big-qr">
        <div class="big title-fx outlined">${esc(slide.zh || "先寫下你的名字")}</div>
        <div class="idle-en en">${esc(slide.en || "Scan & enter your name")}</div>
        <div class="big-qr-box"><div id="s-bigqr"></div><div class="scan-label"><b>掃碼加入 · 輸入名字</b><span class="en">Scan the QR code to begin</span></div></div></div>`;
      makeQR($("#s-bigqr"), 340);
    } else if (slide.type === "video") {
      stage.innerHTML = `<div class="slide-media">
        ${slide.label ? `<div class="media-cap title-fx outlined">${esc(slide.label)}</div>` : ""}
        <video class="media-video" src="${esc(slide.src)}" controls playsinline preload="metadata"></video></div>`;
      wireVideoClip(stage.querySelector("video"), +slide.start || 0, +slide.end || 0);
    } else if (slide.type === "image") {
      stage.innerHTML = `<div class="slide-media"><img class="media-img" src="${esc(slide.src)}" alt="${esc(slide.label || "")}"/></div>`;
    } else if (slide.type === "agents") {
      stage.innerHTML = agentsHtml();
      wireAgentFallbacks(stage);
    } else { // question
      stage.innerHTML = `<div class="q-display">
        <div class="q-num">${qNumber(activeIdx())}<small>QUESTION</small></div>
        <div class="q-main"><h1 class="q-zh">${esc(slide.zh)}</h1>${slide.en ? `<div class="q-en">${esc(slide.en)}</div>` : ""}${slide.note ? `<div class="q-note">${esc(slide.note)}</div>` : ""}</div></div>`;
    }
  }

  function agentsHtml() {
    const tiles = AGENTS.map((a, i) => {
      const logo = a.img
        ? `<img class="agent-logo app-icon" src="assets/logos/${a.img}?v=16" alt="${esc(a.n)}" data-mono="${esc(monogram(a.n))}"/>`
        : a.logo
        ? `<img class="agent-logo" src="assets/logos/${a.logo}.svg?v=16" alt="${esc(a.n)}" data-mono="${esc(monogram(a.n))}"/>`
        : `<div class="agent-mono">${esc(monogram(a.n))}</div>`;
      return `<div class="agent-tile${a.star ? " star" : ""}">
        ${a.star ? `<div class="agent-star">本場主角</div>` : ""}
        <div class="agent-logo-wrap">${logo}</div>
        <div class="agent-name">${esc(a.n)}</div>${a.t ? `<div class="agent-maker">${esc(a.t)}</div>` : ""}</div>`;
    }).join("");
    return `<div class="slide-agents">
      <div class="agents-head"><h1 class="title-fx outlined">AI 代理人</h1><div class="agents-head-en title-fx outlined">AI AGENTS</div></div>
      <div class="agents-grid">${tiles}</div></div>`;
  }
  function monogram(name) { const parts = name.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/); return ((parts[0]||"?")[0] + (parts[1] ? parts[1][0] : (parts[0][1]||""))).toUpperCase(); }
  // 影片只播指定區段 [start, end]（秒）
  function wireVideoClip(v, start, end) {
    if (!v) return;
    v.addEventListener("loadedmetadata", () => { try { if (start > 0) v.currentTime = start; } catch (e) {} }, { once: true });
    if (end > 0) v.addEventListener("timeupdate", () => { if (v.currentTime >= end) v.pause(); });
    v.addEventListener("play", () => { try { if ((end > 0 && v.currentTime >= end) || (start > 0 && v.currentTime < start - 0.3)) v.currentTime = start; } catch (e) {} });
  }
  function wireAgentFallbacks(root) {
    root.querySelectorAll(".agent-logo").forEach((img) => {
      img.addEventListener("error", () => {
        const w = img.closest(".agent-logo-wrap"); if (w) w.innerHTML = `<div class="agent-mono">${esc(img.dataset.mono || "AI")}</div>`;
      });
    });
  }

  function renderScreenWall() {
    const wall = $("#s-wall"); const idx = activeIdx();
    if (config.reveal === false) {
      wall.innerHTML = `<div class="wall-empty"><div style="font-family:var(--font-cjk);font-weight:900;font-style:italic;font-size:30px;color:var(--gold-d)">留言牆暫時收起</div><div class="en" style="margin-top:8px;font-size:20px">Wall is hidden</div></div>`;
      screenRendered.clear(); return;
    }
    const items = Object.entries(responsesCache).filter(([, r]) => r.q === idx).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
    if (items.length === 0) {
      if (!wall.querySelector(".wcard")) wall.innerHTML = `<div class="wall-empty"><div style="font-family:var(--font-cjk);font-weight:900;font-style:italic;font-size:28px;color:var(--ink-soft)">等待大家的回應…</div><div class="en" style="margin-top:8px;font-size:20px">Responses appear here live</div></div>`;
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
  //  ③  主持控制台
  // ════════════════════════════════════════════════════════
  function slideLabel(s) {
    if (!s) return "—";
    if (s.type === "cover") return "封面 · 首頁";
    if (s.type === "qr") return "QR 碼 · 邀請掃碼加入";
    if (s.type === "name") return "填名字 · 請大家輸入名字";
    if (s.type === "video") return "影片 · " + (s.label || "Video");
    if (s.type === "image") return "圖片 · " + (s.label || "Image");
    if (s.type === "agents") return "AI 代理人牆 · AI Agents";
    if (s.type === "question") return s.zh || "問題";
    return s.type;
  }

  function renderHost() {
    $("#view-host").hidden = false; $("#view-screen").hidden = true; $("#view-join").hidden = true;
    if (!config) return;

    $("#h-brand-zh").textContent = config.title || "即時回應";
    $("#h-brand-en").textContent = config.titleEn || "";
    const slides = slidesOf(), idx = activeIdx(), slide = curSlide();

    $("#h-room").textContent = (ROOM && ROOM !== "main") ? ("場次 " + ROOM) : "場次 main";
    $("#h-qpos").innerHTML = `第 <b>${idx + 1}</b>/${slides.length} 頁`;

    const now = $("#h-now");
    const kindTag = slide ? ({cover:"封面",qr:"QR 碼",name:"填名字",video:"影片",image:"圖片",agents:"AI 代理人牆",question:"問題"}[slide.type] || slide.type) : "—";
    if (isQuestion(slide)) {
      now.innerHTML = `<div class="now-q"><span class="now-badge">Q${qNumber(idx)}</span><div><div class="now-kind">問題頁</div><div class="now-zh">${esc(slide.zh)}</div>${slide.en ? `<div class="now-en en">${esc(slide.en)}</div>` : ""}</div></div>`;
    } else {
      now.innerHTML = `<div class="now-q content"><span class="now-badge alt">${esc(kindTag)}</span><div><div class="now-kind">內容頁（無作答）</div><div class="now-zh">${esc(slideLabel(slide))}</div></div></div>`;
    }

    $("#h-prev").disabled = idx <= 0;
    $("#h-next").disabled = idx >= slides.length - 1;
    $("#h-accept").checked = config.accepting !== false;
    $("#h-reveal").checked = config.reveal !== false;
    $("#h-showqr").checked = !!config.showQR;
    $("#h-qctrls").hidden = !isQuestion(slide);  // 作答控制僅問題頁顯示

    makeQR($("#h-qr"), 128);
    $("#h-joinurl").textContent = joinUrl();
    renderModList();
  }

  function renderModList() {
    const box = $("#h-modlist"); if (!box || !config) return;
    const idx = activeIdx(); const slide = curSlide();
    if (!isQuestion(slide)) { $("#h-count2").textContent = "0"; box.innerHTML = `<div class="mod-empty">這一頁是內容頁，沒有作答。</div>`; return; }
    const items = Object.entries(responsesCache).filter(([, r]) => r.q === idx).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    $("#h-count2").textContent = items.length;
    if (items.length === 0) { box.innerHTML = `<div class="mod-empty">尚無回應。</div>`; return; }
    box.innerHTML = items.map(([id, r]) =>
      `<div class="modrow"><div class="modtxt">${esc(r.text)}<span class="modwho">— ${esc(r.name && r.name.trim() ? r.name : "匿名")}</span></div>
       <button class="modx" data-del="${esc(id)}" title="移除">✕</button></div>`).join("");
  }

  // ---------- 回應監聽 ----------
  RESP_REF.on("child_added", (snap) => {
    responsesCache[snap.key] = snap.val();
    if (ROLE === "screen") { if (isQuestion(curSlide())) renderScreenWall(); }
    else if (ROLE === "host") renderModList();
  });
  RESP_REF.on("child_removed", (snap) => {
    delete responsesCache[snap.key]; screenRendered.delete(snap.key);
    if (ROLE === "screen") { screenRendered.clear(); const w = $("#s-wall"); if (w) w.innerHTML = ""; if (isQuestion(curSlide())) renderScreenWall(); }
    else if (ROLE === "host") renderModList();
  });
  function hashInt(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  // ---------- 主持控制 ----------
  function stepTo(n) { screenRendered.clear(); patchConfig({ activeIndex: n }); }
  function wireHost() {
    $("#h-prev").addEventListener("click", () => { if (activeIdx() > 0) stepTo(activeIdx() - 1); });
    $("#h-next").addEventListener("click", () => { if (activeIdx() < slidesOf().length - 1) stepTo(activeIdx() + 1); });
    $("#h-home").addEventListener("click", () => stepTo(0));
    $("#h-accept").addEventListener("change", (e) => patchConfig({ accepting: e.target.checked }));
    $("#h-reveal").addEventListener("change", (e) => patchConfig({ reveal: e.target.checked }));
    $("#h-showqr").addEventListener("change", (e) => patchConfig({ showQR: e.target.checked }));
    $("#h-open-screen").addEventListener("click", () => window.open(screenUrl(), "_blank", "noopener"));
    $("#h-setup").addEventListener("click", openSetup);

    $("#h-clear").addEventListener("click", async () => {
      const idx = activeIdx(); if (!isQuestion(curSlide())) return;
      if (!confirm(`清除「這一題」的所有回應？此動作無法復原。`)) return;
      const ids = Object.entries(responsesCache).filter(([, r]) => r.q === idx).map(([k]) => k);
      const updates = {}; ids.forEach((k) => (updates[k] = null));
      await RESP_REF.update(updates);
    });
    $("#h-clear-all").addEventListener("click", async () => {
      if (!confirm("清除「所有題目」的全部回應？通常在換一場新課程前才需要。此動作無法復原。")) return;
      await RESP_REF.remove();
    });
    $("#h-modlist").addEventListener("click", (e) => { const id = e.target.getAttribute("data-del"); if (id) RESP_REF.child(id).remove(); });

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input,textarea")) return;
      if (e.key === "ArrowRight") $("#h-next").click();
      if (e.key === "ArrowLeft") $("#h-prev").click();
    });
  }

  // ---------- 設定題目（編輯 question 類型投影片）----------
  function openSetup() {
    $("#setup-overlay").hidden = false;
    $("#set-title").value = config.title || "";
    $("#set-title-en").value = config.titleEn || "";
    drawQEdits(slidesOf().filter(isQuestion));
  }
  function drawQEdits(qs) { $("#q-edit-list").innerHTML = qs.map((q, i) => qEditRow(i, q)).join(""); }
  function qEditRow(i, q) {
    return `<div class="q-edit" data-i="${i}"><div class="qn">Q${i + 1}</div>
      <button class="del" title="刪除" data-del="${i}">×</button>
      <input class="qz" value="${esc(q.zh || "")}" placeholder="中文題目" />
      <input class="qe" value="${esc(q.en || "")}" placeholder="English (optional)" /></div>`;
  }
  function readQEdits() {
    return Array.from(document.querySelectorAll("#q-edit-list .q-edit")).map((row) => ({
      type: "question", zh: row.querySelector(".qz").value.trim(), en: row.querySelector(".qe").value.trim(),
    })).filter((q) => q.zh);
  }
  function wireSetup() {
    $("#q-add").addEventListener("click", () => { const cur = readQEdits(); cur.push({ zh: "", en: "" }); drawQEdits(cur); const z = document.querySelectorAll("#q-edit-list .qz"); z[z.length - 1]?.focus(); });
    $("#q-edit-list").addEventListener("click", (e) => { const d = e.target.getAttribute("data-del"); if (d !== null && d !== undefined) { const cur = readQEdits(); cur.splice(+d, 1); drawQEdits(cur); } });
    $("#set-save").addEventListener("click", async () => {
      const qs = readQEdits();
      // 把編輯後的問題「就地」放回原本的問題位置（保留與內容頁的交錯順序）；多的接在最後、少的從尾端移除
      const slides = []; let ei = 0;
      for (const s of slidesOf()) {
        if (s.type === "question") { if (ei < qs.length) slides.push(qs[ei++]); }
        else slides.push(s);
      }
      while (ei < qs.length) slides.push(qs[ei++]);
      const patch = { title: $("#set-title").value.trim() || "即時回應", titleEn: $("#set-title-en").value.trim(), slides };
      if (activeIdx() >= slides.length) patch.activeIndex = slides.length - 1;
      await patchConfig(patch);
      $("#setup-overlay").hidden = true;
    });
    $("#set-cancel").addEventListener("click", () => { $("#setup-overlay").hidden = true; });
  }

  function ssGet(k){ try { return sessionStorage.getItem("lr_"+k); } catch(e){ return null; } }
  function ssSet(k,v){ try { sessionStorage.setItem("lr_"+k, v); } catch(e){} }

  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("role-" + ROLE);
    if (ROLE === "host") { wireHost(); wireSetup(); }
  });
})();
