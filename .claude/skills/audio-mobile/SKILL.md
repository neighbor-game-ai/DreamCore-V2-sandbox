---
name: audio-mobile
description: モバイル音声アンロック。iOS/Android対応の音声初期化パターン。
---

# モバイル音声アンロック

モバイルブラウザはユーザー操作なしで音声再生不可：

## Web Audio API

```javascript
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// タッチ/クリックで初期化
document.addEventListener('touchstart', initAudio, { once: true });
document.addEventListener('click', initAudio, { once: true });
```

## Howler.js

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

## 重要

- ゲーム開始ボタンなどでinitAudio()を呼ぶ
- 自動再生は必ず失敗する
