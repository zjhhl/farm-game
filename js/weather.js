// 天气系统：影响作物生长速率，并对应不同的场景视觉

export const WEATHER = {
  sunny: { name: '晴天', emoji: '☀️', factor: 1.0 },
  cloudy: { name: '多云', emoji: '⛅', factor: 0.9 },
  rainy: { name: '雨天', emoji: '🌧️', factor: 1.35 },
  drought: { name: '干旱', emoji: '🌵', factor: 0.55 },
  frost: { name: '霜冻', emoji: '❄️', factor: 0.7 },
};

// 天气切换概率池
const POOL = [
  ['sunny', 0.40],
  ['cloudy', 0.25],
  ['rainy', 0.20],
  ['drought', 0.10],
  ['frost', 0.05],
];

function pickWeather() {
  let r = Math.random();
  for (const [type, prob] of POOL) {
    r -= prob;
    if (r <= 0) return type;
  }
  return 'sunny';
}

export function weatherFactor(type) {
  return WEATHER[type] ? WEATHER[type].factor : 1.0;
}

// 更新天气：到期则随机切换。返回是否发生切换。
export function updateWeather(state, now) {
  if (!state.weather) state.weather = { type: 'sunny', until: 0 };
  if (now < state.weather.until) return false;

  state.weather.type = pickWeather();
  state.weather.until = now + 30000 + Math.random() * 60000; // 持续 30~90 秒
  return true;
}
