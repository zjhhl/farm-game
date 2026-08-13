// 主逻辑：游戏循环、交互事件、种植/收获/浇水/施肥、扩建、装饰、存档管理
// 渲染层使用 3D（render3d.js），游戏逻辑层与之前完全一致

import { CROP_LIST, CROPS } from './crops.js';
import {
  loadState,
  saveState,
  resetState,
  exportState,
  importState,
  UNLOCK_COST,
} from './state.js';
import { ensureMarket, updatePrices } from './market.js';
import { updateWeather, WEATHER } from './weather.js';
import { getSeason, SEASON_NAMES, ensureGrowth, advanceGrowth } from './growth.js';
import {
  createFarm,
  tick,
  raycastPlot,
  addCrop,
  removeCrop,
  unlockPlot,
} from './render3d.js';

const container = document.getElementById('farm-container');
const hintEl = document.getElementById('hint');

let state = loadState();
ensureMarket(state);
ensureGrowth(state);

let farm = createFarm(container, state);
let hintTimer = null;
let activePanel = 'shop';

const FERTILIZER_PRICE = 20;

const DECORATIONS = {
  fence: { name: '木栅栏', emoji: '🪵', price: 300 },
  scarecrow: { name: '稻草人', emoji: '🎃', price: 500 },
  windmill: { name: '风车', emoji: '🎡', price: 2000 },
};

const SEASON_ICON = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

// ---------- 工具函数 ----------
function expNeeded(level) {
  return level * 50;
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}分${r}秒` : `${m}分钟`;
}

function seasonsLabel(crop) {
  return crop.seasons.map((s) => SEASON_ICON[s]).join('·');
}

function showHint(msg) {
  hintEl.textContent = msg;
  hintEl.style.opacity = '1';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hintEl.style.opacity = '0';
  }, 2400);
}

function holdingLabel() {
  const h = state.holding;
  if (!h) return '无';
  if (h.type === 'seed') return `${CROPS[h.cropId].name}种子`;
  if (h.type === 'water') return '浇水壶';
  if (h.type === 'fertilizer') return '肥料';
  return '';
}

// ---------- 经验与升级 ----------
function addExp(amount) {
  state.exp += amount;
  let need = expNeeded(state.level);
  while (state.exp >= need) {
    state.exp -= need;
    state.level++;
    need = expNeeded(state.level);
    showHint(`🎉 升级！达到 Lv.${state.level}`);
  }
}

// ---------- 地块交互 ----------
function handlePlotClick(idx) {
  const now = Date.now();

  // 未开垦地块 → 扩建
  if (idx >= state.plots.length) {
    const cost = UNLOCK_COST[idx];
    if (state.gold >= cost) {
      state.gold -= cost;
      state.plots.push({ id: idx, crop: null, fertility: 80 });
      unlockPlot(farm, idx, 80);
      saveState(state);
      showHint(`🆕 开垦了第 ${idx + 1} 块土地（-${cost} 金币）`);
    } else {
      showHint(`开垦需要 ${cost} 金币，当前不足`);
    }
    return;
  }

  const plot = state.plots[idx];
  const holding = state.holding;

  if (!holding) {
    showHint('请先在下方选择工具');
    return;
  }

  if (holding.type === 'seed') plantOrHarvest(plot, holding.cropId);
  else if (holding.type === 'water') waterPlot(plot);
  else if (holding.type === 'fertilizer') fertilizePlot(plot);
}

function plantOrHarvest(plot, cropId) {
  const now = Date.now();

  if (plot.crop) {
    const mature = plot.crop.growth >= 1;
    const crop = CROPS[plot.crop.cropId];

    if (mature) {
      state.inventory[crop.id] = (state.inventory[crop.id] || 0) + 1;
      addExp(crop.exp);
      plot.fertility = Math.max(0, plot.fertility - 15);
      plot.crop = null;
      removeCrop(farm, plot.id);
      saveState(state);
      renderShop();
      renderMarket();
      showHint(`✅ 收获 ${crop.name} ×1（土地肥力 -15）`);
    } else {
      showHint(`🌱 ${crop.name} 还在生长中`);
    }
    return;
  }

  const crop = CROPS[cropId];
  if (state.level < crop.unlockLevel) {
    showHint(`需要 Lv.${crop.unlockLevel} 才能种植 ${crop.name}`);
    return;
  }
  if (state.gold < crop.seedCost) {
    showHint('金币不足，无法购买种子');
    return;
  }

  state.gold -= crop.seedCost;
  plot.crop = { cropId: crop.id, plantedAt: now, growth: 0, wateredUntil: 0 };
  addCrop(farm, plot.id, crop);
  saveState(state);
  renderShop();
  renderMarket();
  showHint(`🌱 种下 ${crop.name}（-${crop.seedCost} 金币）`);
}

function waterPlot(plot) {
  if (!plot.crop) {
    showHint('这块地没有作物');
    return;
  }
  plot.crop.wateredUntil = Date.now() + 60000;
  saveState(state);
  showHint(`💧 浇水！生长速度 ×1.5，持续 60 秒`);
}

function fertilizePlot(plot) {
  if ((state.tools.fertilizer || 0) <= 0) {
    showHint('没有肥料了，去「工具」页购买');
    return;
  }
  state.tools.fertilizer--;
  plot.fertility = Math.min(100, plot.fertility + 30);
  saveState(state);
  renderTools();
  showHint(`🧪 施肥！肥力 +30（当前 ${plot.fertility}）`);
}

// ---------- 出售 ----------
function sellCrop(cropId) {
  const stock = state.inventory[cropId] || 0;
  if (stock <= 0) return;

  const crop = CROPS[cropId];
  const price = state.prices[cropId];
  const total = price * stock;

  state.gold += total;
  state.inventory[cropId] = 0;
  saveState(state);
  renderMarket();
  renderShop();
  showHint(`💰 卖出 ${crop.name} ×${stock}（单价 ${price}），共 +${total} 金币`);
}

// ---------- UI：状态栏 ----------
function updateStatusBar(now) {
  document.getElementById('gold').textContent = state.gold;
  document.getElementById('level').textContent = `Lv.${state.level}`;

  const need = expNeeded(state.level);
  const pct = Math.min(100, (state.exp / need) * 100);
  document.getElementById('exp-bar').style.width = pct + '%';
  document.getElementById('exp-text').textContent = `${state.exp} / ${need}`;

  const w = WEATHER[state.weather.type];
  document.getElementById('weather-icon').textContent = w.emoji;
  document.getElementById('weather').textContent = w.name;
  document.getElementById('season').textContent = SEASON_NAMES[getSeason(now)];
  document.getElementById('holding').textContent = holdingLabel();
}

// ---------- UI：商店 ----------
function renderShop() {
  const list = document.getElementById('seed-list');
  list.innerHTML = '';

  for (const crop of CROP_LIST) {
    const unlocked = state.level >= crop.unlockLevel;
    const btn = document.createElement('button');
    btn.className = 'seed-btn';
    if (state.holding && state.holding.type === 'seed' && state.holding.cropId === crop.id) {
      btn.classList.add('selected');
    }
    if (!unlocked || state.gold < crop.seedCost) btn.classList.add('disabled');
    btn.title = `适宜季节：${seasonsLabel(crop)}`;

    const emoji = document.createElement('span');
    emoji.className = 'seed-emoji';
    emoji.textContent = crop.emoji;

    const name = document.createElement('span');
    name.className = 'seed-name';
    name.textContent = crop.name;

    const time = document.createElement('span');
    time.className = 'seed-time';
    time.textContent = formatDuration(crop.growTime);

    const price = document.createElement('span');
    price.className = 'seed-price';
    price.textContent = unlocked ? `💰${crop.seedCost}` : `🔒Lv.${crop.unlockLevel}`;

    btn.append(emoji, name, time, price);
    btn.addEventListener('click', () => {
      if (!unlocked) {
        showHint(`需要 Lv.${crop.unlockLevel} 才能种植 ${crop.name}`);
        return;
      }
      state.holding = { type: 'seed', cropId: crop.id };
      renderShop();
      renderTools();
      showHint(`已选中 ${crop.name} 种子，点击地块种植`);
    });

    list.appendChild(btn);
  }
}

// ---------- UI：市场 ----------
function renderMarket() {
  const list = document.getElementById('market-list');
  list.innerHTML = '';

  for (const crop of CROP_LIST) {
    const price = state.prices[crop.id];
    const base = crop.basePrice;
    const diffPct = Math.round((price / base - 1) * 100);
    const up = diffPct >= 0;
    const stock = state.inventory[crop.id] || 0;

    const row = document.createElement('div');
    row.className = 'market-item';

    const icon = document.createElement('span');
    icon.className = 'mi-icon';
    icon.textContent = crop.emoji;

    const info = document.createElement('div');
    info.className = 'mi-info';
    const name = document.createElement('span');
    name.className = 'mi-name';
    name.textContent = crop.name;
    const stockEl = document.createElement('span');
    stockEl.className = 'mi-stock';
    stockEl.textContent = `库存 ×${stock}`;
    info.append(name, stockEl);

    const priceBox = document.createElement('div');
    priceBox.className = 'mi-price';
    const priceNum = document.createElement('span');
    priceNum.className = 'mi-price-num';
    priceNum.textContent = `💰${price}`;
    const diff = document.createElement('span');
    diff.className = 'mi-diff ' + (up ? 'up' : 'down');
    diff.textContent = `${up ? '▲' : '▼'}${up ? '+' : ''}${diffPct}%`;
    priceBox.append(priceNum, diff);

    const sellBtn = document.createElement('button');
    sellBtn.className = 'mi-sell';
    sellBtn.textContent = '卖出';
    sellBtn.disabled = stock <= 0;
    sellBtn.addEventListener('click', () => sellCrop(crop.id));

    row.append(icon, info, priceBox, sellBtn);
    list.appendChild(row);
  }
}

// ---------- UI：工具 ----------
function renderTools() {
  const wrap = document.getElementById('tools-list');
  wrap.innerHTML = '';

  const fertCount = state.tools.fertilizer || 0;

  const waterBtn = mkToolBtn('💧 浇水壶', state.holding && state.holding.type === 'water', () => {
    state.holding = { type: 'water' };
    renderTools();
    renderShop();
    showHint('已选中浇水壶，点击有作物的地块浇水');
  });

  const fertBtn = mkToolBtn(
    `🧪 肥料（×${fertCount}）`,
    state.holding && state.holding.type === 'fertilizer',
    () => {
      state.holding = { type: 'fertilizer' };
      renderTools();
      renderShop();
      showHint('已选中肥料，点击地块施肥');
    },
  );

  const buyBtn = mkToolBtn(`🛒 买肥料 💰${FERTILIZER_PRICE}`, false, buyFertilizer);

  wrap.append(waterBtn, fertBtn, buyBtn);
}

function mkToolBtn(label, active, onClick) {
  const btn = document.createElement('button');
  btn.className = 'tool-btn' + (active ? ' active' : '');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function buyFertilizer() {
  if (state.gold < FERTILIZER_PRICE) {
    showHint('金币不足，无法购买肥料');
    return;
  }
  state.gold -= FERTILIZER_PRICE;
  state.tools.fertilizer = (state.tools.fertilizer || 0) + 1;
  saveState(state);
  renderTools();
  renderShop();
  showHint(`🧪 购买肥料 ×1（-${FERTILIZER_PRICE} 金币）`);
}

// ---------- UI：装饰 ----------
function renderDecor() {
  const wrap = document.getElementById('decor-list');
  wrap.innerHTML = '';

  for (const [key, d] of Object.entries(DECORATIONS)) {
    const owned = state.decorations[key];
    const btn = document.createElement('button');
    btn.className = 'decor-btn' + (owned ? ' owned' : '');
    btn.textContent = `${d.emoji} ${d.name}` + (owned ? '（已拥有）' : `　💰${d.price}`);
    btn.disabled = owned;
    btn.addEventListener('click', () => buyDecor(key, d));
    wrap.appendChild(btn);
  }
}

function buyDecor(key, d) {
  if (state.gold < d.price) {
    showHint('金币不足，无法购买');
    return;
  }
  state.gold -= d.price;
  state.decorations[key] = true;
  saveState(state);
  renderDecor();
  showHint(`🎪 购买了${d.name}，去农场看看吧！`);
}

// ---------- 存档管理 ----------
function exportSave() {
  const json = exportState(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'farm-save.json';
  a.click();
  URL.revokeObjectURL(url);
  showHint('💾 存档已导出');
}

function importSave(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = importState(reader.result);
      ensureMarket(s);
      ensureGrowth(s);
      saveState(s);
      location.reload();
    } catch (e) {
      showHint('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
}

function resetGame() {
  if (!confirm('确定要清空存档、重新开始吗？')) return;
  resetState();
  location.reload();
}

// ---------- UI：面板切换 ----------
function switchPanel(panel) {
  activePanel = panel;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.panel === panel);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('hidden', p.id !== panel + '-panel');
  });
  if (panel === 'market') renderMarket();
}

function renderAll() {
  renderShop();
  renderMarket();
  renderTools();
  renderDecor();
}

// ---------- 游戏循环 ----------
function loop() {
  const now = Date.now();

  advanceGrowth(state, now);
  updateWeather(state, now);
  if (updatePrices(state, now)) renderMarket();

  tick(farm, state, now);
  updateStatusBar(now);
  requestAnimationFrame(loop);
}

// ---------- 事件绑定 ----------
const el = farm.renderer.domElement;
let downPos = null;

el.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY };
});

el.addEventListener('pointerup', (e) => {
  if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 6) {
    const idx = raycastPlot(farm, e.clientX, e.clientY);
    if (idx >= 0) handlePlotClick(idx);
  }
  downPos = null;
});

el.addEventListener('pointermove', (e) => {
  const idx = raycastPlot(farm, e.clientX, e.clientY);
  el.style.cursor = idx >= 0 ? 'pointer' : 'grab';
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchPanel(tab.dataset.panel));
});

document.getElementById('btn-export').addEventListener('click', exportSave);
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importSave(file);
  e.target.value = '';
});
document.getElementById('btn-reset').addEventListener('click', resetGame);

window.addEventListener('beforeunload', () => saveState(state));

// ---------- 启动 ----------
renderAll();
switchPanel('shop');
showHint('🖱️ 拖拽旋转视角，点击地块种植，收获后到「市场」卖出');
loop();
