# NOTES — familycal 技術細節與踩坑記錄

## iOS Safari date input 溢出問題

直接在 `form-input` 上設 `max-width` 沒用。解法:用 `.input-wrap`(flexbox)包住 input + 清除按鈕:
```css
.input-wrap { display: flex; align-items: stretch; gap: 8px; }
.input-wrap .form-input { flex: 1; min-width: 0; width: auto; }
```
input 一定要加 `box-sizing: border-box` 和 `color-scheme: dark`。

## 觸控目標(Touch Target)

iOS 最低 44×44px,用 `::before` 偽元素擴大點擊範圍:
```css
.event-checkbox { position: relative; }
.event-checkbox::before { content: ''; position: absolute; inset: -10px; }
```
全域加 `touch-action: manipulation` 消除 iOS 300ms 點擊延遲。

## 樂觀更新模式

新增事件用 tempId(`_tmp_${Date.now()}`),UI 先顯示,API 成功後替換真實 id;失敗則從陣列移除並顯示 toast。

## 整頁自然捲動架構(讓 Safari 工具列自動隱藏)

原本 `#app { height: 100dvh; overflow: hidden }` + `#content { overflow-y: auto }` 是內部捲動,Safari 工具列永遠不會隱藏,內容也不會透出毛玻璃。改成整頁捲動:
- `html, body { height: auto }`、`#app { min-height: 100dvh }`(移除 `display: flex` 和 `overflow: hidden`)
- 標題列/即將到來/Tab/視圖切換包進 `<div id="sticky-top">`,用 `position: fixed; top: 0; left: 0; right: 0`
- `#content` 用 JS 動態設 `padding-top` 等於 sticky-top 高度
- 用 `ResizeObserver` 監聽 sticky-top 高度變化(橫幅展開/收合、螢幕轉向都自動更新)

**為什麼不用 `position: sticky`?** 試過了,在 flex 容器和 `min-height` 父層的組合下不會正確保留空間,內容會跑到 sticky-top 後面。`position: fixed` + 動態 padding 最可靠。

## scrollIntoView 配合 fixed sticky-top

`renderListView` 用 `scrollIntoView({ block: 'start' })` 自動捲動,但 fixed sticky-top 會蓋住捲動目標。解法:用 CSS 變數 + `scroll-margin-top`:
```css
.month-header,
.event-item { scroll-margin-top: var(--sticky-h, 0px); }
```
JS 在 ResizeObserver 裡同步更新:`document.documentElement.style.setProperty('--sticky-h', h)`。

## 清單預設捲動位置:最近期的事件

`renderListView` 打開(或從月曆切回清單、再次點「清單」按鈕)時,會自動捲到「第一個 `end_date`(或 `start_date`,若無 end)`>= 今天` 的事件」,讓最近期事件出現在第一條。

**為何用 `end_date || start_date`:** 多天事件(如 5/15–5/20)今天 5/16 仍在進行中,不該被視為「已過去」而跳過。
**Fallback:** 若全部事件都已過去,就捲到當月 `month-header`(避免空捲動)。
**靠 `S.events` 已按 `start_date` 升序排序**(`api.js` 和 add/update 後的 sort 都會維持),所以 `Array.find` 第一筆就是答案。

## 防止瀏覽器自動還原捲動位置

改成整頁捲動後,瀏覽器會記住先前的捲動位置並在重新整理時還原,導致開啟頁面時不在頂部。在 script 最頂端加:
```javascript
history.scrollRestoration = 'manual';
```

## sticky-top 內元素的半透明背景會透出內容

即將到來橫幅原本是 `rgba(255,159,10,0.12)`(近全透明),改成整頁捲動後內容會從橫幅後面透出來。解法:用預先混色的固體色 `#1e1300`(黑底 + 12% 橙色的混色結果)。

## 多個 raf 排隊的覆蓋順序

`scrollIntoView` 和 `window.scrollTo` 同時用 `requestAnimationFrame` 包起來時,後排的會覆蓋前排。`loadData` 完成後若再呼叫一次 `scrollTo(0,0)`,會把 `renderListView` 的 `scrollIntoView` 覆蓋掉。

## Google Maps 短網址解析配方(fc-resolve-place,2026-07-12)

iPhone 分享的 `maps.app.goo.gl` 短網址,解析店名/地址/座標的正確方法(全部實測過):

1. **店名+地址**:用社群爬蟲 UA(`facebookexternalhit/1.1`)fetch 短網址,`og:title` 是「店名 · 4.6★(872) · 餐廳」→ 以**前後有空格的 `" · "`** split 取第一段(店名本身可能含無空格的 `·`);`og:description` 是乾淨地址。一般 UA 只會拿到「Google Maps」通用標題。
2. **座標**:短網址 `redirect: 'manual'` 取 Location(`maps.google.com/?q=…&ftid=…`),改寫成 `maps.google.com/maps?q=…&ftid=…&output=embed` 再 fetch,HTML 內才有店家精確座標(lat,lng 與 lng,lat 兩種順序都會出現,取反轉後也存在的那組)。
3. **桌面版完整網址**(`/maps/place/…!3d<lat>!4d<lng>`)直接從 `!3d!4d` 取座標;但它的 `og:description` 是「★★★★★ · 餐廳」評分文字,**不能當地址**(開頭 ★ 要跳過)。

**踩過的坑**:
- 一般頁面的 `APP_INITIALIZATION_STATE` 和 og:image 的 staticmap center 是**區域視窗中心(zoom=9)**,不是店家座標,不能用
- Nominatim(OSM)查台灣門牌只能到「街」級(OSM 台灣缺門牌資料),不採用
- **地址語言跟著伺服器所在地走**:Edge Function 不在台灣(Stan 實測拿到英文+韓文混雜地址),必須在 og 抓取的網址上加 `hl=zh-TW` 強制繁中(改抓「轉址後目標網址 + hl=zh-TW」,並帶 `Accept-Language: zh-TW`;從台灣 IP 測不出這個問題,要用 `hl=en` 反向驗證)

## 美食地圖版面:地圖放在 #sticky-top 內

`#foodmap-map`(40dvh)放在 `#sticky-top` 最下方而不是 `#content` 裡,非 foodmap 分頁時 `hidden`。好處:既有的 ResizeObserver 量整個 sticky-top 高度自動撐開 `#content` 的 padding-top,清單自然從地圖下方開始捲動,完全不動整頁捲動架構;`.place-item` 沿用 `.event-item` 的 `scroll-margin-top: var(--sticky-h)`,點 pin 捲清單也正確。Leaflet 在 hidden→可見後要 `requestAnimationFrame(() => map.invalidateSize())`(renderFoodmap 已處理)。

## 資料庫加固記錄(2026-07-09)

- `fc_set_updated_at()` 已鎖定 `search_path = ''`(消除 Supabase security advisor 警告,觸發器實測正常)
- `fc_wishlist.scheduled_event_id` 外鍵已補索引 `fc_wishlist_scheduled_event_id_idx`
