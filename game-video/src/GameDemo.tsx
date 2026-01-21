import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img, staticFile } from "remotion";

export const GameDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const playerImg = staticFile("asset0.png");
  const enemyImg = staticFile("asset1.png");
  const itemImg = staticFile("asset2.png");

  // Virtual dimensions from game code
  const VIRTUAL_WIDTH = 390;
  const VIRTUAL_HEIGHT = 844;
  const scaleRatio = width / VIRTUAL_WIDTH;

  // Scene timing
  const scene1End = 45;
  const scene2End = 105;
  const scene3End = 165;
  const scene4End = 210;

  // Scene 1: Intro (0-45f) - Pull back camera
  const scene1Scale = interpolate(frame, [0, 45], [0.7, 0.85], { extrapolateRight: "clamp" });
  const titleOpacity1 = interpolate(frame, [0, 20, 45], [0, 1, 1], { extrapolateRight: "clamp" });
  const titleScale1 = interpolate(frame, [0, 20], [1.5, 1], { extrapolateRight: "clamp" });

  // Scene 2: Main play (45-105f) - Normal view
  const scene2Scale = interpolate(frame, [45, 60], [0.85, 1.0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const titleOpacity2 = interpolate(frame, [45, 60], [1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Scene 3: Climax (105-165f) - Zoom in + vignette
  const scene3Scale = interpolate(frame, [105, 120], [1.0, 1.4], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const vignetteOpacity = interpolate(frame, [105, 120, 165], [0, 0.6, 0.6], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Scene 4: Finish (165-210f) - Pull back + flash
  const scene4Scale = interpolate(frame, [165, 180], [1.4, 0.8], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const flashOpacity = interpolate(frame, [165, 170], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const flashFade = interpolate(frame, [170, 180], [1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const titleOpacity4 = interpolate(frame, [180, 200], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const ctaOpacity = interpolate(frame, [195, 210], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Combined scale for camera
  let cameraScale = 1;
  if (frame < scene1End) cameraScale = scene1Scale;
  else if (frame < scene2End) cameraScale = scene2Scale;
  else if (frame < scene3End) cameraScale = scene3Scale;
  else cameraScale = scene4Scale;

  // Player animation
  const playerX = interpolate(frame, [0, 210], [VIRTUAL_WIDTH / 2, VIRTUAL_WIDTH / 2]);
  const playerY = VIRTUAL_HEIGHT - 150;
  const playerSize = 60 * scaleRatio;
  
  // Player movement (subtle sway in scene 1, active in scene 2-3)
  const playerSway = frame < 45 
    ? Math.sin(frame * 0.1) * 10
    : Math.sin(frame * 0.15) * 30;

  // Bullets
  const bullets = [];
  if (frame >= 30 && frame < 180) {
    for (let i = 0; i < 3; i++) {
      const bulletFrame = (frame - 30 - i * 15) % 60;
      if (bulletFrame >= 0 && bulletFrame < 50) {
        bullets.push({
          x: playerX + playerSway,
          y: playerY - bulletFrame * 15,
          size: 8 * scaleRatio
        });
      }
    }
  }

  // Enemies
  const enemies = [];
  if (frame >= 20) {
    for (let i = 0; i < 4; i++) {
      const enemyFrame = (frame - 20 - i * 25) % 100;
      if (enemyFrame >= 0 && enemyFrame < 80) {
        const enemyX = 80 + i * 80 + Math.sin(enemyFrame * 0.15) * 40;
        const enemyY = 100 + enemyFrame * 6;
        const enemySize = 50 * scaleRatio;
        
        // Explosion in scene 3
        const isExploding = frame > 110 && frame < 140 && i === 1;
        const explosionScale = isExploding ? interpolate(frame, [110, 125], [1, 2], { extrapolateRight: "clamp" }) : 1;
        const explosionOpacity = isExploding ? interpolate(frame, [110, 125], [1, 0], { extrapolateRight: "clamp" }) : 1;
        
        enemies.push({
          x: enemyX,
          y: enemyY,
          size: enemySize,
          scale: explosionScale,
          opacity: explosionOpacity
        });
      }
    }
  }

  // Item drop (scene 3)
  const itemVisible = frame > 125 && frame < 160;
  const itemY = itemVisible ? 300 + (frame - 125) * 4 : -100;
  const itemSize = 30 * scaleRatio;

  // Particles (scene 3 explosions)
  const particles = [];
  if (frame > 110 && frame < 150) {
    for (let i = 0; i < 12; i++) {
      const pFrame = frame - 110;
      const angle = (i / 12) * Math.PI * 2;
      const speed = 3 + Math.random() * 2;
      particles.push({
        x: 160 + Math.cos(angle) * speed * pFrame,
        y: 250 + Math.sin(angle) * speed * pFrame,
        opacity: interpolate(pFrame, [0, 40], [1, 0], { extrapolateRight: "clamp" }),
        size: 6 * scaleRatio
      });
    }
  }

  // Background stars
  const stars = Array.from({ length: 30 }, (_, i) => ({
    x: (i * 37) % VIRTUAL_WIDTH,
    y: ((i * 73) % VIRTUAL_HEIGHT - frame * 2) % VIRTUAL_HEIGHT,
    size: 2 + (i % 3)
  }));

  return (
    <AbsoluteFill style={{ backgroundColor: "#4169e1" }}>
      {/* Camera wrapper */}
      <div
        style={{
          width: VIRTUAL_WIDTH * scaleRatio,
          height: VIRTUAL_HEIGHT * scaleRatio,
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${cameraScale})`,
          transformOrigin: "center center"
        }}
      >
        {/* Background stars */}
        {stars.map((star, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: star.x * scaleRatio,
              top: star.y * scaleRatio,
              width: star.size * scaleRatio,
              height: star.size * scaleRatio,
              backgroundColor: "white",
              borderRadius: "50%",
              opacity: 0.7
            }}
          />
        ))}

        {/* Enemies */}
        {enemies.map((enemy, i) => (
          <Img
            key={`enemy-${i}`}
            src={enemyImg}
            style={{
              position: "absolute",
              left: enemy.x * scaleRatio - enemy.size / 2,
              top: enemy.y * scaleRatio - enemy.size / 2,
              width: enemy.size * enemy.scale,
              height: enemy.size * enemy.scale,
              opacity: enemy.opacity,
              imageRendering: "pixelated"
            }}
          />
        ))}

        {/* Explosion particles */}
        {particles.map((p, i) => (
          <div
            key={`particle-${i}`}
            style={{
              position: "absolute",
              left: p.x * scaleRatio,
              top: p.y * scaleRatio,
              width: p.size,
              height: p.size,
              backgroundColor: "#ff6600",
              borderRadius: "50%",
              opacity: p.opacity
            }}
          />
        ))}

        {/* Item */}
        {itemVisible && (
          <Img
            src={itemImg}
            style={{
              position: "absolute",
              left: 160 * scaleRatio - itemSize / 2,
              top: itemY * scaleRatio - itemSize / 2,
              width: itemSize,
              height: itemSize,
              imageRendering: "pixelated"
            }}
          />
        )}

        {/* Player */}
        <Img
          src={playerImg}
          style={{
            position: "absolute",
            left: (playerX + playerSway) * scaleRatio - playerSize / 2,
            top: playerY * scaleRatio - playerSize / 2,
            width: playerSize,
            height: playerSize,
            imageRendering: "pixelated"
          }}
        />

        {/* Bullets */}
        {bullets.map((bullet, i) => (
          <div
            key={`bullet-${i}`}
            style={{
              position: "absolute",
              left: bullet.x * scaleRatio - bullet.size / 2,
              top: bullet.y * scaleRatio - bullet.size / 2,
              width: bullet.size,
              height: bullet.size * 2,
              backgroundColor: "#00ff00",
              borderRadius: bullet.size / 2
            }}
          />
        ))}

        {/* HUD */}
        <div
          style={{
            position: "absolute",
            top: 10 * scaleRatio,
            left: 10 * scaleRatio,
            color: "white",
            fontFamily: "Courier New, monospace",
            fontSize: 20 * scaleRatio,
            fontWeight: "bold",
            textShadow: "2px 2px 0 black"
          }}
        >
          SCORE: {String(Math.floor(frame * 50)).padStart(6, "0")}
        </div>
        <div
          style={{
            position: "absolute",
            top: 10 * scaleRatio,
            right: 10 * scaleRatio,
            color: "#00ff00",
            fontFamily: "Courier New, monospace",
            fontSize: 20 * scaleRatio,
            fontWeight: "bold",
            textShadow: "2px 2px 0 black"
          }}
        >
          HP: |||||
        </div>
      </div>

      {/* Vignette effect (Scene 3) */}
      {frame >= scene2End && frame < scene4End && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle, transparent 40%, rgba(0,0,0,0.8) 100%)",
            opacity: vignetteOpacity,
            pointerEvents: "none"
          }}
        />
      )}

      {/* Flash effect (Scene 4) */}
      {frame >= 165 && frame < 180 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "white",
            opacity: flashOpacity * flashFade
          }}
        />
      )}

      {/* Title overlay (Scene 1) */}
      {frame < scene1End && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            opacity: titleOpacity1
          }}
        >
          <div
            style={{
              fontSize: 120,
              fontFamily: "Courier New, monospace",
              fontWeight: "bold",
              color: "#ffff00",
              textShadow: "6px 6px 0 #ff0000",
              transform: `scale(${titleScale1})`,
              textAlign: "center",
              lineHeight: 1.2
            }}
          >
            PIXEL<br />SHOOTER
          </div>
        </div>
      )}

      {/* Small title (Scene 2) */}
      {frame >= scene1End && frame < scene2End && (
        <div
          style={{
            position: "absolute",
            top: 50,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 60,
            fontFamily: "Courier New, monospace",
            fontWeight: "bold",
            color: "#ffff00",
            textShadow: "4px 4px 0 #ff0000",
            opacity: titleOpacity2
          }}
        >
          PIXEL SHOOTER
        </div>
      )}

      {/* Final title + CTA (Scene 4) */}
      {frame >= 165 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            opacity: titleOpacity4
          }}
        >
          <div
            style={{
              fontSize: 100,
              fontFamily: "Courier New, monospace",
              fontWeight: "bold",
              color: "#ffff00",
              textShadow: "6px 6px 0 #ff0000",
              textAlign: "center",
              lineHeight: 1.2,
              marginBottom: 40
            }}
          >
            PIXEL<br />SHOOTER
          </div>
          <div
            style={{
              fontSize: 50,
              fontFamily: "Courier New, monospace",
              fontWeight: "bold",
              color: "#00ff00",
              backgroundColor: "rgba(0,0,0,0.7)",
              padding: "20px 60px",
              border: "4px solid white",
              opacity: ctaOpacity
            }}
          >
            PLAY NOW
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
