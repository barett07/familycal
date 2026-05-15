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

## 部署流程

```bash
cd "/Users/stan/Claude Code/familycal"
git add .
git commit -m "說明"
git push
```

GitHub Pages 約 1–2 分鐘後自動更新。
