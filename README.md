# 讓 AI 幫你騰出雙手 · 課堂即時回應系統

掃 QR 碼 → 手機作答 → 回應即時上牆。主持端一題一題控制，學員端自動跟著切換。
中英雙語、宣紙工筆風（呼應講題主視覺），字體用饅頭黑體。

線上網址：**https://joshlinmoments.github.io/live-response/**

## 三種介面（同一個網址，用網址結尾區分）

| 介面 | 網址 | 用途 |
|------|------|------|
| **① 手機介面（學員）** | `.../live-response/` | 掃 QR 進來就是這個。看題目、打字、送出。 |
| **② 投影介面** | `.../live-response/#screen` | 投影幕用。只有大題目＋留言牆＋角落 QR，**沒有任何按鈕**。 |
| **③ 主持介面（控制台）** | `.../live-response/#host` | 你的裝置。切題、開關、設定題目、看／移除回應。控制台有「開啟投影畫面」鈕可直接開 ②。 |

> QR 碼永遠指向「手機介面」網址（不含 hash），學員掃了只會進到作答頁，不會看到控制台或投影控制。
> 控制台改任何東西（切題、開關、題目），投影與學員手機都會即時同步。

## 上課流程

1. 你的裝置（手機或筆電）開 **`#host`**，按 **⚙ 設定題目** 把 3–5 題打好（中文必填、英文可留白）。
2. 按 **開啟投影畫面 ↗** → 在投影那台瀏覽器會開 **`#screen`**，全螢幕投到布幕（開始前會顯示大 QR）。
3. 請大家掃投影上的 QR 碼加入。需要時可開 **投影放大 QR** 讓 QR 佔滿投影。
4. 控制台按 **▶ 開始第 1 題** → 學員手機與投影同步出現題目。
5. 回應即時上投影牆。鍵盤 **← →** 或 **上一題／下一題** 切換；投影牆與手機都會跟著換。
6. 需要時：**開放作答** 暫停收件、**投影顯示牆面** 先收起牆面製造期待、**清除本題回應** 重來、右側清單 **✕** 移除個別留言。
7. 換一場新課程前，按 **清除全部**。

## 多場次（選用）

- 預設所有人都在同一個房間 `main`。
- 想讓不同班級互不干擾：主持端開 `#host-0410`，對應學員端網址 `?room=0410`。
  （一般單場上課不需要，用預設即可。）

## 後端 Firebase（重要・只需做一次）

本工具沿用既有的 **tao-why** Realtime Database，資料全部寫在 `live-poll/` 底下。
目前該資料庫規則是鎖住的，請到 Firebase Console 貼上規則開放：

1. 開 [Firebase Console](https://console.firebase.google.com/) → 專案 **tao-why** → **Realtime Database** → **規則 Rules**。
2. 貼上 `database.rules.json` 的內容（這份規則同時保留 `state`，tao-why 既有功能不受影響），按 **發布**。

規則只開放 `state` 與 `live-poll` 兩個子樹，其餘維持拒絕；Web apiKey 為前端公開資訊，可安全放在 `firebase-config.js`。

## 技術

- 純 HTML / CSS / JS，無框架。Firebase RTDB（compat SDK，CDN）即時同步。
- QR 碼：qrcodejs（CDN）前端產生。
- 字體：饅頭黑體（自行託管 woff2，`assets/fonts/`）＋ Roboto Condensed（Google Fonts）。
- 手機優先、tactile 按鈕、常駐動態（進場、漂浮），符合投影與手機雙場景。

## 部署（GitHub Pages · legacy branch 模式）

- Repo：`joshlinmoments/live-response`（Public），Pages 來源 **main / root**。
- ⚠️ 不要用 GitHub Actions（推送帳號缺 `workflow` scope）。
- 改 CSS / JS 後，記得把 `index.html` 裡 `styles.css?v=N`、`app.js?v=N` 一起升號，避免 Safari 快取。
- 推送後若沒更新，觸發建置：
  `gh api -X POST repos/joshlinmoments/live-response/pages/builds`

## 想換成主視覺真圖（選用）

目前機器人吉祥物與祥雲都是向量繪製，不依賴外部圖檔。
若想用你的主視覺真圖，把圖放到 `assets/img/`，再在 `styles.css` 的 `body` 背景或 `.join-robot` 換成 `url(...)` 即可。
