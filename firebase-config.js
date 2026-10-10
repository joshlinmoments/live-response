// ═══════════════════════════════════════════════════════════
// Firebase 設定 — 沿用既有 tao-why Realtime Database（開放讀寫）
// Web apiKey 屬前端公開資訊，可安全放在這裡。
// 本工具資料全部寫在 live-poll/<ROOM> 底下，不影響 tao-why 其他專案。
// ═══════════════════════════════════════════════════════════
const FB = {
  apiKey: "AIzaSyAFlhG3HmDfXo33KJFnQ-k3MhWqt-Km0IY",
  authDomain: "tao-why.firebaseapp.com",
  databaseURL: "https://tao-why-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tao-why",
  storageBucket: "tao-why.firebasestorage.app",
  messagingSenderId: "890386342264",
  appId: "1:890386342264:web:de68c75a2cfe42dab5e88d",
};

firebase.initializeApp(FB);
const DB = firebase.database();

// 場次代碼：預設 main。可用 #host-xxx / #screen-xxx / ?room=xxx 切換不同場次互不干擾。
function getRoom() {
  const url = new URLSearchParams(location.search).get("room");
  if (url) return url.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "main";
  const h = (location.hash || "").replace(/^#/, "");
  const m = h.match(/^(?:host|screen)-([a-zA-Z0-9_-]{1,32})$/);
  return m ? m[1] : "main";
}
const ROOM = getRoom();
const ROOT = DB.ref("live-poll/" + ROOM);
const CONFIG_REF = ROOT.child("config");
const RESP_REF = ROOT.child("responses");

// 預設題目（可在主持端「設定題目」隨時改）
const DEFAULT_CONFIG = {
  title: "讓 AI 幫你騰出雙手",
  titleEn: "Let AI Lend a Hand",
  activeIndex: -1,   // -1 = 尚未開始
  accepting: true,
  reveal: true,
  questions: [
    { zh: "你最想讓 AI 幫你「騰出雙手」做哪件事？", en: "What task do you most want AI to take off your hands?" },
    { zh: "你用 AI 完成過最驚喜的一件事是什麼？", en: "What's the most surprising thing AI has helped you do?" },
    { zh: "對 AI，你最大的擔心或疑問是什麼？", en: "What's your biggest worry or question about AI?" },
    { zh: "如果真的多出一雙手，你想拿來做什麼更有意義的事？", en: "With an extra pair of hands, what meaningful thing would you do?" },
  ],
};
