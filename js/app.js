const escapeHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';

// ── State ──────────────────────────────────────────────────────────────────
const S = {
  events:    [],
  wishlist:  [],
  places:    [],
  tab:       'calendar',   // 'calendar' | 'wishlist' | 'foodmap'
  view:      'list',       // 'list' | 'grid'
  gridYear:  new Date().getFullYear(),
  gridMonth: new Date().getMonth(),
  selectedDay: null,
  foodFilter: { status: 'all', category: null },  // status: 'all' | 'todo' | 'eaten'
};

// ── Boot ───────────────────────────────────────────────────────────────────
history.scrollRestoration = 'manual';

document.addEventListener('DOMContentLoaded', () => {
  if (Auth.get()) {
    showApp();
  } else {
    showAuth();
  }

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('upcoming-toggle').addEventListener('click', () => {
    document.getElementById('upcoming-banner').classList.toggle('expanded');
  });

  // 自動讓 #content 的 padding-top 跟著 #sticky-top 高度變化
  new ResizeObserver(() => {
    const h = document.getElementById('sticky-top').offsetHeight + 'px';
    document.getElementById('content').style.paddingTop = h;
    document.documentElement.style.setProperty('--sticky-h', h);
  }).observe(document.getElementById('sticky-top'));

  // 日期/時間輸入框加 × 清除按鈕
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
    const wrap = document.createElement('div');
    wrap.className = 'input-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'input-clear';
    btn.innerHTML = '&times;';
    btn.onclick = () => { input.value = ''; };
    wrap.appendChild(btn);
  });

  // 排入行事曆 modal 的 type picker
  document.querySelectorAll('#sched-type-picker .type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sched-type-picker .type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 美食地圖:篩選 chips
  document.getElementById('cat-chips').innerHTML = CATS.map(c =>
    `<button class="chip" data-cat="${c}">${CAT_CONFIG[c]} ${c}</button>`).join('');
  document.querySelectorAll('#status-chips .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      S.foodFilter.status = btn.dataset.status;
      renderFoodmap();
    });
  });
  document.querySelectorAll('#cat-chips .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      S.foodFilter.category = S.foodFilter.category === btn.dataset.cat ? null : btn.dataset.cat;
      renderFoodmap();
    });
  });

  // 美食地圖:店家 modal 的分類 picker(建立在全域 .type-btn 綁定之後,不會被重複綁定)
  document.getElementById('place-cat-picker').innerHTML = CATS.map(c =>
    `<button type="button" class="type-btn cat-btn" data-cat="${c}">${CAT_CONFIG[c]} ${c}</button>`).join('');
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 美食地圖:星星 picker
  document.querySelectorAll('#star-picker button').forEach(btn => {
    btn.addEventListener('click', () => setStars(+btn.dataset.star));
  });

  // 美食地圖:人均價位 picker(選填,點已選的取消)——評分 modal 與店家 modal 各一組
  const priceBtnsHTML = (cls) => Object.entries(PRICE_LEVELS).map(([lv, c]) =>
    `<button type="button" class="type-btn ${cls}" data-level="${lv}">${c.sym} ${c.label}</button>`).join('');
  document.getElementById('price-picker').innerHTML = priceBtnsHTML('price-btn');
  document.querySelectorAll('.price-btn').forEach(btn => {
    btn.addEventListener('click', () => setPrice(+btn.dataset.level === ratePrice ? 0 : +btn.dataset.level));
  });
  document.getElementById('place-price-picker').innerHTML = priceBtnsHTML('pprice-btn');
  document.querySelectorAll('.pprice-btn').forEach(btn => {
    btn.addEventListener('click', () => setPlacePrice(+btn.dataset.level === placePrice ? 0 : +btn.dataset.level));
  });
});

// ── Auth Screen ────────────────────────────────────────────────────────────
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  const input = document.getElementById('passcode-input');
  input.value = '';
  input.focus();
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  window.scrollTo(0, 0);
  loadData();
}

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('passcode-input');
  const errorEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit');
  const passcode = input.value.trim();
  if (!passcode) return;

  btn.disabled = true;
  errorEl.textContent = '';
  errorEl.className = 'auth-hint';
  btn.textContent = '驗證中…';

  try {
    const role = await Auth.verify(passcode);
    if (role) {
      Auth.set(role, passcode);
      showApp();
    } else {
      errorEl.textContent = '驗證碼錯誤，請再試一次';
      errorEl.className = 'auth-error-msg';
      input.value = '';
      input.focus();
    }
  } catch {
    errorEl.textContent = '連線失敗，請稍後再試';
    errorEl.className = 'auth-error-msg';
  } finally {
    btn.disabled = false;
    btn.textContent = '進入';
  }
});

// ── Data ───────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const [events, wishlist, places] = await Promise.all([Api.getEvents(), Api.getWishlist(), Api.getPlaces()]);
    S.events   = events;
    S.wishlist = wishlist;
    S.places   = places;
    render();
  } catch (err) {
    console.error('Load error:', err);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  renderUpcoming();
  renderFAB();
  document.getElementById('calendar-tab').classList.toggle('hidden', S.tab !== 'calendar');
  document.getElementById('wishlist-tab').classList.toggle('hidden', S.tab !== 'wishlist');
  document.getElementById('foodmap-tab').classList.toggle('hidden', S.tab !== 'foodmap');
  document.getElementById('foodmap-map').classList.toggle('hidden', S.tab !== 'foodmap');
  if (S.tab === 'calendar') {
    if (S.view === 'list') renderListView(); else renderGridView();
  } else if (S.tab === 'wishlist') {
    renderWishlist();
  } else {
    renderFoodmap();
  }
}

function renderUpcoming() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in3 = new Date(today); in3.setDate(in3.getDate() + 3);

  const upcoming = S.events.filter(e => {
    const d = new Date(e.start_date + 'T00:00:00');
    return !e.completed && d >= today && d <= in3;
  });

  const banner = document.getElementById('upcoming-banner');
  if (upcoming.length === 0) { banner.classList.add('hidden'); return; }

  const wasHidden = banner.classList.contains('hidden');
  banner.classList.remove('hidden');
  if (wasHidden) banner.classList.add('expanded'); // 第一次出現時預設展開
  document.getElementById('upcoming-count').textContent = upcoming.length;
  document.getElementById('upcoming-list').innerHTML = upcoming.map(e => {
    const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG['雜務'];
    const d   = new Date(e.start_date + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    const label = diff === 0 ? '今天' : diff === 1 ? '明天' : `${diff} 天後`;
    return `<div class="upcoming-item">
      <span class="upcoming-day-label">${label}</span>
      <span class="upcoming-item-title" style="color:${cfg.color}">${escapeHtml(e.title)}</span>
    </div>`;
  }).join('');
}

function renderFAB() {
  const isEditor = Auth.isEditor();
  const viewerOnWishlist = !isEditor && Auth.get()?.role === 'viewer' && S.tab === 'wishlist';
  document.getElementById('fab').classList.toggle('hidden', !isEditor && !viewerOnWishlist);
}

// ── List View ──────────────────────────────────────────────────────────────
function renderListView() {
  const container = document.getElementById('events-list');
  if (S.events.length === 0) {
    container.innerHTML = '<div class="empty-state">還沒有任何事件<br>點右下角 <strong>+</strong> 新增</div>';
    return;
  }

  const groups = {};
  S.events.forEach(e => {
    const d   = new Date(e.start_date + 'T00:00:00');
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (groups[key] = groups[key] || []).push(e);
  });

  const isEditor = Auth.isEditor();
  let html = '';
  Object.keys(groups).sort().forEach(key => {
    const [y, m] = key.split('-');
    html += `<div class="month-header" id="month-${key}">${y} 年 ${parseInt(m)} 月</div>`;
    groups[key].forEach(e => { html += eventItemHTML(e, isEditor); });
  });

  container.innerHTML = html;
  attachEventListeners(container);

  // 自動捲動到最近期的事件（end_date 或 start_date >= 今天）
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const nextEvent = S.events.find(e => (e.end_date || e.start_date) >= todayStr);
  let target = nextEvent ? container.querySelector(`.event-item[data-id="${nextEvent.id}"]`) : null;
  if (!target) {
    const todayKey = todayStr.slice(0, 7);
    target = document.getElementById(`month-${todayKey}`);
  }
  if (target) {
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }
}

// ── Grid View ──────────────────────────────────────────────────────────────
function renderGridView() {
  const { gridYear: y, gridMonth: m } = S;
  document.getElementById('calendar-month-label').textContent = `${y} 年 ${m + 1} 月`;

  const eventMap = {};
  S.events.forEach(e => {
    const start = new Date(e.start_date + 'T00:00:00');
    const end   = e.end_date ? new Date(e.end_date + 'T00:00:00') : start;
    const cur   = new Date(start);
    while (cur <= end) {
      if (cur.getFullYear() === y && cur.getMonth() === m) {
        const d = cur.getDate();
        (eventMap[d] = eventMap[d] || []).push(e);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  const today      = new Date();
  const isThisMonth = today.getFullYear() === y && today.getMonth() === m;
  const todayDate   = today.getDate();
  const firstDay    = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let cells = '<div class="cal-empty"></div>'.repeat(firstDay);
  for (let d = 1; d <= daysInMonth; d++) {
    const evs  = eventMap[d] || [];
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday   = isThisMonth && d === todayDate;
    const isSelected = S.selectedDay === dateStr;
    const dots = evs.slice(0, 3).map(e => {
      const c = (TYPE_CONFIG[e.type] || TYPE_CONFIG['雜務']).color;
      return `<span class="cal-dot" style="background:${c}"></span>`;
    }).join('');
    cells += `<div class="cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}"
      data-date="${dateStr}" onclick="selectDay('${dateStr}')">
      <span class="cal-num">${d}</span>
      <div class="cal-dots">${dots}</div>
    </div>`;
  }
  document.getElementById('calendar-grid').innerHTML = cells;

  const dayPanel = document.getElementById('day-events');
  if (S.selectedDay) {
    renderDayEvents(S.selectedDay, dayPanel);
  } else {
    dayPanel.innerHTML = '';
  }
}

function selectDay(dateStr) {
  S.selectedDay = S.selectedDay === dateStr ? null : dateStr;
  renderGridView();
}

function renderDayEvents(dateStr, container) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const evs = S.events.filter(e => {
    const s = new Date(e.start_date + 'T00:00:00');
    const en = e.end_date ? new Date(e.end_date + 'T00:00:00') : s;
    return target >= s && target <= en;
  });

  const isEditor = Auth.isEditor();
  if (evs.length === 0) {
    container.innerHTML = `<p class="day-empty">${m} 月 ${d} 日 沒有事件</p>`;
    return;
  }
  container.innerHTML = `<p class="day-header">${m} 月 ${d} 日</p>` +
    evs.map(e => eventItemHTML(e, isEditor)).join('');
  attachEventListeners(container);
}

// ── Wishlist View ──────────────────────────────────────────────────────────
function renderWishlist() {
  const container = document.getElementById('wishlist-list');
  if (S.wishlist.length === 0) {
    container.innerHTML = '<div class="empty-state">還沒有想去的地方<br>點右下角 <strong>+</strong> 新增</div>';
    return;
  }

  const active = S.wishlist.filter(w => !w.completed);
  const done   = S.wishlist.filter(w => w.completed);
  const isEditor = Auth.isEditor();

  let html = active.map(w => wishItemHTML(w, isEditor)).join('');
  if (done.length > 0) {
    html += '<div class="month-header">已去過</div>';
    html += done.map(w => wishItemHTML(w, isEditor)).join('');
  }
  container.innerHTML = html;

  container.querySelectorAll('.wish-item').forEach(el => {
    el.querySelector('.event-checkbox')?.addEventListener('click', () => {
      if (isEditor) toggleWishComplete(el.dataset.id, el.dataset.completed === 'true');
    });
    el.querySelector('.event-menu')?.addEventListener('click', ev => {
      ev.stopPropagation();
      showWishMenu(el.dataset.id);
    });
  });
}

// ── HTML Builders ──────────────────────────────────────────────────────────
function eventItemHTML(e, isEditor) {
  const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG['雜務'];
  const WD  = ['日', '一', '二', '三', '四', '五', '六'];
  const s   = new Date(e.start_date + 'T00:00:00');
  let dateStr = `${s.getMonth() + 1}/${String(s.getDate()).padStart(2, '0')} (${WD[s.getDay()]})`;
  if (e.end_date && e.end_date !== e.start_date) {
    const en = new Date(e.end_date + 'T00:00:00');
    dateStr += `–${en.getMonth() + 1}/${String(en.getDate()).padStart(2, '0')} (${WD[en.getDay()]})`;
  }
  if (e.event_time) {
    dateStr += ` ${e.event_time.slice(0, 5)}`;
    if (e.event_time_end) dateStr += `–${e.event_time_end.slice(0, 5)}`;
  }

  return `<div class="event-item${e.completed ? ' completed' : ''}" data-id="${e.id}" data-completed="${e.completed}">
    <div class="event-checkbox${e.completed ? ' checked' : ''}" style="--tc:${cfg.color}">
      ${e.completed ? '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
    </div>
    <div class="event-body">
      <div class="event-row1">
        <span class="event-date">${dateStr}</span>
        <span class="event-title">${escapeHtml(e.title)}</span>
      </div>
      <div class="event-row2">
        <span class="event-badge" style="color:${cfg.color};background:${cfg.bg}">${escapeHtml(e.type)}</span>
        ${e.notes ? `<span class="event-notes">${escapeHtml(e.notes)}</span>` : ''}
      </div>
    </div>
    ${isEditor ? `<button class="event-menu" aria-label="選項">•••</button>` : ''}
  </div>`;
}

function wishItemHTML(w, isEditor) {
  return `<div class="event-item wish-item${w.completed ? ' completed' : ''}" data-id="${w.id}" data-completed="${w.completed}">
    <div class="event-checkbox${w.completed ? ' checked' : ''}" style="--tc:#FF9F0A">
      ${w.completed ? '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
    </div>
    <div class="event-body">
      <div class="event-row1">
        <span class="event-title">${escapeHtml(w.name)}</span>
      </div>
      <div class="event-row2">
        ${w.url ? `<a class="wish-link" href="${safeUrl(w.url)}" target="_blank" rel="noopener noreferrer">🔗 查看連結</a>` : ''}
        ${w.notes ? `<span class="event-notes">${escapeHtml(w.notes)}</span>` : ''}
        ${w.scheduled_event_id ? `<span class="wish-scheduled-badge">已排入行事曆</span>` : ''}
      </div>
    </div>
    ${isEditor ? `<button class="event-menu" aria-label="選項">•••</button>` : ''}
  </div>`;
}

function attachEventListeners(container) {
  const isEditor = Auth.isEditor();
  container.querySelectorAll('.event-item').forEach(el => {
    el.querySelector('.event-checkbox')?.addEventListener('click', () => {
      if (isEditor) toggleComplete(el.dataset.id, el.dataset.completed === 'true');
    });
    el.querySelector('.event-menu')?.addEventListener('click', ev => {
      ev.stopPropagation();
      showEventMenu(el.dataset.id);
    });
  });
}

// ── Toggle Complete ────────────────────────────────────────────────────────
function toggleComplete(id, was) {
  const ev = S.events.find(e => e.id === id);
  if (!ev) return;
  ev.completed = !was;           // 樂觀更新：先改畫面
  render();
  Api.write('fc_events', 'update', { completed: !was }, id)
    .catch(() => { ev.completed = was; render(); showToast('操作失敗', true); });
}

function toggleWishComplete(id, was) {
  const w = S.wishlist.find(w => w.id === id);
  if (!w) return;
  w.completed = !was;
  render();
  Api.write('fc_wishlist', 'update', { completed: !was }, id)
    .catch(() => { w.completed = was; render(); showToast('操作失敗', true); });
}

// ── Menus ──────────────────────────────────────────────────────────────────
function showEventMenu(id) {
  const ev = S.events.find(e => e.id === id);
  if (!ev) return;
  showActionSheet([
    { label: ev.completed ? '取消完成' : '標記完成', fn: () => toggleComplete(id, ev.completed) },
    { label: '編輯',          fn: () => openEditEvent(ev)        },
    { label: '移至想去清單',  fn: () => moveEventToWishlist(ev)  },
    { label: '刪除',          fn: () => deleteEvent(id), danger: true },
  ]);
}

async function moveEventToWishlist(ev) {
  if (!confirm(`將「${ev.title}」移至想去清單？`)) return;
  try {
    const r = await Api.write('fc_wishlist', 'insert', {
      name: ev.title,
      notes: ev.notes || null,
    });
    S.wishlist.unshift(r.data);
    await Api.write('fc_events', 'delete', null, ev.id);
    S.events = S.events.filter(e => e.id !== ev.id);
    render();
    showToast('已移至想去清單 ✓');
  } catch (err) { showToast('失敗：' + err.message, true); }
}

function showWishMenu(id) {
  const w = S.wishlist.find(w => w.id === id);
  if (!w) return;
  showActionSheet([
    { label: w.completed ? '取消完成' : '標記完成', fn: () => toggleWishComplete(id, w.completed) },
    { label: '排入行事曆', fn: () => openScheduleModal(w) },
    { label: '編輯',       fn: () => openEditWish(w)      },
    { label: '刪除',       fn: () => deleteWish(id), danger: true },
  ]);
}

function showActionSheet(items) {
  const el = document.createElement('div');
  el.className = 'action-sheet-wrap';
  el.innerHTML = `
    <div class="as-overlay"></div>
    <div class="as-sheet">
      ${items.map((it, i) => `<button class="as-btn${it.danger ? ' danger' : ''}" data-i="${i}">${it.label}</button>`).join('')}
      <button class="as-btn as-cancel">取消</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));

  const close = () => {
    el.classList.remove('open');
    setTimeout(() => el.remove(), 280);
  };
  el.querySelector('.as-overlay').onclick = close;
  el.querySelector('.as-cancel').onclick  = close;
  el.querySelectorAll('[data-i]').forEach(btn => {
    btn.onclick = () => { close(); items[+btn.dataset.i].fn(); };
  });
}

// ── Delete ─────────────────────────────────────────────────────────────────
function deleteEvent(id) {
  if (!confirm('確定要刪除這個事件？')) return;
  const backup = [...S.events];
  S.events = S.events.filter(e => e.id !== id);
  render();
  Api.write('fc_events', 'delete', null, id)
    .catch(() => { S.events = backup; render(); showToast('刪除失敗', true); });
}

function deleteWish(id) {
  if (!confirm('確定要刪除這個地點？')) return;
  const backup = [...S.wishlist];
  S.wishlist = S.wishlist.filter(w => w.id !== id);
  render();
  Api.write('fc_wishlist', 'delete', null, id)
    .catch(() => { S.wishlist = backup; render(); showToast('刪除失敗', true); });
}

// ── Modals ─────────────────────────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('hidden');
  requestAnimationFrame(() => {
    m.classList.add('open');
    document.documentElement.style.background = 'transparent';
  });
}

function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('open');
  document.documentElement.style.background = '';
  setTimeout(() => m.classList.add('hidden'), 300);
}

// Event Modal
function openAddEvent(prefilledDate = null) {
  document.getElementById('event-modal-title').textContent = '新增事件';
  document.getElementById('event-id').value        = '';
  document.getElementById('event-title').value     = '';
  document.getElementById('event-start').value     = prefilledDate || todayStr();
  document.getElementById('event-end').value       = '';
  document.getElementById('event-time').value      = '';
  document.getElementById('event-time-end').value  = '';
  document.getElementById('event-notes').value     = '';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.type-btn[data-type="家庭出遊"]').classList.add('active');
  openModal('event-modal');
  setTimeout(() => document.getElementById('event-title').focus(), 320);
}

function openEditEvent(ev) {
  document.getElementById('event-modal-title').textContent = '編輯事件';
  document.getElementById('event-id').value         = ev.id;
  document.getElementById('event-title').value      = ev.title;
  document.getElementById('event-start').value      = ev.start_date;
  document.getElementById('event-end').value        = ev.end_date   || '';
  document.getElementById('event-time').value       = ev.event_time     ? ev.event_time.slice(0, 5)     : '';
  document.getElementById('event-time-end').value   = ev.event_time_end ? ev.event_time_end.slice(0, 5) : '';
  document.getElementById('event-notes').value      = ev.notes      || '';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === ev.type));
  openModal('event-modal');
}

async function saveEvent() {
  const id      = document.getElementById('event-id').value;
  const title   = document.getElementById('event-title').value.trim();
  const start   = document.getElementById('event-start').value;
  const end     = document.getElementById('event-end').value;
  const time    = document.getElementById('event-time').value;
  const timeEnd = document.getElementById('event-time-end').value;
  const notes   = document.getElementById('event-notes').value.trim();
  const typeBtn = document.querySelector('.type-btn.active');

  if (!title)   { showToast('請輸入標題', true); return; }
  if (!start)   { showToast('請選擇開始日期', true); return; }
  if (!typeBtn) { showToast('請選擇類型', true); return; }

  const data = {
    title,
    type: typeBtn.dataset.type,
    start_date:     start,
    end_date:       end     || null,
    event_time:     time    || null,
    event_time_end: timeEnd || null,
    notes:          notes   || null,
  };

  if (id) {
    const i = S.events.findIndex(e => e.id === id);
    const backup = i >= 0 ? { ...S.events[i] } : null;
    if (i >= 0) S.events[i] = { ...S.events[i], ...data };
    S.events.sort((a, b) => a.start_date.localeCompare(b.start_date));
    closeModal('event-modal');
    render();
    Api.write('fc_events', 'update', data, id)
      .then(r => {
        const j = S.events.findIndex(e => e.id === id);
        if (j >= 0) { S.events[j] = r.data; render(); }
      })
      .catch(() => {
        const j = S.events.findIndex(e => e.id === id);
        if (j >= 0 && backup) { S.events[j] = backup; S.events.sort((a, b) => a.start_date.localeCompare(b.start_date)); }
        render(); showToast('儲存失敗', true);
      });
  } else {
    // 新增：先用暫時 ID 插入，收到回應後換成真實 ID
    const tempId = `_tmp_${Date.now()}`;
    const tempEvent = { id: tempId, ...data, completed: false, created_at: new Date().toISOString() };
    S.events.push(tempEvent);
    S.events.sort((a, b) => a.start_date.localeCompare(b.start_date));
    closeModal('event-modal');
    render();
    Api.write('fc_events', 'insert', data)
      .then(r => {
        const idx = S.events.findIndex(e => e.id === tempId);
        if (idx >= 0) S.events[idx] = r.data;
        render();
      })
      .catch(() => {
        S.events = S.events.filter(e => e.id !== tempId);
        render(); showToast('儲存失敗', true);
      });
  }
}

// Wish Modal
function openAddWish() {
  document.getElementById('wish-modal-title').textContent = '新增想去地點';
  document.getElementById('wish-id').value    = '';
  document.getElementById('wish-name').value  = '';
  document.getElementById('wish-url').value   = '';
  document.getElementById('wish-notes').value = '';
  openModal('wish-modal');
  setTimeout(() => document.getElementById('wish-name').focus(), 320);
}

function openEditWish(w) {
  document.getElementById('wish-modal-title').textContent = '編輯地點';
  document.getElementById('wish-id').value    = w.id;
  document.getElementById('wish-name').value  = w.name;
  document.getElementById('wish-url').value   = w.url   || '';
  document.getElementById('wish-notes').value = w.notes || '';
  openModal('wish-modal');
}

async function saveWish() {
  const id    = document.getElementById('wish-id').value;
  const name  = document.getElementById('wish-name').value.trim();
  const url   = document.getElementById('wish-url').value.trim();
  const notes = document.getElementById('wish-notes').value.trim();

  if (!name) { showToast('請輸入地點名稱', true); return; }

  const data = { name, url: url || null, notes: notes || null };

  if (id) {
    const i = S.wishlist.findIndex(w => w.id === id);
    const backup = i >= 0 ? { ...S.wishlist[i] } : null;
    if (i >= 0) S.wishlist[i] = { ...S.wishlist[i], ...data };
    closeModal('wish-modal');
    render();
    Api.write('fc_wishlist', 'update', data, id)
      .then(r => { if (i >= 0) S.wishlist[i] = { ...S.wishlist[i], ...r.data }; })
      .catch(() => {
        if (i >= 0 && backup) S.wishlist[i] = backup;
        render(); showToast('儲存失敗', true);
      });
  } else {
    const tempId = `_tmp_${Date.now()}`;
    S.wishlist.unshift({ id: tempId, ...data, completed: false, created_at: new Date().toISOString() });
    closeModal('wish-modal');
    render();
    Api.write('fc_wishlist', 'insert', data)
      .then(r => {
        const idx = S.wishlist.findIndex(w => w.id === tempId);
        if (idx >= 0) S.wishlist[idx] = r.data;
        render();
      })
      .catch(() => {
        S.wishlist = S.wishlist.filter(w => w.id !== tempId);
        render(); showToast('儲存失敗', true);
      });
  }
}

// Schedule Modal
function openScheduleModal(w) {
  document.getElementById('sched-wish-id').value        = w.id;
  document.getElementById('sched-wish-name').textContent = `「${w.name}」`;
  document.getElementById('sched-date').value           = '';
  document.getElementById('sched-end-date').value       = '';
  document.getElementById('sched-time').value           = '';
  document.getElementById('sched-time-end').value       = '';
  document.getElementById('sched-notes').value          = w.notes || '';
  // 預設類型：家庭出遊
  document.querySelectorAll('#sched-type-picker .type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === '家庭出遊');
  });
  openModal('schedule-modal');
}

async function scheduleWish() {
  const wishId   = document.getElementById('sched-wish-id').value;
  const date     = document.getElementById('sched-date').value;
  const endDate  = document.getElementById('sched-end-date').value;
  const time     = document.getElementById('sched-time').value;
  const timeEnd  = document.getElementById('sched-time-end').value;
  const notes    = document.getElementById('sched-notes').value.trim();
  const typeBtn  = document.querySelector('#sched-type-picker .type-btn.active');

  if (!date) { showToast('請選擇日期', true); return; }

  const w = S.wishlist.find(w => w.id === wishId);
  if (!w) return;

  try {
    const evData = {
      title: w.name,
      type: typeBtn?.dataset.type || '家庭出遊',
      start_date:     date,
      end_date:       endDate  || null,
      event_time:     time     || null,
      event_time_end: timeEnd  || null,
      notes:          notes    || null,
    };
    const evRes = await Api.write('fc_events', 'insert', evData);
    S.events.push(evRes.data);
    S.events.sort((a, b) => a.start_date.localeCompare(b.start_date));

    // 排入後從想去清單移除
    await Api.write('fc_wishlist', 'delete', null, wishId);
    S.wishlist = S.wishlist.filter(w => w.id !== wishId);

    closeModal('schedule-modal');
    // 切回行事曆清單視圖
    S.tab  = 'calendar';
    S.view = 'list';
    document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === 'calendar'));
    document.getElementById('btn-list').classList.add('active');
    document.getElementById('btn-grid').classList.remove('active');
    document.getElementById('list-view').classList.remove('hidden');
    document.getElementById('grid-view').classList.add('hidden');
    document.getElementById('view-toggle-bar').classList.remove('hidden');
    render();
    showToast('已排入行事曆並從清單移除 ✓');
  } catch (err) { showToast('失敗：' + err.message, true); }
}

// ── Foodmap ────────────────────────────────────────────────────────────────
let foodMap = null;
let foodMarkers = {};
let foodMapFitted = false;
let placeDraft = { lat: null, lng: null, address: null };  // place-modal 的解析結果暫存
let rateStars = 0;
let ratePrice = 0;     // 評分 modal 的人均價位 1–5,0 = 未選
let placePrice = 0;    // 店家 modal 的人均價位(新增時的預估)
let pinPickId = null;  // 「在地圖上點選位置」模式中的店家 id

function ensureFoodMap() {
  if (foodMap) return;
  foodMap = L.map('foodmap-map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(foodMap);
  foodMap.setView([23.97, 120.98], 7);  // 預設:台灣全島
  foodMap.on('click', e => {
    if (!pinPickId) return;
    setPlacePosition(pinPickId, e.latlng.lat, e.latlng.lng);
    pinPickId = null;
  });

  // 定位到我的位置按鈕(掛在縮放鈕下方)
  const locateCtrl = L.control({ position: 'topleft' });
  locateCtrl.onAdd = () => {
    const btn = L.DomUtil.create('button', 'locate-btn');
    btn.type = 'button';
    btn.innerHTML = '📍';
    btn.title = '定位到我的位置';
    L.DomEvent.disableClickPropagation(btn);
    btn.onclick = locateMe;
    return btn;
  };
  locateCtrl.addTo(foodMap);
}

let myLocMarker = null;

function locateMe() {
  if (!navigator.geolocation) { showToast('此裝置不支援定位', true); return; }
  showToast('定位中…');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (myLocMarker) myLocMarker.remove();
      myLocMarker = L.circleMarker([lat, lng], {
        radius: 8, color: '#fff', weight: 2.5, fillColor: '#0a84ff', fillOpacity: 1,
      }).addTo(foodMap).bindPopup('我在這裡');
      foodMap.flyTo([lat, lng], Math.max(foodMap.getZoom(), 15), { duration: 0.8 });
    },
    () => showToast('無法取得位置,請確認已允許定位權限', true),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function placeIcon(p) {
  return L.divIcon({
    className: 'place-pin-wrap',
    html: `<div class="place-pin${p.eaten ? ' pin-eaten' : ''}">${CAT_CONFIG[p.category] || '🍽️'}</div>`,
    iconSize: [34, 43],
    iconAnchor: [17, 43],
    popupAnchor: [0, -46],
  });
}

function filteredPlaces() {
  return S.places.filter(p => {
    if (S.foodFilter.status === 'todo'  &&  p.eaten) return false;
    if (S.foodFilter.status === 'eaten' && !p.eaten) return false;
    if (S.foodFilter.category && p.category !== S.foodFilter.category) return false;
    return true;
  });
}

function starsHTML(rating) {
  return `<span class="place-stars">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
}

function renderFoodmap() {
  ensureFoodMap();
  // 容器剛從 hidden 變可見,Leaflet 需要重新量尺寸
  requestAnimationFrame(() => foodMap.invalidateSize());

  document.querySelectorAll('#status-chips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.status === S.foodFilter.status));
  document.querySelectorAll('#cat-chips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.cat === S.foodFilter.category));

  const list = filteredPlaces();
  const isEditor = Auth.isEditor();

  Object.values(foodMarkers).forEach(m => m.remove());
  foodMarkers = {};
  const located = list.filter(p => p.lat != null && p.lng != null);
  located.forEach(p => {
    const m = L.marker([p.lat, p.lng], { icon: placeIcon(p) }).addTo(foodMap);
    m.bindPopup(placePopupHTML(p));
    m.on('click', () => highlightPlaceCard(p.id));
    foodMarkers[p.id] = m;
  });

  if (!foodMapFitted && located.length > 0) {
    foodMap.fitBounds(located.map(p => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 15 });
    foodMapFitted = true;
  }

  const container = document.getElementById('places-list');
  if (S.places.length === 0) {
    container.innerHTML = '<div class="empty-state">還沒有想吃的店家<br>點右下角 <strong>+</strong> 貼上 Google Maps 連結新增</div>';
    return;
  }
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">沒有符合篩選的店家</div>';
    return;
  }
  container.innerHTML = list.map(p => placeItemHTML(p, isEditor)).join('');
  container.querySelectorAll('.place-item').forEach(el => {
    el.addEventListener('click', () => focusPlace(el.dataset.id));
    el.querySelector('.place-nav')?.addEventListener('click', ev => ev.stopPropagation());
    el.querySelector('.event-menu')?.addEventListener('click', ev => {
      ev.stopPropagation();
      showPlaceMenu(el.dataset.id);
    });
  });
}

function placeItemHTML(p, isEditor) {
  const emoji = CAT_CONFIG[p.category] || '🍽️';
  return `<div class="event-item place-item" data-id="${p.id}">
    <div class="place-cat-emoji">${emoji}</div>
    <div class="event-body">
      <div class="event-row1">
        <span class="event-title">${escapeHtml(p.name)}</span>
        ${p.eaten && p.rating ? starsHTML(p.rating) : ''}
      </div>
      ${p.address ? `<div class="place-address">📍 ${escapeHtml(p.address)}</div>` : ''}
      <div class="event-row2">
        <span class="${p.eaten ? 'place-badge-eaten' : 'place-badge-todo'}">${p.eaten ? '已吃' : '待吃'}</span>
        ${PRICE_LEVELS[p.price_level] ? `<span class="place-price">${PRICE_LEVELS[p.price_level].sym} ${PRICE_LEVELS[p.price_level].label}</span>` : ''}
        ${p.gmaps_url ? `<a class="wish-link place-nav" href="${safeUrl(p.gmaps_url)}" target="_blank" rel="noopener noreferrer">🧭 導航</a>` : ''}
        ${p.lat == null ? '<span class="place-nopin">未定位</span>' : ''}
      </div>
      ${p.eaten && p.review ? `<div class="event-notes">「${escapeHtml(p.review)}」</div>` : ''}
      ${p.notes ? `<div class="event-notes">${escapeHtml(p.notes)}</div>` : ''}
    </div>
    ${isEditor ? `<button class="event-menu" aria-label="選項">•••</button>` : ''}
  </div>`;
}

function placePopupHTML(p) {
  const stars = p.eaten && p.rating ? '<br>' + starsHTML(p.rating) : '';
  const nav = p.gmaps_url
    ? `<br><a href="${safeUrl(p.gmaps_url)}" target="_blank" rel="noopener noreferrer">🧭 導航</a>` : '';
  return `<div class="place-popup"><b>${escapeHtml(p.name)}</b>${stars}${nav}</div>`;
}

// 點清單卡片 → 地圖飛過去開氣泡
function focusPlace(id) {
  const p = S.places.find(x => x.id === id);
  if (!p) return;
  const m = foodMarkers[id];
  if (!m) {
    if (p.lat == null) showToast('這家店還沒有定位', true);
    return;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  foodMap.flyTo([p.lat, p.lng], Math.max(foodMap.getZoom(), 16), { duration: 0.6 });
  m.openPopup();
}

// 點地圖 pin → 清單捲到該店並亮一下
function highlightPlaceCard(id) {
  const el = document.querySelector(`.place-item[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
}

function showPlaceMenu(id) {
  const p = S.places.find(x => x.id === id);
  if (!p) return;
  const items = [];
  if (p.eaten) {
    items.push({ label: '改評分/心得', fn: () => openRateModal(p) });
    items.push({ label: '改回待吃',    fn: () => revertPlaceTodo(id) });
  } else {
    items.push({ label: '標記已吃＆評分', fn: () => openRateModal(p) });
  }
  items.push({ label: p.lat == null ? '在地圖上點選位置' : '重新定位（點地圖）', fn: () => startPinPick(id) });
  items.push({ label: '編輯', fn: () => openEditPlace(p) });
  items.push({ label: '刪除', fn: () => deletePlace(id), danger: true });
  showActionSheet(items);
}

function startPinPick(id) {
  pinPickId = id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('請在地圖上點一下店家位置');
}

function setPlacePosition(id, lat, lng) {
  const p = S.places.find(x => x.id === id);
  if (!p) return;
  const backup = { lat: p.lat, lng: p.lng };
  p.lat = lat;
  p.lng = lng;
  renderFoodmap();
  Api.write('fc_places', 'update', { lat, lng }, id)
    .then(() => showToast('位置已更新 ✓'))
    .catch(() => {
      p.lat = backup.lat; p.lng = backup.lng;
      renderFoodmap(); showToast('更新失敗', true);
    });
}

// Place Modal
function openAddPlace() {
  document.getElementById('place-modal-title').textContent = '新增店家';
  document.getElementById('place-id').value    = '';
  document.getElementById('place-url').value   = '';
  document.getElementById('place-name').value  = '';
  document.getElementById('place-notes').value = '';
  document.getElementById('place-resolve-hint').textContent = '在 Google Maps 按「分享」複製連結,貼上後按「解析」';
  placeDraft = { lat: null, lng: null, address: null };
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  setPlacePrice(0);
  openModal('place-modal');
}

function openEditPlace(p) {
  document.getElementById('place-modal-title').textContent = '編輯店家';
  document.getElementById('place-id').value    = p.id;
  document.getElementById('place-url').value   = p.gmaps_url || '';
  document.getElementById('place-name').value  = p.name;
  document.getElementById('place-notes').value = p.notes || '';
  document.getElementById('place-resolve-hint').textContent = p.address ? `📍 ${p.address}` : '';
  placeDraft = { lat: p.lat, lng: p.lng, address: p.address };
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === p.category));
  setPlacePrice(p.price_level || 0);
  openModal('place-modal');
}

async function resolvePlaceUrl() {
  const url  = document.getElementById('place-url').value.trim();
  const hint = document.getElementById('place-resolve-hint');
  const btn  = document.getElementById('place-resolve-btn');
  if (!url) { showToast('請先貼上 Google Maps 連結', true); return; }

  btn.disabled = true;
  btn.textContent = '解析中';
  hint.textContent = '解析中…';
  try {
    const r = await Api.resolvePlace(url);
    if (r.name) document.getElementById('place-name').value = r.name;
    placeDraft = { lat: r.lat, lng: r.lng, address: r.address };
    if (r.lat != null) {
      hint.textContent = `📍 ${r.address || `已定位（${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}）`}`;
    } else if (r.name) {
      hint.textContent = '⚠️ 抓不到座標,儲存後可用選單「在地圖上點選位置」補定位';
    } else {
      hint.textContent = '⚠️ 解析不到資料,請手動輸入店名';
    }
  } catch (err) {
    hint.textContent = `⚠️ ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '解析';
  }
}

async function savePlace() {
  const id    = document.getElementById('place-id').value;
  const name  = document.getElementById('place-name').value.trim();
  const url   = document.getElementById('place-url').value.trim();
  const notes = document.getElementById('place-notes').value.trim();
  const catBtn = document.querySelector('.cat-btn.active');

  if (!name)   { showToast('請輸入店名', true); return; }
  if (!catBtn) { showToast('請選擇分類', true); return; }

  const data = {
    name,
    category:  catBtn.dataset.cat,
    gmaps_url: url || null,
    address:   placeDraft.address,
    lat:       placeDraft.lat,
    lng:       placeDraft.lng,
    notes:     notes || null,
    price_level: placePrice || null,
  };

  if (id) {
    const i = S.places.findIndex(p => p.id === id);
    const backup = i >= 0 ? { ...S.places[i] } : null;
    if (i >= 0) S.places[i] = { ...S.places[i], ...data };
    closeModal('place-modal');
    render();
    Api.write('fc_places', 'update', data, id)
      .then(r => { if (i >= 0) { S.places[i] = r.data; render(); } })
      .catch(() => {
        if (i >= 0 && backup) S.places[i] = backup;
        render(); showToast('儲存失敗', true);
      });
  } else {
    const tempId = `_tmp_${Date.now()}`;
    S.places.unshift({ id: tempId, ...data, eaten: false, rating: null, review: null, created_at: new Date().toISOString() });
    closeModal('place-modal');
    render();
    if (data.lat != null && foodMap) foodMap.flyTo([data.lat, data.lng], 15, { duration: 0.6 });
    Api.write('fc_places', 'insert', data)
      .then(r => {
        const idx = S.places.findIndex(p => p.id === tempId);
        if (idx >= 0) S.places[idx] = r.data;
        render();
      })
      .catch(() => {
        S.places = S.places.filter(p => p.id !== tempId);
        render(); showToast('儲存失敗', true);
      });
  }
}

// Rate Modal(標記已吃 + 評分)
function openRateModal(p) {
  document.getElementById('rate-place-id').value = p.id;
  document.getElementById('rate-place-name').textContent = `「${p.name}」`;
  document.getElementById('rate-review').value = p.review || '';
  setStars(p.rating || 0);
  setPrice(p.price_level || 0);
  openModal('rate-modal');
}

function setStars(n) {
  rateStars = n;
  document.querySelectorAll('#star-picker button').forEach(b =>
    b.classList.toggle('lit', +b.dataset.star <= n));
}

function setPrice(n) {
  ratePrice = n;
  document.querySelectorAll('.price-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.level === n));
}

function setPlacePrice(n) {
  placePrice = n;
  document.querySelectorAll('.pprice-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.level === n));
}

function saveRating() {
  const id     = document.getElementById('rate-place-id').value;
  const review = document.getElementById('rate-review').value.trim();
  if (!rateStars) { showToast('請點星星評分', true); return; }

  const p = S.places.find(x => x.id === id);
  if (!p) return;
  const backup = { eaten: p.eaten, rating: p.rating, review: p.review, price_level: p.price_level };
  p.eaten  = true;
  p.rating = rateStars;
  p.review = review || null;
  p.price_level = ratePrice || null;
  closeModal('rate-modal');
  render();
  Api.write('fc_places', 'update', { eaten: true, rating: rateStars, review: review || null, price_level: ratePrice || null }, id)
    .then(() => showToast('已標記吃過 ✓'))
    .catch(() => { Object.assign(p, backup); render(); showToast('儲存失敗', true); });
}

function revertPlaceTodo(id) {
  const p = S.places.find(x => x.id === id);
  if (!p) return;
  p.eaten = false;  // 保留 rating/review,之後再標已吃可沿用
  render();
  Api.write('fc_places', 'update', { eaten: false }, id)
    .catch(() => { p.eaten = true; render(); showToast('操作失敗', true); });
}

function deletePlace(id) {
  if (!confirm('確定要刪除這家店？')) return;
  const backup = [...S.places];
  S.places = S.places.filter(p => p.id !== id);
  render();
  Api.write('fc_places', 'delete', null, id)
    .catch(() => { S.places = backup; render(); showToast('刪除失敗', true); });
}

// ── FAB / Tab Switching ────────────────────────────────────────────────────
function openAddModal() {
  if (S.tab === 'wishlist') openAddWish();
  else if (S.tab === 'foodmap') openAddPlace();
  else openAddEvent(S.view === 'grid' && S.selectedDay ? S.selectedDay : null);
}

function switchTab(tab) {
  S.tab = tab;
  pinPickId = null;  // 離開分頁就取消「點地圖定位」模式
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.getElementById('view-toggle-bar').classList.toggle('hidden', tab !== 'calendar');
  window.scrollTo(0, 0);
  render();
}

function switchView(view) {
  S.view = view;
  window.scrollTo(0, 0);
  if (view === 'grid') {
    const today = new Date();
    S.gridYear  = today.getFullYear();
    S.gridMonth = today.getMonth();
    S.selectedDay = todayStr();
  } else {
    S.selectedDay = null;
  }
  document.getElementById('btn-list').classList.toggle('active', view === 'list');
  document.getElementById('btn-grid').classList.toggle('active', view === 'grid');
  document.getElementById('list-view').classList.toggle('hidden', view !== 'list');
  document.getElementById('grid-view').classList.toggle('hidden', view !== 'grid');
  render();
}

function prevMonth() {
  if (--S.gridMonth < 0) { S.gridMonth = 11; S.gridYear--; }
  S.selectedDay = null;
  renderGridView();
}

function nextMonth() {
  if (++S.gridMonth > 11) { S.gridMonth = 0; S.gridYear++; }
  S.selectedDay = null;
  renderGridView();
}

function logout() {
  if (!confirm('確定要登出嗎？下次需要重新輸入驗證碼。')) return;
  Auth.clear();
  showAuth();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = `toast${isError ? ' toast-error' : ''}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
