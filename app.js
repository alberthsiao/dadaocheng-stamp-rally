/* ══════════════════════════════════════════════════════════
   璀璨煙火・時光拼圖 — 逛街地圖
   純前端、零依賴；集章紀錄存在 localStorage
   ══════════════════════════════════════════════════════════ */

const STORE_KEY = 'yongle-stamp-v1';
const THEME_KEY = 'yongle-theme';
const MAX_ROUNDS = 3;                       // 每張 DM 最多完成 3 次彩虹任務

const COLOR_MAP = Object.fromEntries(COLORS.map((c) => [c.key, c]));

/** 使用者狀態：已集章的編號 + 每家店的筆記 */
const state = {
  collected: new Set(),
  notes: {},
};

/** 畫面篩選條件（不進 localStorage，重整即回預設） */
const ui = {
  query: '',
  colors: new Set(),      // 空 = 不限顏色
  status: 'all',          // all | todo | done
  street: 'all',
  view: 'color',          // color | route | number
};

// ── 儲存 ───────────────────────────────────────────────────

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.collected)) {
      data.collected.forEach((id) => {
        const n = Number(id);
        if (SHOPS.some((s) => s.id === n)) state.collected.add(n);
      });
    }
    if (data.notes && typeof data.notes === 'object') {
      for (const [id, text] of Object.entries(data.notes)) {
        if (typeof text === 'string' && text.trim()) state.notes[Number(id)] = text;
      }
    }
  } catch (err) {
    console.warn('讀取集章紀錄失敗，改用空白紀錄', err);
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      collected: [...state.collected].sort((a, b) => a - b),
      notes: state.notes,
      savedAt: new Date().toISOString(),
    }));
  } catch (err) {
    toast('紀錄存不進瀏覽器，請確認未使用無痕模式');
  }
}

// ── 統計：彩虹任務進度 ─────────────────────────────────────

function stats() {
  const perColor = {};
  COLORS.forEach((c) => { perColor[c.key] = 0; });
  state.collected.forEach((id) => {
    const shop = SHOPS.find((s) => s.id === id);
    if (shop) perColor[shop.color] += 1;
  });

  // 每色至少各 1 家 = 1 次彩虹任務；取七色的最小值，上限 3 次
  const rounds = Math.min(MAX_ROUNDS, Math.min(...COLORS.map((c) => perColor[c.key])));

  // 下一輪還缺的顏色：該色數量還沒到 rounds + 1
  const missing = COLORS.filter((c) => perColor[c.key] <= rounds && rounds < MAX_ROUNDS);

  return { perColor, rounds, missing, total: state.collected.size };
}

// ── 篩選與分組 ─────────────────────────────────────────────

function matchesQuery(shop, q) {
  if (!q) return true;

  // 輸入 1–2 位數字視為找編號，不然「23」會被一堆門牌含 23 的地址淹沒
  if (/^\d{1,2}$/.test(q)) {
    const n = Number(q);
    if (n >= 1 && n <= SHOPS.length) return shop.id === n;
  }

  const hay = [
    shop.name,
    shop.sub || '',
    shop.addr,
    shop.place || '',
    shop.street,
    COLOR_MAP[shop.color].label,
    String(shop.id),
    String(shop.id).padStart(2, '0'),
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

function filtered() {
  const q = ui.query.trim().toLowerCase();
  return SHOPS.filter((shop) => {
    if (ui.colors.size && !ui.colors.has(shop.color)) return false;
    if (ui.street !== 'all' && shop.street !== ui.street) return false;
    const done = state.collected.has(shop.id);
    if (ui.status === 'todo' && done) return false;
    if (ui.status === 'done' && !done) return false;
    return matchesQuery(shop, q);
  });
}

/** 依檢視模式切成 [{ key, title, meta, color, shops }] */
function grouped(list) {
  if (ui.view === 'route') {
    const byStreet = new Map();
    list.forEach((s) => {
      if (!byStreet.has(s.street)) byStreet.set(s.street, []);
      byStreet.get(s.street).push(s);
    });
    return STREET_ORDER
      .filter((st) => byStreet.has(st))
      .map((st) => ({
        key: st,
        title: st,
        // 同街道依門牌號排序，等於沿路走的順序
        shops: byStreet.get(st).sort((a, b) => a.no - b.no || a.id - b.id),
      }));
  }

  if (ui.view === 'number') {
    return [{ key: 'all', title: '', shops: [...list].sort((a, b) => a.id - b.id) }];
  }

  return COLORS
    .map((c, i) => ({
      key: c.key,
      // 每色固定 10 家，編號區間如「紅　01–10」
      title: `${c.label}　${String(i * 10 + 1).padStart(2, '0')}–${String(i * 10 + 10).padStart(2, '0')}`,
      color: c.hex,
      shops: list.filter((s) => s.color === c.key).sort((a, b) => a.id - b.id),
    }))
    .filter((g) => g.shops.length);
}

// ── DOM 建構 ───────────────────────────────────────────────

const board = document.getElementById('board');

function mapsUrl(shop) {
  const query = `${shop.name} ${EVENT.city}${shop.addr}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function cardEl(shop, freshId) {
  const color = COLOR_MAP[shop.color];
  const done = state.collected.has(shop.id);
  const note = state.notes[shop.id];

  const card = document.createElement('article');
  card.className = `card${done ? ' is-done' : ''}${done && shop.id === freshId ? ' is-fresh' : ''}`;
  card.style.setProperty('--c', color.hex);
  card.dataset.id = String(shop.id);

  const no = document.createElement('div');
  no.className = 'card__no';
  no.textContent = `${color.label} ${String(shop.id).padStart(2, '0')}`;
  card.appendChild(no);

  const name = document.createElement('h3');
  name.className = 'card__name';
  name.textContent = shop.name;
  card.appendChild(name);

  if (shop.sub) {
    const sub = document.createElement('div');
    sub.className = 'card__sub';
    sub.textContent = shop.sub;
    card.appendChild(sub);
  }

  const addr = document.createElement('p');
  addr.className = 'card__addr';
  addr.textContent = shop.addr;
  card.appendChild(addr);

  if (shop.place) {
    const place = document.createElement('div');
    place.className = 'card__place';
    place.textContent = `（${shop.place}）`;
    card.appendChild(place);
  }

  if (note) {
    const noteEl = document.createElement('div');
    noteEl.className = 'card__note';
    noteEl.textContent = note;
    card.appendChild(noteEl);
  }

  const stamp = document.createElement('div');
  stamp.className = 'card__stamp';
  stamp.textContent = '已集';
  card.appendChild(stamp);

  const actions = document.createElement('div');
  actions.className = 'card__actions';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'act act--toggle';
  toggle.dataset.action = 'toggle';
  toggle.textContent = done ? '取消集章' : '蓋章';
  toggle.setAttribute('aria-pressed', String(done));
  actions.appendChild(toggle);

  const map = document.createElement('a');
  map.className = 'act';
  map.href = mapsUrl(shop);
  map.target = '_blank';
  map.rel = 'noopener noreferrer';
  map.textContent = '地圖';
  actions.appendChild(map);

  const noteBtn = document.createElement('button');
  noteBtn.type = 'button';
  noteBtn.className = 'act act--icon';
  noteBtn.dataset.action = 'note';
  noteBtn.textContent = '✎';
  noteBtn.title = note ? '編輯筆記' : '新增筆記';
  noteBtn.setAttribute('aria-label', `${note ? '編輯' : '新增'}${shop.name}的筆記`);
  actions.appendChild(noteBtn);

  card.appendChild(actions);
  return card;
}

function render(freshId) {
  const list = filtered();
  board.replaceChildren();

  document.getElementById('resultCount').textContent =
    `顯示 ${list.length} 家${list.length < SHOPS.length ? `（共 ${SHOPS.length} 家）` : ''}`;

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<span class="empty__icon">🏮</span>找不到符合條件的店家<br>試著放寬篩選或換個關鍵字';
    board.appendChild(empty);
    renderProgress();
    return;
  }

  grouped(list).forEach((group) => {
    const section = document.createElement('section');
    section.className = 'group';

    if (group.title) {
      const head = document.createElement('div');
      head.className = 'group__head';
      if (group.color) head.style.setProperty('--c', group.color);

      const title = document.createElement('h2');
      title.className = 'group__title';
      title.textContent = group.title;
      head.appendChild(title);

      const doneCount = group.shops.filter((s) => state.collected.has(s.id)).length;
      const meta = document.createElement('span');
      meta.className = 'group__meta';
      meta.textContent = `${doneCount} / ${group.shops.length} 已集章`;
      head.appendChild(meta);

      section.appendChild(head);
    }

    const cards = document.createElement('div');
    cards.className = 'cards';
    group.shops.forEach((shop) => cards.appendChild(cardEl(shop, freshId)));
    section.appendChild(cards);

    board.appendChild(section);
  });

  renderProgress();
}

// ── 進度區 ─────────────────────────────────────────────────

function renderProgress() {
  const { perColor, rounds, missing, total } = stats();

  document.getElementById('statStamps').textContent = String(total);
  document.getElementById('statRounds').textContent = String(rounds);
  document.getElementById('statGacha').textContent = String(rounds);
  document.getElementById('totalBar').style.width = `${(total / SHOPS.length) * 100}%`;
  document.getElementById('totalBarWrap')
    .setAttribute('aria-label', `總集章進度 ${total} / ${SHOPS.length}`);

  // 提示文字：告訴使用者下一步該蒐集什麼顏色
  const hint = document.getElementById('nextHint');
  if (total === SHOPS.length) {
    hint.innerHTML = '<strong>70 家全數集滿！</strong>記得投摸彩箱，參加 8/15 直播大獎摸彩。';
  } else if (rounds >= MAX_ROUNDS) {
    hint.innerHTML = `<strong>三次彩虹任務全達成！</strong>再收 ${SHOPS.length - total} 家即可挑戰 70 家大獎摸彩。`;
  } else if (total === 0) {
    hint.textContent = '七色各集 1 家＝完成 1 次彩虹任務，最多 3 次。點「蓋章」記錄你走過的店。';
  } else if (missing.length === COLORS.length) {
    hint.innerHTML = `第 <strong>${rounds + 1}</strong> 次彩虹任務：七色各再集 1 家（須是不同編號的店）`;
  } else {
    const chips = missing
      .map((c) => `<strong style="color:${c.hex}">${c.label}</strong>`)
      .join('、');
    hint.innerHTML = `第 ${rounds + 1} 次彩虹任務還缺：${chips}`;
  }

  // 七色長條
  const rainbow = document.getElementById('rainbow');
  rainbow.replaceChildren();
  COLORS.forEach((c) => {
    const li = document.createElement('li');
    li.className = `rb${ui.colors.has(c.key) ? ' is-active' : ''}`;
    li.style.setProperty('--c', c.hex);
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-pressed', String(ui.colors.has(c.key)));
    li.setAttribute('aria-label', `${c.label}色 已集 ${perColor[c.key]} 家，共 10 家`);
    li.dataset.color = c.key;

    const label = document.createElement('span');
    label.className = 'rb__label';
    label.textContent = c.label;
    li.appendChild(label);

    const count = document.createElement('span');
    count.className = 'rb__count';
    count.textContent = `${perColor[c.key]}/10`;
    li.appendChild(count);

    const dots = document.createElement('span');
    dots.className = 'rb__dots';
    for (let i = 1; i <= MAX_ROUNDS; i += 1) {
      const dot = document.createElement('span');
      dot.className = `rb__dot${perColor[c.key] >= i ? ' is-on' : ''}`;
      dots.appendChild(dot);
    }
    li.appendChild(dots);

    rainbow.appendChild(li);
  });

  syncColorChips();
}

// ── 互動 ───────────────────────────────────────────────────

function toggleStamp(id) {
  const shop = SHOPS.find((s) => s.id === id);
  if (!shop) return;

  const before = stats();
  if (state.collected.has(id)) {
    state.collected.delete(id);
    save();
    render();
    toast(`已取消 ${String(id).padStart(2, '0')} ${shop.name} 的章`);
    return;
  }

  state.collected.add(id);
  save();
  render(id);

  const after = stats();
  if (after.total === SHOPS.length) {
    toast('🎊 70 家全數集滿！可投摸彩箱參加 8/15 直播大獎摸彩');
  } else if (after.rounds > before.rounds) {
    toast(`🌈 完成第 ${after.rounds} 次彩虹任務！可去民樂街夾扭蛋`);
  } else {
    toast(`蓋章成功 ${String(id).padStart(2, '0')} ${shop.name}`);
  }
}

function editNote(id) {
  const shop = SHOPS.find((s) => s.id === id);
  if (!shop) return;
  const current = state.notes[id] || '';
  const next = window.prompt(`${shop.name} 的筆記（吃了什麼、幾點營業…）`, current);
  if (next === null) return;

  if (next.trim()) state.notes[id] = next.trim();
  else delete state.notes[id];

  save();
  render();
}

/** 依「彩虹任務最缺的顏色」推薦下一家沒去過的店 */
function suggestNextStop() {
  const { perColor, rounds } = stats();
  const remaining = SHOPS.filter((s) => !state.collected.has(s.id));

  if (!remaining.length) {
    toast('🎊 70 家都集滿了，沒有下一站了！');
    return;
  }

  let pool = remaining;
  if (rounds < MAX_ROUNDS) {
    // 優先補目前枚數最少的顏色，最快湊齊下一次彩虹
    const min = Math.min(...COLORS.map((c) => perColor[c.key]));
    const needKeys = COLORS.filter((c) => perColor[c.key] === min).map((c) => c.key);
    const scoped = remaining.filter((s) => needKeys.includes(s.color));
    if (scoped.length) pool = scoped;
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  const reason = rounds < MAX_ROUNDS
    ? `補第 ${rounds + 1} 次彩虹的${COLOR_MAP[pick.color].label}色`
    : '衝 70 家大獎';

  // 若目前的篩選會讓推薦店家不在畫面上，先清掉篩選再捲過去
  if (!filtered().some((s) => s.id === pick.id)) {
    ui.query = '';
    ui.colors.clear();
    ui.status = 'all';
    ui.street = 'all';
    document.getElementById('search').value = '';
    document.getElementById('searchClear').hidden = true;
    document.getElementById('streetSelect').value = 'all';
    syncStatusChips();
  }

  render();

  const card = board.querySelector(`.card[data-id="${pick.id}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('is-spotlight');
    setTimeout(() => card.classList.remove('is-spotlight'), 3200);
  }
  toast(`下一站：${String(pick.id).padStart(2, '0')} ${pick.name}（${reason}）`);
}

// ── 工具列同步 ─────────────────────────────────────────────

function syncColorChips() {
  document.querySelectorAll('#colorChips .chip').forEach((chip) => {
    const on = ui.colors.has(chip.dataset.color);
    chip.classList.toggle('is-on', on);
    chip.setAttribute('aria-pressed', String(on));
  });
}

function syncStatusChips() {
  document.querySelectorAll('.chip--status').forEach((chip) => {
    const on = chip.dataset.status === ui.status;
    chip.classList.toggle('is-on', on);
    chip.setAttribute('aria-pressed', String(on));
  });
}

function buildColorChips() {
  const wrap = document.getElementById('colorChips');
  COLORS.forEach((c) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.color = c.key;
    chip.style.setProperty('--c', c.hex);
    chip.style.setProperty('--ink', c.ink);
    chip.textContent = c.label;
    chip.setAttribute('aria-pressed', 'false');
    wrap.appendChild(chip);
  });
}

function buildStreetSelect() {
  const select = document.getElementById('streetSelect');
  const counts = new Map();
  SHOPS.forEach((s) => counts.set(s.street, (counts.get(s.street) || 0) + 1));

  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = `全部（${SHOPS.length}）`;
  select.appendChild(all);

  STREET_ORDER.filter((st) => counts.has(st)).forEach((st) => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = `${st}（${counts.get(st)}）`;
    select.appendChild(opt);
  });
}

// ── 活動資訊 ───────────────────────────────────────────────

function fillEventInfo() {
  document.getElementById('kicker').textContent = EVENT.subtitle.split('｜')[0];
  document.getElementById('dateRange').textContent = EVENT.dateLabel;
  document.getElementById('linkMap').href = EVENT.links.map;
  document.getElementById('linkVideo').href = EVENT.links.video;
  const gachaPlace = document.getElementById('gachaPlace');
  gachaPlace.textContent = EVENT.gacha.place;
  gachaPlace.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(EVENT.gacha.place)}`;
  document.getElementById('gachaHours').textContent = EVENT.gacha.hours;
  document.getElementById('organizer').textContent = EVENT.organizer;
  document.getElementById('advisor').textContent = EVENT.advisor;

  const list = document.getElementById('rulesList');
  EVENT.rules.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  });

  // 倒數：以當天 00:00 為基準算整數天
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${EVENT.start}T00:00:00`);
  const end = new Date(`${EVENT.end}T00:00:00`);
  const day = 86400000;
  const el = document.getElementById('countdown');

  if (today < start) {
    el.textContent = `距開跑還有 ${Math.round((start - today) / day)} 天`;
  } else if (today > end) {
    el.textContent = '活動已結束';
  } else {
    const left = Math.round((end - today) / day);
    el.textContent = left === 0 ? '今天是最後一天！' : `還有 ${left} 天`;
  }
}

// ── 備份／還原 ─────────────────────────────────────────────

function exportBackup() {
  const payload = {
    app: 'yongle-stamp',
    version: 1,
    exportedAt: new Date().toISOString(),
    collected: [...state.collected].sort((a, b) => a - b),
    notes: state.notes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `永樂集章備份-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已匯出備份檔');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!Array.isArray(data.collected)) throw new Error('格式不符');

      state.collected = new Set(
        data.collected.map(Number).filter((n) => SHOPS.some((s) => s.id === n)),
      );
      state.notes = {};
      if (data.notes && typeof data.notes === 'object') {
        for (const [id, text] of Object.entries(data.notes)) {
          if (typeof text === 'string' && text.trim()) state.notes[Number(id)] = text;
        }
      }
      save();
      render();
      toast(`已還原 ${state.collected.size} 家的集章紀錄`);
    } catch (err) {
      toast('備份檔讀取失敗，請確認是本站匯出的 JSON');
    }
  };
  reader.readAsText(file);
}

// ── Toast ──────────────────────────────────────────────────

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 2600);
}

// ── 主題 ───────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    .setAttribute('content', theme === 'light' ? '#fbf4e6' : '#101736');
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* 無痕模式忽略 */ }
}

function initTheme() {
  let theme;
  try { theme = localStorage.getItem(THEME_KEY); } catch { theme = null; }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme(theme);
}

// ── 事件綁定 ───────────────────────────────────────────────

function bindEvents() {
  const search = document.getElementById('search');
  const searchClear = document.getElementById('searchClear');

  search.addEventListener('input', () => {
    ui.query = search.value;
    searchClear.hidden = !search.value;
    render();
  });
  searchClear.addEventListener('click', () => {
    search.value = '';
    ui.query = '';
    searchClear.hidden = true;
    search.focus();
    render();
  });

  document.getElementById('colorChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const key = chip.dataset.color;
    if (ui.colors.has(key)) ui.colors.delete(key);
    else ui.colors.add(key);
    render();
  });

  document.querySelectorAll('.chip--status').forEach((chip) => {
    chip.addEventListener('click', () => {
      ui.status = chip.dataset.status;
      syncStatusChips();
      render();
    });
  });

  // 七色長條也能當顏色篩選用
  document.getElementById('rainbow').addEventListener('click', (e) => {
    const rb = e.target.closest('.rb');
    if (!rb) return;
    const key = rb.dataset.color;
    if (ui.colors.has(key)) ui.colors.delete(key);
    else ui.colors.add(key);
    render();
  });
  document.getElementById('rainbow').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const rb = e.target.closest('.rb');
    if (!rb) return;
    e.preventDefault();
    rb.click();
  });

  document.getElementById('streetSelect').addEventListener('change', (e) => {
    ui.street = e.target.value;
    render();
  });
  document.getElementById('viewSelect').addEventListener('change', (e) => {
    ui.view = e.target.value;
    render();
  });

  // 卡片上的蓋章／筆記
  board.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.closest('.card').dataset.id);
    if (btn.dataset.action === 'toggle') toggleStamp(id);
    if (btn.dataset.action === 'note') editNote(id);
  });

  document.getElementById('nextStopBtn').addEventListener('click', suggestNextStop);

  document.getElementById('themeToggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });

  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importBackup(file);
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!state.collected.size && !Object.keys(state.notes).length) {
      toast('目前沒有任何紀錄');
      return;
    }
    if (!window.confirm('確定清除所有集章紀錄與筆記？此動作無法復原。')) return;
    state.collected.clear();
    state.notes = {};
    save();
    render();
    toast('已清除所有紀錄');
  });
}

// ── Service Worker：街上沒訊號也打得開 ─────────────────────

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;      // 直接開檔時不支援，略過

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // controller 已存在代表這是「更新」而非首次安裝
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('已有新版本，重新整理即可套用');
          }
        });
      });
    }).catch(() => { /* 註冊失敗不影響主功能，照樣能用 */ });
  });
}

// ── 啟動 ───────────────────────────────────────────────────

initTheme();
load();
fillEventInfo();
buildColorChips();
buildStreetSelect();
bindEvents();
render();
initServiceWorker();
