# トゥーン/セルシェーダー

アニメ調のレンダリングスタイル実装ガイド。

## 基本トゥーンシェーダー（カスタム）

```javascript
import * as THREE from 'three';

// トゥーンシェーダーマテリアル
const toonVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const toonFragmentShader = `
  uniform vec3 color;
  uniform vec3 lightDir;
  uniform float steps;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // 拡散光（階段状）
    float NdotL = dot(vNormal, lightDir);
    float intensity = floor(NdotL * steps) / steps;
    intensity = max(0.2, intensity);  // 最低明度

    // リムライト
    float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    rim = smoothstep(0.6, 1.0, rim);

    vec3 finalColor = color * intensity + vec3(1.0) * rim * 0.3;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function createToonMaterial(color, steps = 4) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      lightDir: { value: new THREE.Vector3(0.5, 1, 0.5).normalize() },
      steps: { value: steps }
    },
    vertexShader: toonVertexShader,
    fragmentShader: toonFragmentShader
  });
}

// 使用例
const toonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 32),
  createToonMaterial(0xff6600, 3)
);
scene.add(toonMesh);
```

## アウトライン（二重レンダリング方式）

```javascript
// アウトラインマテリアル
const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: {
    outlineColor: { value: new THREE.Color(0x000000) },
    outlineThickness: { value: 0.03 }
  },
  vertexShader: `
    uniform float outlineThickness;
    void main() {
      vec3 pos = position + normal * outlineThickness;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 outlineColor;
    void main() {
      gl_FragColor = vec4(outlineColor, 1.0);
    }
  `,
  side: THREE.BackSide
});

// アウトライン付きオブジェクト作成
function createOutlinedMesh(geometry, mainMaterial, outlineColor = 0x000000, thickness = 0.03) {
  const group = new THREE.Group();

  // メインメッシュ
  const mainMesh = new THREE.Mesh(geometry, mainMaterial);
  group.add(mainMesh);

  // アウトラインメッシュ
  const outlineMat = outlineMaterial.clone();
  outlineMat.uniforms.outlineColor.value = new THREE.Color(outlineColor);
  outlineMat.uniforms.outlineThickness.value = thickness;
  const outlineMesh = new THREE.Mesh(geometry, outlineMat);
  group.add(outlineMesh);

  return group;
}

// 使用例
const character = createOutlinedMesh(
  new THREE.BoxGeometry(1, 2, 1),
  createToonMaterial(0x3399ff, 3),
  0x000000,
  0.02
);
scene.add(character);
```

## MeshToonMaterial（Three.js組み込み）

```javascript
// グラデーションテクスチャ作成
function createGradientTexture(colors) {
  const size = colors.length;
  const data = new Uint8Array(size * 3);

  colors.forEach((color, i) => {
    const c = new THREE.Color(color);
    data[i * 3] = Math.floor(c.r * 255);
    data[i * 3 + 1] = Math.floor(c.g * 255);
    data[i * 3 + 2] = Math.floor(c.b * 255);
  });

  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// 3段階トゥーン
const threeTone = createGradientTexture([0x444444, 0x888888, 0xffffff]);

const toonMaterial = new THREE.MeshToonMaterial({
  color: 0xff6600,
  gradientMap: threeTone
});

const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), toonMaterial);
scene.add(mesh);
```

## ハーフトーン（ドット）シェーダー

```javascript
const halftoneFragmentShader = `
  uniform vec3 color;
  uniform vec3 lightDir;
  uniform float dotSize;
  uniform float dotSpacing;

  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    float NdotL = dot(vNormal, lightDir);
    float intensity = (NdotL + 1.0) * 0.5;

    // ハーフトーンパターン
    vec2 center = floor(gl_FragCoord.xy / dotSpacing) * dotSpacing + dotSpacing * 0.5;
    float dist = distance(gl_FragCoord.xy, center);
    float radius = dotSize * intensity;

    float dot = 1.0 - smoothstep(radius - 1.0, radius + 1.0, dist);

    vec3 finalColor = color * (0.3 + dot * 0.7);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function createHalftoneMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      lightDir: { value: new THREE.Vector3(0.5, 1, 0.5).normalize() },
      dotSize: { value: 4.0 },
      dotSpacing: { value: 8.0 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: halftoneFragmentShader
  });
}
```

## アニメ風ハイライト

```javascript
// スペキュラーハイライト付きトゥーン
const animeShaderFragment = `
  uniform vec3 color;
  uniform vec3 lightDir;
  uniform vec3 specularColor;
  uniform float shininess;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // 拡散光（2段階）
    float NdotL = dot(vNormal, lightDir);
    float diffuse = NdotL > 0.0 ? 1.0 : 0.5;

    // スペキュラー（シャープ）
    vec3 halfDir = normalize(lightDir + vViewDir);
    float spec = pow(max(dot(vNormal, halfDir), 0.0), shininess);
    spec = spec > 0.5 ? 1.0 : 0.0;  // シャープなカットオフ

    // リムライト
    float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    rim = pow(rim, 3.0);

    vec3 finalColor = color * diffuse + specularColor * spec + vec3(1.0) * rim * 0.2;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function createAnimeMaterial(baseColor, specColor = 0xffffff) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(baseColor) },
      lightDir: { value: new THREE.Vector3(0.5, 1, 0.5).normalize() },
      specularColor: { value: new THREE.Color(specColor) },
      shininess: { value: 32.0 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: animeShaderFragment
  });
}
```

## 完全なトゥーンキャラクター例

```javascript
import * as THREE from 'three';

class ToonCharacter {
  constructor(scene) {
    this.group = new THREE.Group();

    // 体
    this.body = this.createOutlinedPart(
      new THREE.CapsuleGeometry(0.4, 0.8, 8, 16),
      0x3399ff
    );
    this.body.position.y = 1;
    this.group.add(this.body);

    // 頭
    this.head = this.createOutlinedPart(
      new THREE.SphereGeometry(0.35, 16, 16),
      0xffcc99
    );
    this.head.position.y = 2;
    this.group.add(this.head);

    // 目
    const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.12, 2.05, 0.28);
    this.group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.12, 2.05, 0.28);
    this.group.add(rightEye);

    scene.add(this.group);
  }

  createOutlinedPart(geometry, color) {
    const group = new THREE.Group();

    // トゥーンマテリアル
    const toonMat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) },
        lightDir: { value: new THREE.Vector3(0.5, 1, 0.5).normalize() }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform vec3 lightDir;
        varying vec3 vNormal;
        void main() {
          float i = dot(vNormal, lightDir);
          i = i > 0.5 ? 1.0 : i > 0.0 ? 0.7 : 0.4;
          gl_FragColor = vec4(color * i, 1.0);
        }
      `
    });

    group.add(new THREE.Mesh(geometry, toonMat));

    // アウトライン
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.BackSide
    });
    const outline = new THREE.Mesh(geometry.clone(), outlineMat);
    outline.scale.multiplyScalar(1.05);
    group.add(outline);

    return group;
  }

  update(time) {
    // アイドルアニメーション
    this.group.position.y = Math.sin(time * 2) * 0.05;
    this.head.rotation.y = Math.sin(time) * 0.1;
  }
}

// 使用例
const character = new ToonCharacter(scene);

function animate(time) {
  character.update(time * 0.001);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
```
