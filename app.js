// ═══════════════════════════════════════════════════════════
// 即時回應系統 — 主程式（學員端 + 主持端共用）
// 依 location.hash 判斷身分：#host 或 #host-<場次> = 主持端，其餘 = 學員端
// 資料流：主持端寫 config；學員端 push 到 responses；雙方 onSnapshot 即時同步
// ═══════════════════════════════════════════════════════════
(function () {
  "use strict";

  const isHost = /^#host(-|$)/.test(location.hash || "");
  let config = null;            // 目前設定（含題目、activeIndex…）
  const responsesCache = {};    // id -> {q,text,name,ts}
  const renderedIds = new Set();

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ---------- 初始化 config（只有主持端在缺少時種入預設）----------
  CONFIG_REF.on("value", (snap) => {
    const val = snap.val();
    if (!val) {
      if (isHost) CONFIG_REF.set(DEFAULT_CONFIG);
      config = isHost ? DEFAULT_CONFIG : null;
    } else {
      config = val;
      if (!Array.isArray(config.questions)) config.questions = [];
    }
    if (isHost) renderHost(); else renderJoin();
  });

  async function patchConfig(patch) {
    await CONFIG_REF.update(patch);
  }

  // ════════════════════════════════════════════════════════
  //  學員端
  // ════════════════════════════════════════════════════════
  let sentThisQuestion = false;
  let lastActiveIndex = -99;

  function renderJoin() {
    const root = $("#view-join");
    root.hidden = false;
    $("#view-host").hidden = true;

    if (!config) { root.querySelector("#join-body").innerHTML = waitingHtml("正在連線…", "Connecting…"); return; }

    // 標題
    $("#join-title").textContent = config.title || "即時回應";
    $("#join-title-en").textContent = config.titleEn || "";

    const idx = typeof config.activeIndex === "number" ? config.activeIndex : -1;
    const q = (config.questions || [])[idx];

    // 換題 → 重置作答狀態
    if (idx !== lastActiveIndex) { sentThisQuestion = false; lastActiveIndex = idx; }

    const body = root.querySelector("#join-body");

    if (!q) {
      body.innerHTML = waitingHtml("請稍候片刻", "Please wait — the next question is on its way");
      return;
    }
    if (config.accepting === false) {
      body.innerHTML =
        questionHtml(idx, q) +
        `<div class="hint">本題暫停收集中，講師開放後即可作答。<br><span class="en">Submissions are paused for now.</span></div>`;
      return;
    }
    if (sentThisQuestion) { body.innerHTML = sentHtml(idx, q); bindSent(); return; }

    body.innerHTML = questionHtml(idx, q) + answerFormHtml();
    bindForm(idx);
  }

  function questionHtml(idx, q) {
    return `
      <div class="qcard">
        <span class="qbadge">Q${idx + 1}</span>
        <h2 class="qtext">${esc(q.zh)}</h2>
        ${q.en ? `<div class="qtext-en">${esc(q.en)}</div>` : ""}
      </div>`;
  }
  function answerFormHtml() {
    return `
      <div class="answer-area">
        <textarea id="ans" maxlength="300" placeholder="把你的想法打在這裡…"></textarea>
        <div class="counter"><span id="cc">0</span>/300</div>
        <div class="row mt">
          <input id="nick" maxlength="16" placeholder="暱稱（可留白＝匿名）" />
        </div>
        <button class="btn block jade" id="send" style="margin-top:14px">送出 · Send</button>
        <div class="hint">可以送出多則；換題時畫面會自動更新。</div>
      </div>`;
  }
  function sentHtml(idx, q) {
    return `
      <div class="sent-box">
        <div class="sent-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>
        <div class="sent-title">已送出，謝謝你！</div>
        <div class="hint" style="font-size:15px">你的回應已經出現在大螢幕上。<br><span class="en">Your response is now on the big screen.</span></div>
        <button class="btn jade" id="again" style="margin-top:20px">再補一則 · Add another</button>
      </div>`;
  }
  function waitingHtml(zh, en) {
    return `
      <div class="waiting">
        <div style="font-family:var(--font-cjk);font-weight:900;font-size:26px;color:var(--jade-d)">${esc(zh)}</div>
        <div class="en" style="margin-top:6px">${esc(en)}</div>
        <div class="dots"><i></i><i></i><i></i></div>
      </div>`;
  }

  function bindForm(idx) {
    const ans = $("#ans"), cc = $("#cc"), send = $("#send");
    const saved = sessionStorageGet("nick"); if (saved) $("#nick").value = saved;
    ans.addEventListener("input", () => { cc.textContent = ans.value.length; });
    ans.focus();
    send.addEventListener("click", async () => {
      const text = ans.value.trim();
      if (!text) { ans.focus(); ans.style.borderColor = "var(--vermilion)"; return; }
      const name = $("#nick").value.trim().slice(0, 16);
      sessionStorageSet("nick", name);
      send.disabled = true; send.textContent = "送出中…";
      try {
        await RESP_REF.push({ q: idx, text: text.slice(0, 300), name: name || "", ts: Date.now() });
        sentThisQuestion = true;
        renderJoin();
      } catch (e) {
        send.disabled = false; send.textContent = "送出 · Send";
        alert("送出失敗，請確認網路後再試一次。");
      }
    });
  }
  function bindSent() {
    $("#again").addEventListener("click", () => { sentThisQuestion = false; renderJoin(); });
  }

  // ════════════════════════════════════════════════════════
  //  主持端 / 投影端
  // ════════════════════════════════════════════════════════
  function renderHost() {
    $("#view-join").hidden = true;
    const root = $("#view-host"); root.hidden = false;
    if (!config) return;

    $("#h-brand-zh").textContent = config.title || "即時回應";
    $("#h-brand-en").textContent = config.titleEn || "";

    const qs = config.questions || [];
    const idx = typeof config.activeIndex === "number" ? config.activeIndex : -1;

    $("#h-qpos").innerHTML = idx >= 0 ? `第 <b>${idx + 1}</b> / ${qs.length} 題` : `共 ${qs.length} 題`;
    $("#h-count").innerHTML = `<b>${countFor(idx)}</b> 則回應`;
    $("#h-accept").checked = config.accepting !== false;
    $("#h-reveal").checked = config.reveal !== false;
    $("#h-prev").disabled = idx <= 0;
    $("#h-next").disabled = idx >= qs.length - 1;
    $("#h-start").hidden = idx >= 0;
    $("#h-start").textContent = idx >= 0 ? "" : "▶ 開始第 1 題";

    // 題目顯示區
    const stage = $("#h-qstage");
    const q = qs[idx];
    if (!q) {
      stage.innerHTML = `
        <div class="idle-stage">
          <div class="big">準備開始</div>
          <div class="en" style="font-size:20px">Scan the QR code to join · 掃碼加入</div>
          <button class="btn jade" style="margin-top:22px" onclick="document.getElementById('h-qr').click()">顯示 QR Code</button>
        </div>`;
    } else {
      stage.innerHTML = `
        <div class="q-display">
          <div class="q-num">${idx + 1}<small>QUESTION</small></div>
          <div class="q-main">
            <h1 class="q-zh">${esc(q.zh)}</h1>
            ${q.en ? `<div class="q-en">${esc(q.en)}</div>` : ""}
          </div>
        </div>`;
    }

    renderWall();
  }

  function countFor(idx) {
    return Object.values(responsesCache).filter((r) => r.q === idx).length;
  }

  function renderWall() {
    const wall = $("#h-wall");
    if (!config) return;
    const idx = typeof config.activeIndex === "number" ? config.activeIndex : -1;

    if (config.reveal === false) {
      wall.innerHTML = `<div class="wall-empty"><div style="font-family:var(--font-cjk);font-weight:900;font-size:26px;color:var(--jade-d)">留言牆已隱藏</div><div class="en" style="margin-top:6px">Wall hidden — toggle “顯示牆面” to reveal</div></div>`;
      renderedIds.clear();
      return;
    }

    const items = Object.entries(responsesCache)
      .filter(([, r]) => r.q === idx)
      .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));

    if (items.length === 0) {
      wall.innerHTML = `<div class="wall-empty"><div style="font-family:var(--font-cjk);font-weight:900;font-size:24px;color:var(--ink-soft)">等待大家的回應…</div><div class="en" style="margin-top:6px">Responses will appear here live</div></div>`;
      renderedIds.clear();
      return;
    }

    // 若剛從空狀態/換題，整塊重建
    if (!wall.querySelector(".wcard")) { wall.innerHTML = ""; renderedIds.clear(); }

    items.forEach(([id, r], i) => {
      if (renderedIds.has(id)) return;
      renderedIds.add(id);
      const el = document.createElement("div");
      el.className = "wcard c" + (hashInt(id) % 5);
      el.innerHTML = `<div class="txt">${esc(r.text)}</div>` +
        `<div class="who">— <b>${esc(r.name && r.name.trim() ? r.name : "匿名夥伴")}</b></div>`;
      wall.appendChild(el);
    });
    // 移除不屬於本題的殘留卡（換題時）
    Array.from(wall.children).forEach((el) => {
      if (el.dataset.gone) el.remove();
    });
  }

  function hashInt(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  // ---------- 回應監聽 ----------
  RESP_REF.on("child_added", (snap) => {
    responsesCache[snap.key] = snap.val();
    if (isHost) { refreshHostCounts(); renderWall(); }
  });
  RESP_REF.on("child_removed", (snap) => {
    delete responsesCache[snap.key];
    renderedIds.delete(snap.key);
    if (isHost) { const el = document.querySelector('[data-id="' + cssEsc(snap.key) + '"]'); if (el) el.remove(); refreshHostCounts(); renderWall(); }
  });
  function cssEsc(s){ return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g,'\\"'); }
  function refreshHostCounts() {
    if (!config) return;
    const idx = typeof config.activeIndex === "number" ? config.activeIndex : -1;
    const c = $("#h-count"); if (c) c.innerHTML = `<b>${countFor(idx)}</b> 則回應`;
  }

  // ---------- 主持端控制 ----------
  function wireHostControls() {
    $("#h-prev").addEventListener("click", () => { if (config.activeIndex > 0) { renderedIds.clear(); $("#h-wall").innerHTML=""; patchConfig({ activeIndex: config.activeIndex - 1 }); } });
    $("#h-next").addEventListener("click", () => { if (config.activeIndex < config.questions.length - 1) { renderedIds.clear(); $("#h-wall").innerHTML=""; patchConfig({ activeIndex: config.activeIndex + 1 }); } });
    $("#h-start").addEventListener("click", () => { renderedIds.clear(); $("#h-wall").innerHTML=""; patchConfig({ activeIndex: 0, accepting: true }); });
    $("#h-accept").addEventListener("change", (e) => patchConfig({ accepting: e.target.checked }));
    $("#h-reveal").addEventListener("change", (e) => patchConfig({ reveal: e.target.checked }));

    $("#h-clear").addEventListener("click", async () => {
      const idx = config.activeIndex;
      if (!confirmBox(`清除「第 ${idx + 1} 題」的所有回應？此動作無法復原。`)) return;
      const ids = Object.entries(responsesCache).filter(([, r]) => r.q === idx).map(([k]) => k);
      const updates = {}; ids.forEach((k) => (updates[k] = null));
      renderedIds.clear(); $("#h-wall").innerHTML = "";
      await RESP_REF.update(updates);
    });
    $("#h-clear-all").addEventListener("click", async () => {
      if (!confirmBox("清除「所有題目」的全部回應？通常在換一場新課程前才需要。此動作無法復原。")) return;
      renderedIds.clear(); $("#h-wall").innerHTML = "";
      await RESP_REF.remove();
    });

    $("#h-qr").addEventListener("click", showQR);
    $("#h-setup").addEventListener("click", openSetup);
  }
  function confirmBox(msg){ return window.confirm(msg); }

  // ---------- QR Code ----------
  function joinUrl() { return location.origin + location.pathname; }
  function showQR() {
    const ov = $("#qr-overlay"); ov.hidden = false;
    const box = $("#qrcode"); box.innerHTML = "";
    $("#qr-url").textContent = joinUrl();
    new QRCode(box, { text: joinUrl(), width: 320, height: 320, colorDark: "#2B2520", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  }

  // ---------- 設定題目 ----------
  function openSetup() {
    const ov = $("#setup-overlay"); ov.hidden = false;
    $("#set-title").value = config.title || "";
    $("#set-title-en").value = config.titleEn || "";
    drawQEdits(config.questions || []);
  }
  function drawQEdits(qs) {
    const list = $("#q-edit-list");
    list.innerHTML = qs.map((q, i) => qEditRow(i, q)).join("");
  }
  function qEditRow(i, q) {
    return `
      <div class="q-edit" data-i="${i}">
        <div class="qn">Q${i + 1}</div>
        <button class="del" title="刪除" data-del="${i}">×</button>
        <input class="qz" data-z="${i}" value="${esc(q.zh || "")}" placeholder="中文題目" />
        <input class="qe" data-e="${i}" value="${esc(q.en || "")}" placeholder="English (optional)" />
      </div>`;
  }
  function readQEdits() {
    const rows = Array.from(document.querySelectorAll("#q-edit-list .q-edit"));
    return rows.map((row) => ({
      zh: row.querySelector(".qz").value.trim(),
      en: row.querySelector(".qe").value.trim(),
    })).filter((q) => q.zh);
  }
  function wireSetup() {
    $("#q-add").addEventListener("click", () => {
      const cur = readQEdits(); cur.push({ zh: "", en: "" }); drawQEdits(cur);
      const inputs = document.querySelectorAll("#q-edit-list .qz"); inputs[inputs.length - 1]?.focus();
    });
    $("#q-edit-list").addEventListener("click", (e) => {
      const d = e.target.getAttribute("data-del");
      if (d !== null) { const cur = readQEdits(); cur.splice(+d, 1); drawQEdits(cur); }
    });
    $("#set-save").addEventListener("click", async () => {
      const qs = readQEdits();
      if (qs.length === 0) { alert("至少要有一題喔。"); return; }
      const patch = {
        title: $("#set-title").value.trim() || "即時回應",
        titleEn: $("#set-title-en").value.trim(),
        questions: qs,
      };
      // 若目前題號超出新題數，收回到最後一題
      if (config.activeIndex >= qs.length) patch.activeIndex = qs.length - 1;
      await patchConfig(patch);
      $("#setup-overlay").hidden = true;
    });
    $("#set-cancel").addEventListener("click", () => { $("#setup-overlay").hidden = true; });
  }

  // ---------- 疊層關閉（點背景 / Esc）----------
  function wireOverlays() {
    $("#qr-overlay").addEventListener("click", (e) => { if (e.target.id === "qr-overlay" || e.target.id === "qr-close") $("#qr-overlay").hidden = true; });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { $("#qr-overlay").hidden = true; }
      if (isHost && config) {
        if (e.key === "ArrowRight") $("#h-next").click();
        if (e.key === "ArrowLeft") $("#h-prev").click();
      }
    });
  }

  // ---------- sessionStorage 安全存取 ----------
  function sessionStorageGet(k){ try { return sessionStorage.getItem("lr_"+k); } catch(e){ return null; } }
  function sessionStorageSet(k,v){ try { sessionStorage.setItem("lr_"+k, v); } catch(e){} }

  // ---------- 啟動 ----------
  document.addEventListener("DOMContentLoaded", () => {
    if (isHost) {
      document.body.classList.add("as-host");
      wireHostControls(); wireSetup(); wireOverlays();
    } else {
      wireOverlays();
    }
  });
})();
