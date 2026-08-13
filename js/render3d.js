// 3D 场景渲染：基于 Three.js，真实光照、阴影、立体地形、可旋转视角
// 游戏逻辑层（state / growth / market / weather）完全复用，本模块只负责渲染与交互

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CROPS } from './crops.js';
import { MAX_PLOTS } from './state.js';
import { getSeason } from './growth.js';

// ---------- 季节主题色 ----------
const THEMES = {
  spring: { sky: '#7cc0e8', grass: '#8fbf4f', grassDark: '#5e8a3a', mount: '#7fa373', tree: '#5f8f3e' },
  summer: { sky: '#4fa3dd', grass: '#7cae45', grassDark: '#4a7c30', mount: '#5f8a52', tree: '#4f7c36' },
  autumn: { sky: '#d89b5a', grass: '#c9a04f', grassDark: '#8a6a32', mount: '#9a7548', tree: '#c97a3a' },
  winter: { sky: '#9fb8cc', grass: '#d8e0e4', grassDark: '#b8c4c8', mount: '#9ab0b8', tree: '#7a8a92' },
};

// ---------- 天气天空色 ----------
const WEATHER_SKY = {
  sunny: null, // 用季节色
  cloudy: '#9ab0c0',
  rainy: '#6a7a88',
  drought: '#d8b070',
  frost: '#b8c8d4',
};

// 地块间距与坐标（3x3）
const PLOT_SPACING = 3.8;
const PLOT_POSITIONS = [];
for (let i = 0; i < MAX_PLOTS; i++) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  PLOT_POSITIONS.push({ x: (col - 1) * PLOT_SPACING, z: (row - 1) * PLOT_SPACING });
}

// ---------- 创建农场 ----------
export function createFarm(container, state) {
  const scene = new THREE.Scene();
  const theme = THEMES[getSeason(Date.now())];
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, 30, 90);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(0, 15, 26);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 10;
  controls.maxDistance = 55;

  // 光照
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a6a3a, 0.7);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.8);
  sun.position.set(28, 38, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(ambient, hemi, sun);

  const farm = { scene, camera, renderer, controls, sun, theme };

  buildGround(farm, theme);
  buildPlots(farm, state);
  buildTrees(farm, theme);
  buildMountains(farm, theme);
  buildSunGlow(farm);
  buildDecorations(farm);
  buildWeatherParticles(farm);

  farm.cropGroups = new Map(); // plotIndex -> THREE.Group
  farm.lastWeather = null;

  handleResize(farm);
  window.addEventListener('resize', () => handleResize(farm));

  return farm;
}

// ---------- 地面 ----------
function buildGround(farm, theme) {
  const geo = new THREE.PlaneGeometry(90, 90);
  const mat = new THREE.MeshStandardMaterial({
    map: makeGrassTexture(theme.grass, theme.grassDark),
    roughness: 1,
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  farm.scene.add(ground);
  farm.groundMat = mat;
}

// 程序化草地纹理
function makeGrassTexture(colorA, colorB) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? colorA : colorB;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- 地块（3x3） ----------
function buildPlots(farm, state) {
  farm.plotMeshes = [];
  farm.plotMats = [];

  const soilGeo = new THREE.BoxGeometry(3.0, 0.35, 2.2);
  const lockedMat = new THREE.MeshStandardMaterial({
    color: '#8a8a8a',
    roughness: 0.9,
    transparent: true,
    opacity: 0.45,
  });

  for (let i = 0; i < MAX_PLOTS; i++) {
    const unlocked = i < state.plots.length;
    const mat = unlocked ? makeSoilMaterial(state.plots[i].fertility) : lockedMat;
    const mesh = new THREE.Mesh(soilGeo, mat);
    const pos = PLOT_POSITIONS[i];
    mesh.position.set(pos.x, 0.175, pos.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.plotIndex = i;
    farm.scene.add(mesh);
    farm.plotMeshes.push(mesh);
    farm.plotMats.push(unlocked ? mat : null);
  }
}

function makeSoilMaterial(fertility) {
  const f = fertility / 100;
  const color = new THREE.Color('#8a5a30').lerp(new THREE.Color('#a8875a'), 1 - f);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  mat.userData.fertility = fertility;
  return mat;
}

// 开垦地块：替换为土色材质
export function unlockPlot(farm, plotIndex, fertility) {
  const mat = makeSoilMaterial(fertility);
  farm.plotMeshes[plotIndex].material = mat;
  farm.plotMats[plotIndex] = mat;
}

// ---------- 作物 ----------
export function addCrop(farm, plotIndex, crop) {
  const group = buildCropGroup(crop);
  const pos = PLOT_POSITIONS[plotIndex];
  group.position.set(pos.x, 0.35, pos.z);
  farm.scene.add(group);
  farm.cropGroups.set(plotIndex, group);
}

export function removeCrop(farm, plotIndex) {
  const group = farm.cropGroups.get(plotIndex);
  if (group) {
    farm.scene.remove(group);
    farm.cropGroups.delete(plotIndex);
  }
}

function buildCropGroup(crop) {
  const group = new THREE.Group();
  const stemH = 1.4;
  const stemMat = new THREE.MeshStandardMaterial({ color: crop.stem, roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: crop.leaf,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, stemH, 6), stemMat);
  stem.position.y = stemH / 2;
  stem.castShadow = true;
  group.add(stem);

  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), leafMat);
    leaf.position.set((i - 1) * 0.16, 0.45 + i * 0.32, 0);
    leaf.rotation.z = (i - 1) * 0.7;
    leaf.castShadow = true;
    group.add(leaf);
  }

  const fruitMat = new THREE.MeshStandardMaterial({ color: crop.head, roughness: 0.4 });
  const fruit = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), fruitMat);
    f.position.set((i - 1) * 0.2, stemH + 0.06, 0);
    f.castShadow = true;
    fruit.add(f);
  }
  fruit.visible = false;
  group.add(fruit);
  group.userData.fruit = fruit;

  return group;
}

// ---------- 树 ----------
function buildTrees(farm, theme) {
  const treeMat = new THREE.MeshStandardMaterial({ color: theme.tree, roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 1 });
  const positions = [
    [-13, -13],
    [13, -13],
    [-13, 12],
    [13, 12],
    [-16, 2],
    [16, -2],
  ];
  for (const [x, z] of positions) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 8), trunkMat);
    trunk.position.y = 1.6;
    trunk.castShadow = true;
    tree.add(trunk);

    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), treeMat);
    crown.position.y = 3.6;
    crown.castShadow = true;
    tree.add(crown);

    const crown2 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), treeMat);
    crown2.position.set(0.7, 3.0, 0.3);
    crown2.castShadow = true;
    tree.add(crown2);

    tree.position.set(x, 0, z);
    farm.scene.add(tree);
  }
}

// ---------- 远山 ----------
function buildMountains(farm, theme) {
  const mat = new THREE.MeshStandardMaterial({ color: theme.mount, roughness: 1 });
  const specs = [
    [-22, -34, 14, 8],
    [2, -38, 18, 11],
    [26, -33, 13, 7],
  ];
  for (const [x, z, r, h] of specs) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
    m.position.set(x, h / 2 - 1, z);
    farm.scene.add(m);
  }
}

// ---------- 太阳光晕 ----------
function buildSunGlow(farm) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 250, 220, 1)');
  g.addColorStop(0.4, 'rgba(255, 230, 150, 0.5)');
  g.addColorStop(1, 'rgba(255, 230, 150, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.position.set(40, 40, 24);
  sprite.scale.set(12, 12, 1);
  farm.scene.add(sprite);
  farm.sunGlow = sprite;
}

// ---------- 装饰 ----------
function buildDecorations(farm) {
  farm.decorations = {
    fence: buildFence(),
    scarecrow: buildScarecrow(),
    windmill: buildWindmill(),
  };
  for (const key in farm.decorations) {
    farm.decorations[key].visible = false;
    farm.scene.add(farm.decorations[key]);
  }
  farm.windmillBlades = farm.decorations.windmill.userData.blades;
}

function buildFence() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#9a7a4a', roughness: 1 });
  const postGeo = new THREE.BoxGeometry(0.14, 0.9, 0.14);
  const railGeo = new THREE.BoxGeometry(24, 0.1, 0.08);
  for (let i = 0; i < 12; i++) {
    const post = new THREE.Mesh(postGeo, mat);
    post.position.set(-12 + i * 2.2, 0.45, -9);
    post.castShadow = true;
    group.add(post);
  }
  for (const y of [0.3, 0.6]) {
    const rail = new THREE.Mesh(railGeo, mat);
    rail.position.set(0, y, -9);
    rail.castShadow = true;
    group.add(rail);
  }
  return group;
}

function buildScarecrow() {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 1 });
  const clothMat = new THREE.MeshStandardMaterial({ color: '#c9763a', roughness: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#f0d0a0', roughness: 0.8 });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), woodMat);
  pole.position.y = 1.2;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), woodMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.y = 1.9;
  arm.castShadow = true;
  group.add(arm);

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 6), clothMat);
  body.position.y = 1.55;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), headMat);
  head.position.y = 2.1;
  head.castShadow = true;
  group.add(head);

  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 6), woodMat);
  hat.position.y = 2.4;
  hat.castShadow = true;
  group.add(hat);

  group.position.set(-9, 0, 7);
  return group;
}

function buildWindmill() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#c8b890', roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#a8906a', roughness: 0.9 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#e8e0d0', roughness: 0.8 });

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 5, 10), bodyMat);
  tower.position.y = 2.5;
  tower.castShadow = true;
  group.add(tower);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 10), roofMat);
  roof.position.y = 5.7;
  roof.castShadow = true;
  group.add(roof);

  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.08), bladeMat);
    blade.position.x = 1.2;
    blade.rotation.z = (i * Math.PI) / 2;
    blade.castShadow = true;
    blades.add(blade);
  }
  blades.position.set(0, 5.4, 1.0);
  group.add(blades);
  group.userData.blades = blades;

  group.position.set(10, 0, 7.5);
  return group;
}

// ---------- 天气粒子 ----------
function buildWeatherParticles(farm) {
  farm.rain = makeParticles(1000, 0x9fb4cc, 0.09, 0.45);
  farm.snow = makeParticles(600, 0xffffff, 0.14, 0.8);
  farm.rain.visible = false;
  farm.snow.visible = false;
  farm.scene.add(farm.rain, farm.snow);
}

function makeParticles(count, color, size, opacity) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = Math.random() * 24;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.userData.speeds = Array.from({ length: count }, () => 0.5 + Math.random() * 0.8);
  return points;
}

function animateWeather(farm, now, weather) {
  const dt = 0.016;
  if (weather === 'rainy') {
    animateParticles(farm.rain, 10 * dt);
  } else if (weather === 'frost') {
    animateParticles(farm.snow, 2.5 * dt, true);
  }
}

function animateParticles(points, fall, drift = false) {
  const pos = points.geometry.attributes.position;
  const speeds = points.userData.speeds;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i) - fall * (speeds ? speeds[i] : 1);
    let x = pos.getX(i);
    if (drift) x += Math.sin(y) * 0.01;
    if (y < -1) {
      y = 22;
      x = (Math.random() - 0.5) * 60;
    }
    pos.setY(i, y);
    pos.setX(i, x);
  }
  pos.needsUpdate = true;
}

// ---------- 每帧更新与渲染 ----------
export function tick(farm, state, now) {
  // 作物生长
  for (let i = 0; i < state.plots.length; i++) {
    const plot = state.plots[i];
    const group = farm.cropGroups.get(i);
    const mat = farm.plotMats[i];

    if (plot.crop) {
      const g = plot.crop.growth;
      if (group) {
        group.scale.setScalar(0.25 + 0.75 * g);
        const fruit = group.userData.fruit;
        if (g > 0.7) {
          fruit.visible = true;
          fruit.scale.setScalar((g - 0.7) / 0.3);
        } else {
          fruit.visible = false;
        }
      }
      if (mat) mat.emissive.set(g >= 1 ? '#443300' : '#000000');
    } else if (mat) {
      mat.emissive.set('#000000');
    }
  }

  // 天气变化
  const weather = state.weather.type;
  if (weather !== farm.lastWeather) {
    farm.lastWeather = weather;
    const skyColor = weather === 'sunny' ? farm.theme.sky : WEATHER_SKY[weather];
    farm.scene.background.set(skyColor);
    farm.scene.fog.color.set(skyColor);
    farm.rain.visible = weather === 'rainy';
    farm.snow.visible = weather === 'frost';
  }
  animateWeather(farm, now, weather);

  // 装饰可见性
  for (const key in farm.decorations) {
    farm.decorations[key].visible = !!state.decorations[key];
  }
  if (farm.windmillBlades) {
    farm.windmillBlades.rotation.z = now / 2000;
  }

  farm.controls.update();
  farm.renderer.render(farm.scene, farm.camera);
}

// ---------- 射线检测 ----------
export function raycastPlot(farm, clientX, clientY) {
  const rect = farm.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, farm.camera);
  const hits = raycaster.intersectObjects(farm.plotMeshes, false);
  if (hits.length) return hits[0].object.userData.plotIndex;
  return -1;
}

// ---------- 尺寸适配 ----------
export function handleResize(farm) {
  const container = farm.renderer.domElement.parentElement;
  const w = container.clientWidth || 900;
  const h = container.clientHeight || 600;
  farm.camera.aspect = w / h;
  farm.camera.updateProjectionMatrix();
  farm.renderer.setSize(w, h);
}
