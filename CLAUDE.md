# CLAUDE.md — familycal

**家庭行事曆** — Stan 與太太共用的事件 + 想去清單 App。

- 正式網址:https://barett07.github.io/familycal/
- GitHub:https://github.com/barett07/familycal

## 架構速覽

| 層 | 選擇 |
|---|---|
| 前端 | 純 HTML/CSS/JS,無 build tool,GitHub Pages 部署 |
| 資料庫 | 共用 RailwayShift 的 Supabase 專案(`oqyjixphmdrhcmomskth`),table 前綴 `fc_` |
| Edge Functions | `fc-write`(寫入,帶 `X-FC-Passcode`)、`fc-auth`(驗證)、`fc-ical`(行事曆訂閱) |

- 資料表:`fc_events`(id, title, type, start_date, end_date, event_time, notes, completed, …)、`fc_wishlist`(id, name, url, notes, completed, scheduled_event_id FK → fc_events, …)
- 事件類型(type CHECK 約束):`醫療回診` / `家庭出遊` / `聚會/聚餐` / `考試` / `雜務`
- 權限:editor(Stan「福先生」+ 太太「福太太」,完整 CRUD)、viewer(未來給小孩,唯讀);驗證後存 `localStorage.fc_auth_v1`
- Supabase Secrets:`FC_EDITOR_PASSCODE`、`FC_VIEWER_PASSCODE`(Dashboard 手動管理)
- 主要功能:清單/月曆雙視圖、即將到來橫幅(7 天)、多天事件、想去清單(排入行事曆自動移出)、Apple 行事曆訂閱、樂觀更新

## 先讀這些

- **`NOTES.md`** — iOS Safari 踩坑全記錄:date input 溢出、觸控目標、整頁捲動架構(sticky-top / ResizeObserver / scroll-margin-top)、捲動位置邏輯、raf 覆蓋順序、樂觀更新、資料庫加固記錄。**動 CSS 版面或捲動行為前必讀。**

## ⚠️ 紅線(不知道就會犯錯)

1. **innerHTML 中所有 Supabase 文字欄位必須套 `escapeHtml()`**,`w.url` 套 `safeUrl()`(兩者定義在 `js/app.js` 最頂端)
2. **寫入一律走 Edge Function `fc-write`**(RLS:anon 只能 SELECT)
3. **本地 repo 沒有 Edge Function 原始碼**,線上版本就是唯一版本——改動前先用 MCP `get_edge_function` 拉現況
4. **三個 function 的 `verify_jwt` 都是 false**,重部署必須明確帶 `verify_jwt: false`(MCP 預設 true 會被靜默重置,stock-tracker 曾因此連續失敗 6 週)
5. CORS:`fc-write` / `fc-auth` 限定 `https://barett07.github.io`;`fc-ical` 保留 `*`(行事曆訂閱需要)
6. 動版面注意整頁捲動架構的連鎖規則(→ `NOTES.md`)

## 部署

```bash
cd "/Users/stan/Claude Code/familycal"
git add . && git commit -m "說明" && git push
```

GitHub Pages 約 1–2 分鐘後自動更新。

## 協作規則

- 改程式前列計劃確認 → 本地預覽測試 → Stan OK 後才 commit,Stan 明確說「推上去」才 push
