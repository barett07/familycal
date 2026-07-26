# CLAUDE.md — familycal

**家庭行事曆** — Stan 與太太共用的事件 + 想去清單 + 美食地圖 App。

- 正式網址:https://barett07.github.io/familycal/
- GitHub:https://github.com/barett07/familycal

## 架構速覽

| 層 | 選擇 |
|---|---|
| 前端 | 純 HTML/CSS/JS,無 build tool,GitHub Pages 部署 |
| 資料庫 | 共用 RailwayShift 的 Supabase 專案(`oqyjixphmdrhcmomskth`),table 前綴 `fc_` |
| Edge Functions | `fc-write`(寫入,帶 `X-FC-Passcode`)、`fc-auth`(驗證)、`fc-ical`(行事曆訂閱)、`fc-resolve-place`(解析 Google Maps 連結) |
| 地圖 | Leaflet 1.9.4 + OpenStreetMap(CDN 載入,免 key) |

- 資料表:`fc_events`(id, title, type, start_date, end_date, event_time, notes, completed, …)、`fc_wishlist`(id, name, url, notes, completed, scheduled_event_id FK → fc_events, …)、`fc_places`(id, name, categories text[] 可複選, gmaps_url, address, lat, lng, notes, eaten, rating, review, price_level, …)
- 事件類型(type CHECK 約束):`醫療回診` / `家庭出遊` / `聚會/聚餐` / `考試` / `雜務`
- 權限:editor(Stan「福先生」+ 太太「福太太」,完整 CRUD)、viewer(未來給小孩,唯讀);驗證後存 `localStorage.fc_auth_v1`
- Supabase Secrets:`FC_EDITOR_PASSCODE`、`FC_VIEWER_PASSCODE`(Dashboard 手動管理)
- 主要功能:清單/月曆雙視圖、即將到來橫幅(7 天)、多天事件、想去清單(排入行事曆自動移出)、美食地圖(貼 Google Maps 連結自動解析店名/座標、地圖清單連動、已吃評分)、Apple 行事曆訂閱、樂觀更新

## 先讀這些

- **`NOTES.md`** — iOS Safari 踩坑全記錄:date input 溢出、觸控目標、整頁捲動架構(sticky-top / ResizeObserver / scroll-margin-top)、捲動位置邏輯、raf 覆蓋順序、樂觀更新、資料庫加固記錄。**動 CSS 版面或捲動行為前必讀。**

## ⚠️ 紅線(不知道就會犯錯)

1. **innerHTML 中所有 Supabase 文字欄位必須套 `escapeHtml()`**,`w.url` 套 `safeUrl()`(兩者定義在 `js/app.js` 最頂端)
2. **寫入一律走 Edge Function `fc-write`**(RLS:anon 只能 SELECT)
3. **Edge Function 原始碼在 `supabase/functions/`**(2026-07-11 從線上拉回,git 是唯一真相來源);改動後**一律用 `./deploy.sh` 部署**(verify_jwt 已寫死在 `supabase/config.toml`,腳本含自動驗證)
4. **四個 function 的 `verify_jwt` 都是 false**;避免用 MCP 部署(預設 true 會被靜默重置,stock-tracker 曾因此連續失敗 6 週)
5. CORS:`fc-write` / `fc-auth` / `fc-resolve-place` 限定 `https://barett07.github.io`;`fc-ical` 保留 `*`(行事曆訂閱需要)
6. 動版面注意整頁捲動架構的連鎖規則(→ `NOTES.md`)
7. **對比度須過 WCAG AA**(按鈕文字、表單標籤、placeholder、focus 框、錯誤訊息都算);**不要用裸 `vh`**:版面高度(`min-height`)用 `dvh`、彈窗/捲動區上限(`max-height`)用 `svh`。**兩種模式下 `vh` 都大於可見高度**:Safari 分頁差約 40px(網址列)、加到主畫面的 standalone 差約 62px(狀態列,更嚴重);**不用純黑 `#000` / 純白 `#fff`**,改用 off-black / off-white
8. **畫面上的數字一律來自真實資料**;示範/假資料必須明顯標示,不可混充真實數據。**空狀態、載入中、錯誤狀態都要有畫面**,不能空白

## ✅ 改完自檢(交付前逐條確認)

- 改了 innerHTML?→ Supabase 來的文字都套了 `escapeHtml()`,URL 套了 `safeUrl()`
- 改了版面/捲動?→ 對照 NOTES.md 的整頁捲動架構,iPhone Safari 實測過
- 改了畫面?→ 對比度過 WCAG AA;沒有裸 `vh`(min-height→`dvh`、max-height→`svh`);沒有純黑純白;空/載入中/錯誤狀態都有畫面;數字都是真的
- 改了 Edge Function?→ 用 `./deploy.sh` 部署且驗證全綠
- 在本地實際開啟頁面看過改動,不是只看程式碼

## 部署

```bash
cd "/Users/stan/Claude Code/familycal"
git add . && git commit -m "說明" && git push
```

GitHub Pages 約 1–2 分鐘後自動更新。

## 協作規則

- **寫任何程式碼前**,先與 Stan 討論方向,等 Stan 說「開始生成」才動手,不可推測性實作
- **發布三步驟,不可跳過**:1. 本地預覽讓 Stan 確認 → 2. Stan OK 後才 `git add` + `git commit` → 3. Stan 明確說「推上去」才 `git push`
