// 生长系统：累积式生长进度，速率受天气 × 肥力 × 季节 × 浇水多重因子影响

import { CROPS } from './crops.js';
import { weatherFactor } from './weather.js';

// ---------- 季节 ----------
export function getSeason(now) {
  const m = new Date(now).getMonth(); // 0~11
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

export const SEASON_NAMES = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

// 肥力因子：0.6 ~ 1.2
function fertilityFactor(fertility) {
  return 0.6 + 0.6 * (fertility / 100);
}

// 季节因子：适宜 1.0，非适宜 0.8
function seasonFactor(crop, now) {
  const season = getSeason(now);
  return crop.seasons.includes(season) ? 1.0 : 0.8;
}

// 浇水因子：浇水后短时间内 1.5 倍
function waterFactor(plot, now) {
  const w = plot.crop && plot.crop.wateredUntil;
  return w && now < w ? 1.5 : 1.0;
}

// 综合生长速率
export function growthRate(plot, state, now) {
  const crop = CROPS[plot.crop.cropId];
  return (
    weatherFactor(state.weather.type) *
    fertilityFactor(plot.fertility) *
    seasonFactor(crop, now) *
    waterFactor(plot, now)
  );
}

// 兼容旧存档：补齐 growth / fertility / wateredUntil 字段
export function ensureGrowth(state) {
  for (const plot of state.plots) {
    if (plot.fertility == null) plot.fertility = 80;
    if (plot.crop) {
      if (plot.crop.growth == null) {
        const crop = CROPS[plot.crop.cropId];
        plot.crop.growth = Math.min(
          1,
          (Date.now() - plot.crop.plantedAt) / crop.growTime,
        );
      }
      if (plot.crop.wateredUntil == null) plot.crop.wateredUntil = 0;
    }
  }
}

// 推进生长：按流逝时间与当前速率累加 growth（在线每帧、离线重开都会调用）
export function advanceGrowth(state, now) {
  const dt = (now - state.lastTickAt) / 1000; // 秒
  state.lastTickAt = now;
  if (dt <= 0) return;

  for (const plot of state.plots) {
    if (!plot.crop) continue;
    const crop = CROPS[plot.crop.cropId];
    const rate = growthRate(plot, state, now);
    plot.crop.growth = Math.min(1, plot.crop.growth + (dt / (crop.growTime / 1000)) * rate);
  }
}
