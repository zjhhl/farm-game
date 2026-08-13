// 作物数据定义
// growTime：生长周期（毫秒，真实时间）。为便于观察设为秒级，正式版可改为小时级。
// basePrice：市场基础价，实际售价围绕它在 [0.5x, 1.6x] 区间波动。
// unlockLevel：解锁所需的玩家等级。
// seasons：适宜生长季节，非适宜季节生长减速（0.8x）。

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export const CROPS = {
  wheat: {
    id: 'wheat',
    name: '小麦',
    emoji: '🌾',
    growTime: 40 * 1000,
    stages: 5,
    seedCost: 10,
    basePrice: 26,
    exp: 8,
    unlockLevel: 1,
    seasons: ['spring', 'summer', 'autumn'],
    stem: '#7a9a3f',
    leaf: '#5b8a2e',
    head: '#e8c14a',
  },
  carrot: {
    id: 'carrot',
    name: '胡萝卜',
    emoji: '🥕',
    growTime: 90 * 1000,
    stages: 5,
    seedCost: 18,
    basePrice: 45,
    exp: 14,
    unlockLevel: 1,
    seasons: ['spring', 'autumn'],
    stem: '#5a8a30',
    leaf: '#4a7a28',
    head: '#f08a2a',
  },
  corn: {
    id: 'corn',
    name: '玉米',
    emoji: '🌽',
    growTime: 70 * 1000,
    stages: 5,
    seedCost: 24,
    basePrice: 60,
    exp: 16,
    unlockLevel: 2,
    seasons: ['summer'],
    stem: '#7a9a3f',
    leaf: '#5b8a2e',
    head: '#f0c430',
  },
  potato: {
    id: 'potato',
    name: '土豆',
    emoji: '🥔',
    growTime: 55 * 1000,
    stages: 5,
    seedCost: 14,
    basePrice: 36,
    exp: 10,
    unlockLevel: 2,
    seasons: ['spring', 'autumn'],
    stem: '#5a8a30',
    leaf: '#4a7a28',
    head: '#c98f4a',
  },
  tomato: {
    id: 'tomato',
    name: '番茄',
    emoji: '🍅',
    growTime: 150 * 1000,
    stages: 5,
    seedCost: 30,
    basePrice: 80,
    exp: 22,
    unlockLevel: 3,
    seasons: ['summer'],
    stem: '#4f8a2e',
    leaf: '#3f7a24',
    head: '#e23b2e',
  },
};

export const CROP_LIST = Object.values(CROPS);

// 根据生长进度（0..1）计算当前所处阶段索引（0..stages-1）
export function stageOf(crop, progress) {
  const p = Math.max(0, Math.min(1, progress));
  return Math.min(crop.stages - 1, Math.floor(p * crop.stages));
}
