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

// ── 定位與距離 ─────────────────────────────────────────────

/** 使用者目前位置；null = 尚未定位 */
let geo = null;

/** 目前規劃出的路線；地圖用它畫連線與站序 */
let currentPlan = null;

const EARTH_R = 6371000;

/** 兩點間大圓距離（公尺）。大稻埕範圍小，這個精度綽綽有餘 */
function haversine(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

function fmtDist(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** 以 80 公尺／分鐘（約 4.8 km/h）估步行時間 */
function fmtWalk(m) {
  const min = Math.max(1, Math.round(m / 80));
  return min < 60 ? `約 ${min} 分鐘` : `約 ${Math.floor(min / 60)} 小時 ${min % 60} 分`;
}

/** 保險用逾時：規範上「等使用者回應權限提示」不計入 timeout，
 *  某些瀏覽器在這期間兩個回呼都不會來，按鈕就會永遠卡在「定位中…」 */
const GEO_GUARD_MS = 20000;

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      fn(value);
    };
    const guard = setTimeout(
      () => finish(reject, { code: 0, message: 'guard timeout' }),
      GEO_GUARD_MS,
    );

    navigator.geolocation.getCurrentPosition(
      (pos) => finish(resolve, {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        acc: pos.coords.accuracy,
      }),
      (err) => finish(reject, err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

function geoErrorMessage(err) {
  if (err && err.code === 1) return '定位被拒絕，請在瀏覽器允許此網站取用位置';
  if (err && err.code === 2) return '抓不到位置，請確認裝置的定位服務已開啟';
  if (err && err.code === 3) return '定位逾時，請到空曠處再試一次';
  if (err && err.code === 0) return '等不到定位授權，允許之後再按一次';
  return '這個瀏覽器不支援定位功能';
}

// ── 路線規劃 ───────────────────────────────────────────────

/**
 * 站點集合固定，用 2-opt 反覆改善順序讓總路程最短
 * 起點為使用者位置、終點自由（不需繞回原點）
 */
function orderRoute(origin, stops) {
  const totalOf = (arr) => {
    let d = 0;
    let cur = origin;
    for (const s of arr) { d += haversine(cur, s); cur = s; }
    return d;
  };

  let best = [...stops];
  let bestD = totalOf(best);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const cand = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const d = totalOf(cand);
        if (d < bestD - 0.01) { best = cand; bestD = d; improved = true; }
      }
    }
  }

  const legs = [];
  let cur = origin;
  for (const s of best) { legs.push(haversine(cur, s)); cur = s; }
  return { stops: best, legs, total: bestD };
}

/**
 * 規劃最快完成下一次彩虹任務的路線
 * 每色取幾家近的當種子各跑一次最近鄰貪婪，再各自 2-opt，取總距離最短者
 */
function planRoute(origin) {
  const { perColor, rounds } = stats();
  const remaining = SHOPS.filter((s) => !state.collected.has(s.id));
  if (!remaining.length) return null;

  // 三輪彩虹都完成了 → 改推薦最近的未集章店家，衝 70 家大獎
  if (rounds >= MAX_ROUNDS) {
    const stops = remaining
      .map((s) => ({ s, d: haversine(origin, s) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map((x) => x.s);
    return { mode: 'sweep', round: rounds, ...orderRoute(origin, stops) };
  }

  const needColors = COLORS.filter((c) => perColor[c.key] <= rounds).map((c) => c.key);

  // 每色只留離起點最近的幾家當候選，再列舉所有組合各自 2-opt。
  // 純貪婪會被「起步最近」誤導（0 公尺那家可能讓後面繞遠路），
  // 3^7 = 2187 組合在手機上也只要幾十毫秒，換得接近最佳的路線。
  const CANDIDATES = 3;
  const pools = needColors.map((key) => remaining
    .filter((s) => s.color === key)
    .map((s) => ({ s, d: haversine(origin, s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, CANDIDATES)
    .map((x) => x.s));
  if (pools.some((p) => !p.length)) return null;

  let best = null;
  const walk = (i, picked) => {
    if (i === pools.length) {
      const r = orderRoute(origin, picked);
      if (!best || r.total < best.total) best = r;
      return;
    }
    for (const s of pools[i]) walk(i + 1, [...picked, s]);
  };
  walk(0, []);

  return best ? { mode: 'rainbow', round: rounds + 1, ...best } : null;
}

/** Google Maps 多點步行導航（中途點最多 9 個，我們最多 7 站） */
function navUrl(origin, stops) {
  const pt = (p) => `${p.lat},${p.lon}`;
  const params = new URLSearchParams({
    api: '1',
    origin: pt(origin),
    destination: pt(stops[stops.length - 1]),
    travelmode: 'walking',
  });
  const mid = stops.slice(0, -1);
  if (mid.length) params.set('waypoints', mid.map(pt).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
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
  if (ui.view === 'near' && geo) {
    return [{
      key: 'near',
      title: '',
      shops: [...list].sort((a, b) => haversine(geo, a) - haversine(geo, b)),
    }];
  }

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

  if (geo) {
    const dist = document.createElement('div');
    dist.className = 'card__dist';
    dist.textContent = `↝ ${fmtDist(haversine(geo, shop))}`;
    card.appendChild(dist);
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
    hint.innerHTML = '<strong>70 家都走完了！</strong>紙本 DM 蓋滿 70 家印章，即可投摸彩箱參加 8/15 直播摸彩。';
  } else if (rounds >= MAX_ROUNDS) {
    hint.innerHTML = `<strong>三次彩虹都湊齊了！</strong>再走 ${SHOPS.length - total} 家就能挑戰 70 家大獎摸彩。`;
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
    refreshPlanIfOpen();
    refreshMapIfOpen();
    toast(`已取消 ${String(id).padStart(2, '0')} ${shop.name} 的紀錄`);
    return;
  }

  state.collected.add(id);
  save();
  render(id);
  refreshPlanIfOpen();
  refreshMapIfOpen();

  const after = stats();
  if (after.total === SHOPS.length) {
    toast('🎊 70 家都走完了！紙本 DM 蓋滿 70 家才能投摸彩箱');
  } else if (after.rounds > before.rounds) {
    toast(`🌈 第 ${after.rounds} 次彩虹湊齊了！紙本蓋滿七色才能去民樂街夾扭蛋`);
  } else {
    toast(`已記錄 ${String(id).padStart(2, '0')} ${shop.name}`);
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

// ── 地圖 ───────────────────────────────────────────────────

/** 經緯度 → 地圖公尺座標（原點在西北角） */
function toMapXY(p) {
  return {
    x: (p.lon - MAP_BOX.minLon) * MAP_BOX.mLon,
    y: (MAP_BOX.maxLat - p.lat) * MAP_BOX.mLat,
  };
}

/** 同一等級的路合併成一條 path，315 條路只產生 3 個節點 */
function roadPaths() {
  const d = { 1: '', 2: '', 3: '' };
  for (const road of MAP_ROADS) {
    let s = '';
    for (let i = 0; i < road.p.length; i += 2) {
      s += `${i ? 'L' : 'M'}${road.p[i]} ${road.p[i + 1]}`;
    }
    d[road.r] += s;
  }
  return d;
}

let mapRendered = false;

/**
 * 同一座標的店家繞成一圈散開（永樂市場一棟樓裡就有 4 家）
 * 回傳 id → { dx, dy } 的位移表，單位公尺
 */
function pinOffsets() {
  const groups = new Map();
  for (const shop of SHOPS) {
    const key = `${shop.lat},${shop.lon}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shop);
  }
  const offsets = new Map();
  for (const list of groups.values()) {
    if (list.length === 1) { offsets.set(list[0].id, { dx: 0, dy: 0 }); continue; }
    const r = 17;
    list.forEach((shop, i) => {
      const a = (Math.PI * 2 * i) / list.length - Math.PI / 2;
      offsets.set(shop.id, { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r) });
    });
  }
  return offsets;
}

function renderMap() {
  const host = document.getElementById('map');
  if (!host) return;
  const offsets = pinOffsets();

  const d = roadPaths();
  const parts = [];

  parts.push(`<svg viewBox="0 0 ${MAP_BOX.w} ${MAP_BOX.h}" class="map__svg" role="img" aria-label="大稻埕活動店家位置圖">`);

  // 街道由細到粗疊上去
  parts.push(`<path class="road road--3" d="${d[3]}"/>`);
  parts.push(`<path class="road road--2" d="${d[2]}"/>`);
  parts.push(`<path class="road road--1" d="${d[1]}"/>`);

  // 街道名稱
  // 直排街名用逐字 tspan：SVG 的 writing-mode 在多數瀏覽器不會正確斷行
  const LH = 23;
  for (const l of MAP_LABELS) {
    if (!l.v) {
      parts.push(`<text class="map__road-name" x="${l.x}" y="${l.y}">${l.t}</text>`);
      continue;
    }
    const chars = [...l.t];
    const top = l.y - ((chars.length - 1) * LH) / 2;
    const spans = chars
      .map((ch, i) => `<tspan x="${l.x}" dy="${i ? LH : 0}">${ch}</tspan>`)
      .join('');
    parts.push(`<text class="map__road-name" x="${l.x}" y="${Math.round(top)}">${spans}</text>`);
  }

  // 規劃出的路線：先畫線再畫點，避免蓋住店家
  if (currentPlan && geo) {
    const pts = [toMapXY(geo), ...currentPlan.stops.map((s2) => {
      const base = toMapXY(s2);
      const o = offsets.get(s2.id) || { dx: 0, dy: 0 };
      return { x: base.x + o.dx, y: base.y + o.dy };
    })];
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x)} ${Math.round(p.y)}`).join('');
    parts.push(`<path class="map__route" d="${path}"/>`);
  }

  // 店家
  const planIds = currentPlan ? currentPlan.stops.map((s) => s.id) : [];
  for (const shop of SHOPS) {
    const base = toMapXY(shop);
    const off = offsets.get(shop.id) || { dx: 0, dy: 0 };
    const x = base.x + off.dx;
    const y = base.y + off.dy;
    const done = state.collected.has(shop.id);
    const hex = COLOR_MAP[shop.color].hex;
    const step = planIds.indexOf(shop.id);
    parts.push(
      `<g class="pin${done ? ' is-done' : ''}${step >= 0 ? ' is-stop' : ''}" data-id="${shop.id}" tabindex="0" role="button" aria-label="${shop.name}，${shop.addr}${done ? '，已集章' : ''}">`
      + `<circle class="pin__hit" cx="${Math.round(x)}" cy="${Math.round(y)}" r="26"/>`
      + `<circle class="pin__dot" cx="${Math.round(x)}" cy="${Math.round(y)}" r="13" fill="${hex}"/>`
      + (done ? `<circle class="pin__done" cx="${Math.round(x)}" cy="${Math.round(y)}" r="5"/>` : '')
      + (step >= 0 ? `<text class="pin__step" x="${Math.round(x)}" y="${Math.round(y) - 22}">${step + 1}</text>` : '')
      + '</g>',
    );
  }

  // 我的位置
  if (geo) {
    const { x, y } = toMapXY(geo);
    if (x > -100 && x < MAP_BOX.w + 100 && y > -100 && y < MAP_BOX.h + 100) {
      parts.push(`<g class="me"><circle class="me__halo" cx="${Math.round(x)}" cy="${Math.round(y)}" r="34"/>`
        + `<circle class="me__dot" cx="${Math.round(x)}" cy="${Math.round(y)}" r="11"/></g>`);
    }
  }

  parts.push('</svg>');
  host.innerHTML = parts.join('');

  // 圖例只需要建一次
  const legend = document.getElementById('mapLegend');
  if (!legend.childElementCount) {
    legend.innerHTML = COLORS.map((c) => `<span class="lg"><i style="background:${c.hex}"></i>${c.label}</span>`).join('')
      + '<span class="lg"><i class="lg__done"></i>已集章</span>'
      + '<span class="lg"><i class="lg__me"></i>我的位置</span>';
  }
  mapRendered = true;
}

/** 地圖是展開狀態才重畫，收合時不浪費效能 */
function refreshMapIfOpen() {
  if (document.getElementById('mapDetails').open) renderMap();
}

// ── 路線面板 ───────────────────────────────────────────────

function closePlan() {
  document.getElementById('routePanel').hidden = true;
  currentPlan = null;
  refreshMapIfOpen();
}

function renderPlan(plan, { scroll = true } = {}) {
  currentPlan = plan;
  const panel = document.getElementById('routePanel');
  const list = document.getElementById('planList');

  document.getElementById('planTitle').textContent = plan.mode === 'rainbow'
    ? `最快完成第 ${plan.round} 次彩虹任務`
    : '就近再收幾家，衝 70 家大獎';

  document.getElementById('planSummary').innerHTML =
    `共 <strong>${plan.stops.length}</strong> 站・步行 <strong>${fmtDist(plan.total)}</strong>・${fmtWalk(plan.total)}`;

  list.replaceChildren();
  plan.stops.forEach((shop, i) => {
    const color = COLOR_MAP[shop.color];
    const li = document.createElement('li');
    li.className = 'stop';
    li.style.setProperty('--c', color.hex);
    li.dataset.id = String(shop.id);
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `第 ${i + 1} 站 ${shop.name}，跳到這家店`);

    const no = document.createElement('span');
    no.className = 'stop__no';
    no.textContent = String(i + 1);
    li.appendChild(no);

    const body = document.createElement('div');
    body.className = 'stop__body';

    const name = document.createElement('div');
    name.className = 'stop__name';
    name.textContent = `${color.label}${String(shop.id).padStart(2, '0')}　${shop.name}`;
    body.appendChild(name);

    const addr = document.createElement('div');
    addr.className = 'stop__addr';
    addr.textContent = shop.addr + (shop.place ? `（${shop.place}）` : '');
    body.appendChild(addr);

    li.appendChild(body);

    const d = document.createElement('span');
    d.className = 'stop__dist';
    d.textContent = fmtDist(plan.legs[i]);
    li.appendChild(d);

    list.appendChild(li);
  });

  document.getElementById('planNav').href = navUrl(geo, plan.stops);

  const notes = [];
  if (geo.acc) notes.push(`定位精度約 ±${Math.round(geo.acc)} m`);
  const nearest = Math.min(...SHOPS.map((s) => haversine(geo, s)));
  if (nearest > 1500) notes.push(`你目前離商圈約 ${fmtDist(nearest)}，路線從現在位置起算`);
  if (plan.stops.some((s) => s.approx)) notes.push('部分店家座標由鄰近門牌推算，誤差約 10 公尺');
  notes.push('距離為直線距離，實際步行會再長一些');
  document.getElementById('planNote').textContent = notes.join('；');

  panel.hidden = false;
  refreshMapIfOpen();
  if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 路線開著時，蓋章後即時重算剩下的路 */
function refreshPlanIfOpen() {
  if (document.getElementById('routePanel').hidden || !geo) return;
  const plan = planRoute(geo);
  if (plan) renderPlan(plan, { scroll: false });
  else closePlan();
}

function showGeoHelp() {
  const panel = document.getElementById('geoHelp');
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** 主動作：定位 → 規劃最短集滿路線；定位失敗則退回不需定位的隨機推薦 */
async function handlePlanClick() {
  const btn = document.getElementById('nextStopBtn');
  const label = btn.querySelector('.fab__text');
  const prev = label.textContent;
  btn.disabled = true;
  label.textContent = '定位中…';

  try {
    geo = await locate();
    document.getElementById('geoHelp').hidden = true;
    document.getElementById('nearOption').disabled = false;
    const plan = planRoute(geo);
    render();
    refreshMapIfOpen();
    if (plan) renderPlan(plan);
    else toast('70 家都集滿了，沒有下一段路要走');
  } catch (err) {
    // 後備建議自己也會 toast，會蓋掉失敗原因 → 讓它安靜，兩件事併成一則訊息
    const fallback = suggestNextStop({ silent: true });
    toast(fallback
      ? `${geoErrorMessage(err)}。先推薦 ${String(fallback.shop.id).padStart(2, '0')} ${fallback.shop.name}`
      : geoErrorMessage(err));

    // 被拒絕之後瀏覽器不會再問，光靠 toast 講不清楚怎麼救 → 開指引
    if (err && err.code === 1) showGeoHelp();
  } finally {
    label.textContent = prev;
    btn.disabled = false;
  }
}

/**
 * 依「彩虹任務最缺的顏色」推薦下一家沒去過的店（定位失敗時的後備）
 * silent 時不自己跳 toast，交由呼叫端合併訊息；回傳挑中的店
 */
function suggestNextStop({ silent = false } = {}) {
  const { perColor, rounds } = stats();
  const remaining = SHOPS.filter((s) => !state.collected.has(s.id));

  if (!remaining.length) {
    if (!silent) toast('🎊 70 家都集滿了，沒有下一站了！');
    return null;
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

  focusShop(pick.id);
  if (!silent) toast(`下一站：${String(pick.id).padStart(2, '0')} ${pick.name}（${reason}）`);
  return { shop: pick, reason };
}

function resetFilters() {
  ui.query = '';
  ui.colors.clear();
  ui.status = 'all';
  ui.street = 'all';
  document.getElementById('search').value = '';
  document.getElementById('searchClear').hidden = true;
  document.getElementById('streetSelect').value = 'all';
  syncStatusChips();
}

/** 捲到某家店的卡片並高亮；若被篩選擋住就先放寬條件 */
function focusShop(id) {
  if (!filtered().some((s) => s.id === id)) resetFilters();
  render();

  const card = board.querySelector(`.card[data-id="${id}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-spotlight');
  setTimeout(() => card.classList.remove('is-spotlight'), 3200);
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
  document.getElementById('tagline').textContent = EVENT.tagline;
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
      refreshPlanIfOpen();
      refreshMapIfOpen();
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

// ── 摺疊區狀態記憶 ─────────────────────────────────────────

const DETAILS_KEY = 'yongle-details';

/** 記住使用者把哪些區塊收合了：規則第一次進站是展開的，收起來後就不再擋路 */
function initDetailsMemory() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(DETAILS_KEY) || '{}'); } catch { saved = {}; }

  document.querySelectorAll('details[id]').forEach((d) => {
    if (typeof saved[d.id] === 'boolean') d.open = saved[d.id];
    d.addEventListener('toggle', () => {
      saved[d.id] = d.open;
      try { localStorage.setItem(DETAILS_KEY, JSON.stringify(saved)); } catch { /* 無痕模式忽略 */ }
    });
  });
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

  const mapDetails = document.getElementById('mapDetails');
  mapDetails.addEventListener('toggle', () => {
    if (mapDetails.open && !mapRendered) renderMap();
  });
  const mapHost = document.getElementById('map');
  mapHost.addEventListener('click', (e) => {
    const pin = e.target.closest('.pin');
    if (pin) focusShop(Number(pin.dataset.id));
  });
  mapHost.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const pin = e.target.closest('.pin');
    if (!pin) return;
    e.preventDefault();
    focusShop(Number(pin.dataset.id));
  });

  document.getElementById('nextStopBtn').addEventListener('click', handlePlanClick);
  document.getElementById('planRefresh').addEventListener('click', handlePlanClick);
  document.getElementById('planClose').addEventListener('click', closePlan);
  document.getElementById('geoHelpClose').addEventListener('click', () => {
    document.getElementById('geoHelp').hidden = true;
  });

  // 點路線上的某一站 → 跳到那張卡片
  const planList = document.getElementById('planList');
  planList.addEventListener('click', (e) => {
    const stop = e.target.closest('.stop');
    if (stop) focusShop(Number(stop.dataset.id));
  });
  planList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const stop = e.target.closest('.stop');
    if (!stop) return;
    e.preventDefault();
    stop.click();
  });

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
    refreshPlanIfOpen();
    refreshMapIfOpen();
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
initDetailsMemory();
render();
initServiceWorker();
