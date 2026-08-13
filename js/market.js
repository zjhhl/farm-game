// 市场价格系统：围绕基础价随机游走，并带有均值回归
// 价格每 PRICE_TICK 毫秒更新一次，离线重开时按流逝时间结算

import { CROP_LIST } from './crops.js';

const PRICE_TICK = 15 * 1000; // 价格刷新间隔
const MIN_RATIO = 0.5; // 最低价 = 基础价 * 0.5
const MAX_RATIO = 1.6; // 最高价 = 基础价 * 1.6
const REVERT = 0.18; // 均值回归强度（越大越快速回到基础价）
const NOISE = 0.10; // 单步随机波动幅度（相对基础价）
const MAX_TICKS = 200; // 单次离线最多结算的步数，避免极端卡顿

// 确保状态里存在完整的市场字段
export function ensureMarket(state) {
  if (!state.inventory) state.inventory = {};
  if (!state.prices) state.prices = {};
  for (const c of CROP_LIST) {
    if (state.inventory[c.id] == null) state.inventory[c.id] = 0;
    if (state.prices[c.id] == null) state.prices[c.id] = c.basePrice;
  }
  if (!state.lastPriceUpdate) state.lastPriceUpdate = Date.now();
}

// 推进价格。返回是否发生了价格更新。
export function updatePrices(state, now) {
  ensureMarket(state);

  const ticks = Math.floor((now - state.lastPriceUpdate) / PRICE_TICK);
  if (ticks <= 0) return false;

  state.lastPriceUpdate += Math.min(ticks, MAX_TICKS) * PRICE_TICK;
  const n = Math.min(ticks, MAX_TICKS);

  for (const c of CROP_LIST) {
    const base = c.basePrice;
    let p = state.prices[c.id];

    for (let i = 0; i < n; i++) {
      const noise = (Math.random() - 0.5) * 2 * base * NOISE;
      p = p + noise + (base - p) * REVERT;
      p = Math.max(base * MIN_RATIO, Math.min(base * MAX_RATIO, p));
    }

    state.prices[c.id] = Math.round(p);
  }

  return true;
}
