// ── State ──────────────────────────────────────────────────────────────────
const S = {
  events:    [],
  wishlist:  [],
  tab:       'calendar',   // 'calendar' | 'wishlist'
  view:      'list',       // 'list' | 'grid'
  gridYear:  new Date().getFullYear(),
  gridMonth: new Date().getMonth(),
  selectedDay: null,
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
    const [events, wishlist] = await Promise.all([Api.getEvents(), Api.getWishlist()]);
    S.events   = events;
    S.wishlist = wishlist;
    render();
  } catch (err) {
    console.error('Load error:', err);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  renderUpcoming();
  renderFAB();
  if (S.tab === 'calendar') {
    document.getElementById('calendar-tab').classList.remove('hidden');
    document.getElementById('wishlist-tab').classList.add('hidden');
    if (S.view === 'list') renderListView(); else renderGridView();
  } else {
    document.getElementById('calendar-tab').classList.add('hidden');
    document.getElementById('wishlist-tab').classList.remove('hidden');
    renderWishlist();
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
      <span class="upcoming-item-title" style="color:${cfg.color}">${e.title}</span>
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

  // 自動捲動到當月
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthEl = document.getElementById(`month-${todayKey}`);
  if (monthEl) {
    requestAnimationFrame(() => monthEl.scrollIntoView({ block: 'start', behavior: 'instant' }));
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
  const s   = new Date(e.start_date + 'T00:00:00');
  let dateStr = `${s.getMonth() + 1}/${String(s.getDate()).padStart(2, '0')}`;
  if (e.end_date && e.end_date !== e.start_date) {
    const en = new Date(e.end_date + 'T00:00:00');
    dateStr += `–${en.getMonth() + 1}/${String(en.getDate()).padStart(2, '0')}`;
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
        <span class="event-title">${e.title}</span>
      </div>
      <div class="event-row2">
        <span class="event-badge" style="color:${cfg.color};background:${cfg.bg}">${e.type}</span>
        ${e.notes ? `<span class="event-notes">${e.notes}</span>` : ''}
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
        <span class="event-title">${w.name}</span>
      </div>
      <div class="event-row2">
        ${w.url ? `<a class="wish-link" href="${w.url}" target="_blank" rel="noopener noreferrer">🔗 查看連結</a>` : ''}
        ${w.notes ? `<span class="event-notes">${w.notes}</span>` : ''}
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

// ── FAB / Tab Switching ────────────────────────────────────────────────────
function openAddModal() {
  if (S.tab === 'wishlist') openAddWish();
  else openAddEvent(S.view === 'grid' && S.selectedDay ? S.selectedDay : null);
}

function switchTab(tab) {
  S.tab = tab;
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
