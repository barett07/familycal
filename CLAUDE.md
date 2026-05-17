# familycal 專案說明

## 基本資訊

- **正式網址：** https://barett07.github.io/familycal/
- **GitHub Repo：** https://github.com/barett07/familycal
- **本地路徑：** `/Users/stan/Claude Code/familycal`

## 技術架構

| 層 | 選擇 |
|---|---|
| 前端 | 純 HTML/CSS/JS，無 build tool，GitHub Pages 部署 |
| 資料庫 | 共用 RailwayShift 的 Supabase 專案（`oqyjixphmdrhcmomskth`） |
| Table 前綴 | `fc_`（fc_events、fc_wishlist） |
| 寫入 | Edge Function `fc-write`（帶 `X-FC-Passcode` header） |
| 驗證 | Edge Function `fc-auth` |
| 行事曆訂閱 | Edge Function `fc-ical`（webcal:// 協定） |

## Supabase Secrets（在 dashboard 手動管理）

- `FC_EDITOR_PASSCODE`：Stan + 太太的編輯碼
- `FC_VIEWER_PASSCODE`：查看碼（未來給小孩）
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`：自動注入，不需設定

## 資料表結構

**fc_events**
- id, title, type, start_date, end_date, event_time, notes, completed, created_at, updated_at

**fc_wishlist**
- id, name, url, notes, completed, scheduled_event_id（FK → fc_events），created_at, updated_at

**事件類型（type CHECK 約束）：**
`醫療回診` / `家庭出遊` / `聚會/聚餐` / `考試` / `雜務`

## 使用者與權限

- **editor**：Stan（福先生）+ 太太（福太太）— 可查看、新增、編輯、刪除
- **viewer**：未來給小孩 — 只能查看（預留擴充：可新增想去清單）
- 權限驗證後以 `fc_auth_v1` key 存在 localStorage，裝置記憶免重複輸入

## 主要功能

- 清單視圖（預設）+ 月曆格子視圖，可切換
- 即將到來橫幅（7 天內，預設展開）
- 事件 CRUD、多天事件、時間、備註
- 清單事件日期附星期顯示，格式 `5/17 (日)`（多日事件起訖各標一次）
- 想去清單 CRUD，排入行事曆後自動移出清單
- 行事曆事件可移至想去清單
- Apple 行事曆訂閱（清單/月曆切換列右側按鈕）
- 樂觀更新（UI 先更新，寫入背景執行）

## 已知技術細節與踩坑記錄

### iOS Safari date input 溢出問題
直接在 `form-input` 上設 `max-width` 沒用。解法：用 `.input-wrap`（flexbox）包住 input + 清除按鈕：
```css
.input-wrap { display: flex; align-items: stretch; gap: 8px; }
.input-wrap .form-input { flex: 1; min-width: 0; width: auto; }
```
input 一定要加 `box-sizing: border-box` 和 `color-scheme: dark`。

### 觸控目標（Touch Target）
iOS 最低 44×44px，用 `::before` 偽元素擴大點擊範圍：
```css
.event-checkbox { position: relative; }
.event-checkbox::before { content: ''; position: absolute; inset: -10px; }
```
全域加 `touch-action: manipulation` 消除 iOS 300ms 點擊延遲。

### 樂觀更新模式
新增事件用 tempId（`_tmp_${Date.now()}`），UI 先顯示，API 成功後替換真實 id；失敗則從陣列移除並顯示 toast。

### 整頁自然捲動架構（讓 Safari 工具列自動隱藏）
原本 `#app { height: 100dvh; overflow: hidden }` + `#content { overflow-y: auto }` 是內部捲動，Safari 工具列永遠不會隱藏，內容也不會透出毛玻璃。改成整頁捲動：
- `html, body { height: auto }`、`#app { min-height: 100dvh }`（移除 `display: flex` 和 `overflow: hidden`）
- 標題列/即將到來/Tab/視圖切換包進 `<div id="sticky-top">`，用 `position: fixed; top: 0; left: 0; right: 0`
- `#content` 用 JS 動態設 `padding-top` 等於 sticky-top 高度
- 用 `ResizeObserver` 監聽 sticky-top 高度變化（橫幅展開/收合、螢幕轉向都自動更新）

**為什麼不用 `position: sticky`？** 試過了，在 flex 容器和 `min-height` 父層的組合下不會正確保留空間，內容會跑到 sticky-top 後面。`position: fixed` + 動態 padding 最可靠。

### scrollIntoView 配合 fixed sticky-top
`renderListView` 用 `scrollIntoView({ block: 'start' })` 自動捲動，但 fixed sticky-top 會蓋住捲動目標。解法：用 CSS 變數 + `scroll-margin-top`：
```css
.month-header,
.event-item { scroll-margin-top: var(--sticky-h, 0px); }
```
JS 在 ResizeObserver 裡同步更新：`document.documentElement.style.setProperty('--sticky-h', h)`。

### 清單預設捲動位置：最近期的事件
`renderListView` 打開（或從月曆切回清單、再次點「清單」按鈕）時，會自動捲到「第一個 `end_date`（或 `start_date`，若無 end）`>= 今天` 的事件」，讓最近期事件出現在第一條。

**為何用 `end_date || start_date`：** 多天事件（如 5/15–5/20）今天 5/16 仍在進行中，不該被視為「已過去」而跳過。
**Fallback：** 若全部事件都已過去，就捲到當月 `month-header`（避免空捲動）。
**靠 `S.events` 已按 `start_date` 升序排序**（`api.js` 和 add/update 後的 sort 都會維持），所以 `Array.find` 第一筆就是答案。

### 防止瀏覽器自動還原捲動位置
改成整頁捲動後，瀏覽器會記住先前的捲動位置並在重新整理時還原，導致開啟頁面時不在頂部。在 script 最頂端加：
```javascript
history.scrollRestoration = 'manual';
```

### sticky-top 內元素的半透明背景會透出內容
即將到來橫幅原本是 `rgba(255,159,10,0.12)`（近全透明），改成整頁捲動後內容會從橫幅後面透出來。解法：用預先混色的固體色 `#1e1300`（黑底 + 12% 橙色的混色結果）。

### 多個 raf 排隊的覆蓋順序
`scrollIntoView` 和 `window.scrollTo` 同時用 `requestAnimationFrame` 包起來時，後排的會覆蓋前排。`loadData` 完成後若再呼叫一次 `scrollTo(0,0)`，會把 `renderListView` 的 `scrollIntoView` 覆蓋掉。

## 部署流程

```bash
cd "/Users/stan/Claude Code/familycal"
git add .
git commit -m "說明"
git push
```

GitHub Pages 約 1–2 分鐘後自動更新。
