// 游戏状态管理与本地存档（localStorage）

const SAVE_KEY = 'farm-game-save-v1';

// 土地：初始 4 块，最大 9 块（3x3）
export const INITIAL_PLOTS = 4;
export const MAX_PLOTS = 9;

// 各块土地的扩建价格（按 index）
export const UNLOCK_COST = {
  4: 500,
  5: 500,
  6: 900,
  7: 900,
  8: 900,
};

function createPlot(id) {
  return {
    id,
    crop: null, // { cropId, plantedAt, growth, wateredUntil } 或 null
    fertility: 80, // 土壤肥力 0~100
  };
}

export function defaultState() {
  return {
    gold: 200,
    level: 1,
    exp: 0,
    plots: Array.from({ length: INITIAL_PLOTS }, (_, i) => createPlot(i)),
    holding: { type: 'seed', cropId: 'wheat' }, // 当前手持工具
    inventory: {}, // 已收获果实 { cropId: 数量 }
    prices: {}, // 市场价 { cropId: 单价 }
    lastPriceUpdate: 0,
    tools: { fertilizer: 3 }, // 道具背包
    decorations: { scarecrow: false, windmill: false, fence: false },
    weather: { type: 'sunny', until: 0 },
    lastTickAt: Date.now(), // 上次生长结算时间戳
    lastSavedAt: Date.now(),
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw);
    return { ...defaultState(), ...saved };
  } catch (e) {
    console.warn('存档读取失败，开始新游戏', e);
    return defaultState();
  }
}

export function saveState(state) {
  state.lastSavedAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(SAVE_KEY);
  return defaultState();
}

// 导出存档为 JSON 字符串
export function exportState(state) {
  return JSON.stringify(state, null, 2);
}

// 从 JSON 字符串导入存档，校验后覆盖
export function importState(json) {
  const data = JSON.parse(json);
  const base = defaultState();
  return { ...base, ...data };
}
