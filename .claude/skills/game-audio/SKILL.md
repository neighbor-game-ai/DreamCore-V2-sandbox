---
name: game-audio
description: Game audio implementation with Howler.js. Use when creating games that need sound effects, background music, 3D positional audio, or audio sprites. Covers CDN setup, common patterns for game sounds, and mobile audio handling.
---

# Game Audio with Howler.js

## CDN Setup

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js"></script>
```

ES Module:
```javascript
import { Howl, Howler } from 'https://unpkg.com/howler@2.2.4/dist/howler.esm.js';
```

## Basic Usage

### Sound Effect
```javascript
const sfx = new Howl({
  src: ['shoot.webm', 'shoot.mp3'],
  volume: 0.5
});
sfx.play();
```

### Background Music
```javascript
const bgm = new Howl({
  src: ['music.webm', 'music.mp3'],
  loop: true,
  volume: 0.3
});
bgm.play();
```

## Audio Sprites (Multiple SFX in One File)

```javascript
const sounds = new Howl({
  src: ['sprites.webm', 'sprites.mp3'],
  sprite: {
    jump: [0, 500],      // start: 0ms, duration: 500ms
    coin: [600, 300],
    hit: [1000, 400],
    gameover: [1500, 2000]
  }
});

sounds.play('jump');
sounds.play('coin');
```

## Game Audio Manager Pattern

```javascript
class AudioManager {
  constructor() {
    this.sfx = {};
    this.bgm = null;
    this.muted = false;
  }

  loadSFX(name, src) {
    this.sfx[name] = new Howl({ src, volume: 0.5 });
  }

  playSFX(name) {
    if (!this.muted && this.sfx[name]) {
      this.sfx[name].play();
    }
  }

  playBGM(src, volume = 0.3) {
    if (this.bgm) this.bgm.stop();
    this.bgm = new Howl({ src, loop: true, volume });
    if (!this.muted) this.bgm.play();
  }

  toggleMute() {
    this.muted = !this.muted;
    Howler.mute(this.muted);
    return this.muted;
  }

  setVolume(vol) {
    Howler.volume(vol);
  }
}

const audio = new AudioManager();
audio.loadSFX('jump', ['jump.webm', 'jump.mp3']);
audio.playSFX('jump');
```

## 3D Positional Audio

```javascript
const enemy = new Howl({
  src: ['enemy.webm', 'enemy.mp3'],
  loop: true
});

const id = enemy.play();

// Set listener position (player)
Howler.pos(playerX, playerY, playerZ);

// Set sound position
enemy.pos(enemyX, enemyY, enemyZ, id);
```

## Mobile Audio Unlock

Mobile browsers require user interaction before playing audio:

```javascript
function unlockAudio() {
  const silent = new Howl({
    src: ['data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v////////////////////////////////'],
    volume: 0,
    onend: () => silent.unload()
  });
  silent.play();
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('click', unlockAudio);
}

document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });
```

## Fade Effects

```javascript
// Fade in BGM
bgm.fade(0, 0.5, 2000);

// Fade out and stop
bgm.fade(0.5, 0, 1000);
bgm.once('fade', () => bgm.stop());
```

## Common Patterns

### Play with Pitch Variation
```javascript
function playWithVariation(sound) {
  const id = sound.play();
  sound.rate(0.9 + Math.random() * 0.2, id); // 0.9-1.1
}
```

### Pool for Rapid Sounds
```javascript
const pool = Array.from({ length: 5 }, () => 
  new Howl({ src: ['rapid.webm', 'rapid.mp3'] })
);
let poolIndex = 0;

function playPooled() {
  pool[poolIndex].play();
  poolIndex = (poolIndex + 1) % pool.length;
}
```

## File Format Priority

Use WebM/Opus first, MP3 fallback:
```javascript
src: ['sound.webm', 'sound.mp3']
```

- WebM/Opus: Smaller, better quality
- MP3: Universal fallback

## 【重要】音声ファイルがない場合の効果音生成

ゲームに音声アセットがない場合は、Web Audio APIで効果音を合成できます：

```javascript
class SynthAudio {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ヒット音（短いノイズ）
  playHit() {
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  // ジャンプ音（上昇するトーン）
  playJump() {
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  // コイン取得音
  playCoin() {
    this.init();
    [523, 659, 784].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.08);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + i * 0.08 + 0.1);
      osc.start(this.ctx.currentTime + i * 0.08);
      osc.stop(this.ctx.currentTime + i * 0.08 + 0.1);
    });
  }

  // 爆発音
  playExplosion() {
    this.init();
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    noise.buffer = buffer;
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    noise.start();
  }

  // ゲームオーバー音
  playGameOver() {
    this.init();
    [392, 330, 262].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.3);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + i * 0.3 + 0.25);
      osc.start(this.ctx.currentTime + i * 0.3);
      osc.stop(this.ctx.currentTime + i * 0.3 + 0.25);
    });
  }
}

// 使用例
const audio = new SynthAudio();
document.addEventListener('touchstart', () => audio.init(), { once: true });

// ゲーム内で
audio.playHit();
audio.playJump();
audio.playCoin();
```

**モバイルでは必ず touchstart/click イベントで `audio.init()` を呼んでください。**

## Common Mistakes

| Wrong | Correct |
|-------|---------|
| `new Howl('file.mp3')` | `new Howl({ src: ['file.mp3'] })` |
| Playing without user interaction on mobile | Use unlock pattern |
| Creating new Howl on every play | Reuse Howl instances |
| Using only one format | Provide webm + mp3 fallback |
| 音声ファイルなしで音を出そうとする | SynthAudioパターンを使用 |
