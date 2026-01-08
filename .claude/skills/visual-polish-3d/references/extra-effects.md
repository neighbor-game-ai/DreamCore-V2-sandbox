# 追加エフェクト

3Dゲームを彩る様々なビジュアルエフェクト。

## 3Dパーティクルシステム

```javascript
import * as THREE from 'three';

class ParticleSystem {
  constructor(scene, options = {}) {
    this.maxParticles = options.maxParticles || 1000;
    this.particles = [];
    this.scene = scene;

    // ジオメトリ
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.alphas = new Float32Array(this.maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    // シェーダーマテリアル
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: this.createCircleTexture() }
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, tex.a * vAlpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });

    this.points = new THREE.Points(this.geometry, this.material);
    scene.add(this.points);
  }

  createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  emit(position, options = {}) {
    const count = options.count || 10;
    const color = new THREE.Color(options.color || 0xffff00);
    const speed = options.speed || 2;
    const life = options.life || 1;
    const size = options.size || 10;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;

      this.particles.push({
        position: position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * speed,
          Math.random() * speed,
          (Math.random() - 0.5) * speed
        ),
        color: color.clone(),
        size: size * (0.5 + Math.random() * 0.5),
        life: life,
        maxLife: life
      });
    }
  }

  update(delta) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // 物理更新
      p.velocity.y -= 5 * delta;  // 重力
      p.position.add(p.velocity.clone().multiplyScalar(delta));
    }

    // バッファ更新
    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        const lifeRatio = p.life / p.maxLife;

        this.positions[i * 3] = p.position.x;
        this.positions[i * 3 + 1] = p.position.y;
        this.positions[i * 3 + 2] = p.position.z;

        this.colors[i * 3] = p.color.r;
        this.colors[i * 3 + 1] = p.color.g;
        this.colors[i * 3 + 2] = p.color.b;

        this.sizes[i] = p.size * lifeRatio;
        this.alphas[i] = lifeRatio;
      } else {
        this.alphas[i] = 0;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}

// 使用例
const particles = new ParticleSystem(scene);

// 爆発エフェクト
function explode(position) {
  particles.emit(position, {
    count: 50,
    color: 0xff6600,
    speed: 5,
    life: 0.8,
    size: 15
  });
}

// 更新ループ
let lastTime = 0;
function animate(time) {
  const delta = (time - lastTime) / 1000;
  lastTime = time;
  particles.update(delta);
  renderer.render(scene, camera);
}
```

## トレイル（軌跡）エフェクト

```javascript
class TrailEffect {
  constructor(scene, options = {}) {
    this.maxPoints = options.maxPoints || 50;
    this.width = options.width || 0.2;
    this.color = new THREE.Color(options.color || 0x00ffff);

    this.positions = [];

    // ラインジオメトリ
    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new Float32Array(this.maxPoints * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionAttr, 3));

    this.material = new THREE.LineBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.8
    });

    this.line = new THREE.Line(this.geometry, this.material);
    scene.add(this.line);
  }

  addPoint(position) {
    this.positions.unshift(position.clone());
    if (this.positions.length > this.maxPoints) {
      this.positions.pop();
    }
    this.updateGeometry();
  }

  updateGeometry() {
    for (let i = 0; i < this.maxPoints; i++) {
      if (i < this.positions.length) {
        this.positionAttr[i * 3] = this.positions[i].x;
        this.positionAttr[i * 3 + 1] = this.positions[i].y;
        this.positionAttr[i * 3 + 2] = this.positions[i].z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.setDrawRange(0, this.positions.length);
  }

  clear() {
    this.positions = [];
    this.updateGeometry();
  }
}

// 使用例
const trail = new TrailEffect(scene, { color: 0xff00ff, maxPoints: 30 });

function animate() {
  trail.addPoint(player.position);
  renderer.render(scene, camera);
}
```

## スクリーンシェイク

```javascript
class ScreenShake {
  constructor(camera) {
    this.camera = camera;
    this.originalPosition = camera.position.clone();
    this.shaking = false;
    this.intensity = 0;
    this.decay = 0.9;
  }

  shake(intensity = 0.5, duration = 0.3) {
    this.intensity = intensity;
    this.shaking = true;
    this.originalPosition.copy(this.camera.position);

    setTimeout(() => {
      this.shaking = false;
      this.camera.position.copy(this.originalPosition);
    }, duration * 1000);
  }

  update() {
    if (!this.shaking) return;

    this.camera.position.x = this.originalPosition.x + (Math.random() - 0.5) * this.intensity;
    this.camera.position.y = this.originalPosition.y + (Math.random() - 0.5) * this.intensity;

    this.intensity *= this.decay;
  }
}

// 使用例
const shake = new ScreenShake(camera);

// ダメージ時
function onDamage() {
  shake.shake(0.5, 0.2);
}

function animate() {
  shake.update();
  renderer.render(scene, camera);
}
```

## ダメージフラッシュ

```javascript
// オーバーレイを使う方法
class DamageFlash {
  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: red;
      opacity: 0;
      pointer-events: none;
      z-index: 1000;
      transition: opacity 0.1s;
    `;
    document.body.appendChild(this.overlay);
  }

  flash(color = 'red', duration = 0.2) {
    this.overlay.style.background = color;
    this.overlay.style.opacity = '0.5';

    setTimeout(() => {
      this.overlay.style.opacity = '0';
    }, duration * 1000);
  }
}

const damageFlash = new DamageFlash();
damageFlash.flash('red', 0.15);
```

## 浮遊テキスト（ダメージ数値など）

```javascript
class FloatingText {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.texts = [];
  }

  show(text, position, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.font = `bold ${options.fontSize || 48}px Arial`;
    ctx.fillStyle = options.color || '#ffff00';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(text, 128, 32);
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(2, 0.5, 1);
    this.scene.add(sprite);

    const textObj = {
      sprite,
      velocity: new THREE.Vector3(0, 2, 0),
      life: options.life || 1
    };
    this.texts.push(textObj);
  }

  update(delta) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= delta;

      if (t.life <= 0) {
        this.scene.remove(t.sprite);
        t.sprite.material.dispose();
        this.texts.splice(i, 1);
        continue;
      }

      t.sprite.position.add(t.velocity.clone().multiplyScalar(delta));
      t.sprite.material.opacity = t.life;

      // カメラに向ける（Spriteは自動で向く）
    }
  }
}

// 使用例
const floatingText = new FloatingText(scene, camera);

function onHit(damage, position) {
  floatingText.show(`-${damage}`, position, { color: '#ff0000' });
}

function onHeal(amount, position) {
  floatingText.show(`+${amount}`, position, { color: '#00ff00' });
}
```

## 収集エフェクト（アイテム取得時）

```javascript
class CollectEffect {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
  }

  play(startPos, endPos, options = {}) {
    const count = options.count || 5;
    const color = new THREE.Color(options.color || 0xffff00);

    for (let i = 0; i < count; i++) {
      const geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color });
      const sphere = new THREE.Mesh(geometry, material);

      sphere.position.copy(startPos);
      sphere.position.x += (Math.random() - 0.5) * 0.5;
      sphere.position.y += (Math.random() - 0.5) * 0.5;
      sphere.position.z += (Math.random() - 0.5) * 0.5;

      this.scene.add(sphere);

      this.effects.push({
        mesh: sphere,
        startPos: sphere.position.clone(),
        endPos: endPos.clone(),
        progress: 0,
        delay: i * 0.05,
        speed: 3 + Math.random()
      });
    }
  }

  update(delta) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];

      if (e.delay > 0) {
        e.delay -= delta;
        continue;
      }

      e.progress += delta * e.speed;

      if (e.progress >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
        continue;
      }

      // イージング（加速）
      const t = e.progress * e.progress;
      e.mesh.position.lerpVectors(e.startPos, e.endPos, t);
      e.mesh.scale.setScalar(1 - e.progress * 0.5);
    }
  }
}

// 使用例
const collectEffect = new CollectEffect(scene);

function onCollectCoin(coinPosition) {
  const uiPosition = new THREE.Vector3(5, 3, 0);  // UI位置
  collectEffect.play(coinPosition, uiPosition, { color: 0xffd700, count: 8 });
}
```

## ヒットストップ（フリーズフレーム）

```javascript
class HitStop {
  constructor() {
    this.frozen = false;
    this.duration = 0;
  }

  freeze(duration = 0.1) {
    this.frozen = true;
    this.duration = duration;
  }

  update(delta) {
    if (!this.frozen) return delta;

    this.duration -= delta;
    if (this.duration <= 0) {
      this.frozen = false;
      return delta;
    }

    return 0;  // 時間を止める
  }
}

// 使用例
const hitStop = new HitStop();

function onStrongHit() {
  hitStop.freeze(0.08);
}

let lastTime = 0;
function animate(time) {
  let delta = (time - lastTime) / 1000;
  lastTime = time;

  // ヒットストップ適用
  delta = hitStop.update(delta);

  // delta = 0 なら動きが止まる
  updateGame(delta);
  renderer.render(scene, camera);
}
```

## 環境パーティクル（雪/雨/埃）

```javascript
class EnvironmentParticles {
  constructor(scene, type = 'snow') {
    this.count = type === 'rain' ? 5000 : 2000;
    this.range = 50;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.count * 3);
    const velocities = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.range;
      positions[i * 3 + 1] = Math.random() * this.range;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.range;

      if (type === 'rain') {
        velocities[i * 3] = 0;
        velocities[i * 3 + 1] = -20 - Math.random() * 10;
        velocities[i * 3 + 2] = 0;
      } else {  // snow
        velocities[i * 3] = (Math.random() - 0.5) * 0.5;
        velocities[i * 3 + 1] = -1 - Math.random();
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.velocities = velocities;
    this.positions = positions;

    const material = new THREE.PointsMaterial({
      color: type === 'rain' ? 0xaaaaff : 0xffffff,
      size: type === 'rain' ? 0.1 : 0.3,
      transparent: true,
      opacity: type === 'rain' ? 0.6 : 0.8
    });

    this.points = new THREE.Points(geometry, material);
    scene.add(this.points);
  }

  update(delta, playerPosition) {
    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3] += this.velocities[i * 3] * delta;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * delta;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * delta;

      // プレイヤー中心に再配置
      if (this.positions[i * 3 + 1] < 0) {
        this.positions[i * 3] = playerPosition.x + (Math.random() - 0.5) * this.range;
        this.positions[i * 3 + 1] = playerPosition.y + this.range / 2;
        this.positions[i * 3 + 2] = playerPosition.z + (Math.random() - 0.5) * this.range;
      }
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// 使用例
const snow = new EnvironmentParticles(scene, 'snow');
// または
const rain = new EnvironmentParticles(scene, 'rain');

function animate() {
  snow.update(0.016, player.position);
  renderer.render(scene, camera);
}
```
