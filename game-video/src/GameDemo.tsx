import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img, staticFile } from "remotion";

export const GameDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Asset images
  const playerImg = staticFile("asset2.png"); // G9fzLwEbIAAezZs-nobg_edited.png
  const goalImg = staticFile("asset0.jpg"); // G9fzLwEbIAAezZs-nobg.png

  // Virtual game resolution
  const VIRTUAL_WIDTH = 390;
  const VIRTUAL_HEIGHT = 844;
  const TILE_SIZE = 60;
  
  // Scale factor for video (1080x1920 vs 390x844)
  const scaleToVideo = width / VIRTUAL_WIDTH;
  const playerSize = 40 * scaleToVideo; // radius 20 * 2
  const tileSize = TILE_SIZE * scaleToVideo;
  const coinSize = (TILE_SIZE * 0.5) * scaleToVideo;

  // Scene transitions
  const scene1 = frame < 45;
  const scene2 = frame >= 45 && frame < 105;
  const scene3 = frame >= 105 && frame < 165;
  const scene4 = frame >= 165;

  // Scene 1: Intro (0-45f) - Zoomed out with title fade in
  const introScale = scene1 ? interpolate(frame, [0, 45], [0.7, 0.85], { extrapolateRight: "clamp" }) : 0.85;
  const titleOpacity1 = scene1 ? interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const titleSize1 = scene1 ? interpolate(frame, [0, 30], [60, 120], { extrapolateRight: "clamp" }) : 120;

  // Scene 2: Main play (45-105f) - Normal scale, title moves to corner
  const playScale = scene2 ? 1.0 : (scene1 ? introScale : 1.0);
  const titleOpacity2 = scene2 ? interpolate(frame, [45, 60], [1, 0.3], { extrapolateRight: "clamp" }) : (scene1 ? titleOpacity1 : 0.3);
  const titlePosY = scene2 ? interpolate(frame, [45, 60], [height * 0.35, 100], { extrapolateRight: "clamp" }) : (scene1 ? height * 0.35 : 100);
  const titleSize2 = scene2 ? interpolate(frame, [45, 60], [120, 50], { extrapolateRight: "clamp" }) : (scene1 ? titleSize1 : 50);

  // Scene 3: Climax (105-165f) - Zoom in with vignette
  const climaxScale = scene3 ? interpolate(frame, [105, 120], [1.0, 1.4], { extrapolateRight: "clamp" }) : (scene2 ? playScale : 1.4);
  const vignetteOpacity = scene3 ? interpolate(frame, [105, 120], [0, 0.7], { extrapolateRight: "clamp" }) : (scene4 ? 0.7 : 0);

  // Scene 4: Finish (165-210f) - Flash, zoom out, title returns
  const flashOpacity = scene4 && frame >= 165 && frame < 170 ? interpolate(frame, [165, 170], [1, 0]) : 0;
  const finishScale = scene4 ? interpolate(frame, [165, 180], [1.4, 0.9], { extrapolateRight: "clamp" }) : climaxScale;
  const titleOpacity4 = scene4 ? interpolate(frame, [170, 190], [0, 1], { extrapolateRight: "clamp" }) : titleOpacity2;
  const titlePosY4 = scene4 ? interpolate(frame, [170, 190], [100, height * 0.3], { extrapolateRight: "clamp" }) : titlePosY;
  const titleSize4 = scene4 ? interpolate(frame, [170, 190], [50, 110], { extrapolateRight: "clamp" }) : titleSize2;
  const ctaOpacity = scene4 ? interpolate(frame, [185, 205], [0, 1], { extrapolateRight: "clamp" }) : 0;

  // Final values for current frame
  const currentScale = scene4 ? finishScale : (scene3 ? climaxScale : (scene2 ? playScale : introScale));
  const currentTitleOpacity = scene4 ? titleOpacity4 : titleOpacity2;
  const currentTitlePosY = scene4 ? titlePosY4 : titlePosY;
  const currentTitleSize = scene4 ? titleSize4 : titleSize2;

  // Player animation - moving through the level
  const playerProgress = interpolate(frame, [0, 210], [0, 1], { extrapolateRight: "clamp" });
  const pathY = interpolate(playerProgress, [0, 0.3, 0.5, 0.7, 1.0], [height * 0.8, height * 0.6, height * 0.5, height * 0.4, height * 0.2]);
  const pathX = width / 2 + Math.sin(playerProgress * Math.PI * 4) * (width * 0.15);
  
  // Player rotation (rolling effect)
  const playerRotation = frame * 8;

  // Coins positions
  const coins = [
    { x: width * 0.7, y: height * 0.7, collected: frame > 30 },
    { x: width * 0.4, y: height * 0.55, collected: frame > 70 },
    { x: width * 0.65, y: height * 0.42, collected: frame > 110 },
    { x: width * 0.35, y: height * 0.28, collected: frame > 150 },
  ];

  // Walls
  const walls = [
    { x: width * 0.2, y: height * 0.65, w: tileSize, h: tileSize },
    { x: width * 0.8, y: height * 0.52, w: tileSize, h: tileSize },
    { x: width * 0.3, y: height * 0.38, w: tileSize, h: tileSize },
    { x: width * 0.75, y: height * 0.25, w: tileSize, h: tileSize },
  ];

  // Holes (darker circles)
  const holes = [
    { x: width * 0.5, y: height * 0.73, size: tileSize * 0.7 },
    { x: width * 0.6, y: height * 0.48, size: tileSize * 0.7 },
  ];

  // Goal position
  const goalX = width * 0.5;
  const goalY = height * 0.15;
  const goalPulse = Math.sin(frame * 0.2) * 5;

  // Score animation
  const score = Math.floor(interpolate(frame, [30, 150], [0, 400], { extrapolateRight: "clamp" }));
  const timeElapsed = Math.floor(frame / fps);

  // Explosion effect in scene 3
  const explosionFrame = 120;
  const showExplosion = frame >= explosionFrame && frame < explosionFrame + 20;
  const explosionScale = showExplosion ? interpolate(frame, [explosionFrame, explosionFrame + 20], [0, 3]) : 0;
  const explosionOpacity = showExplosion ? interpolate(frame, [explosionFrame, explosionFrame + 20], [1, 0]) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#228B22" }}>
      {/* Game container with dynamic scale */}
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${currentScale})`,
          transition: "transform 0.1s ease-out",
        }}
      >
        {/* Floor tiles pattern */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`floor-${i}`}
            style={{
              position: "absolute",
              left: (i % 4) * (width / 4),
              top: (Math.floor(i / 4) * (height / 3)) - (frame * 2) % (height / 3),
              width: width / 4,
              height: height / 3,
              backgroundColor: i % 2 === 0 ? "#2E8B57" : "#3CB371",
              opacity: 0.3,
            }}
          />
        ))}

        {/* Holes */}
        {holes.map((hole, i) => (
          <div
            key={`hole-${i}`}
            style={{
              position: "absolute",
              left: hole.x - hole.size / 2,
              top: hole.y,
              width: hole.size,
              height: hole.size,
              borderRadius: "50%",
              backgroundColor: "#000",
              opacity: 0.6,
              boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)",
            }}
          />
        ))}

        {/* Walls */}
        {walls.map((wall, i) => (
          <div
            key={`wall-${i}`}
            style={{
              position: "absolute",
              left: wall.x - wall.w / 2,
              top: wall.y - wall.h / 2,
              width: wall.w,
              height: wall.h,
              backgroundColor: "#654321",
              border: "4px solid #8B4513",
              boxShadow: "4px 4px 0 rgba(0,0,0,0.5)",
              imageRendering: "pixelated",
            }}
          />
        ))}

        {/* Coins */}
        {coins.map((coin, i) => {
          if (coin.collected) return null;
          const coinRotation = frame * 5;
          return (
            <div
              key={`coin-${i}`}
              style={{
                position: "absolute",
                left: coin.x - coinSize / 2,
                top: coin.y - coinSize / 2,
                width: coinSize,
                height: coinSize,
                borderRadius: "50%",
                backgroundColor: "#FFD700",
                border: "3px solid #FFA500",
                transform: `rotateY(${coinRotation}deg)`,
                boxShadow: "0 0 10px rgba(255,215,0,0.8)",
              }}
            />
          );
        })}

        {/* Goal */}
        <Img
          src={goalImg}
          style={{
            position: "absolute",
            left: goalX - (tileSize + goalPulse) / 2,
            top: goalY - (tileSize + goalPulse) / 2,
            width: tileSize + goalPulse,
            height: tileSize + goalPulse,
            objectFit: "contain",
            filter: "drop-shadow(0 0 15px rgba(255,255,0,0.8))",
          }}
        />

        {/* Player */}
        <Img
          src={playerImg}
          style={{
            position: "absolute",
            left: pathX - playerSize / 2,
            top: pathY - playerSize / 2,
            width: playerSize,
            height: playerSize,
            objectFit: "contain",
            transform: `rotate(${playerRotation}deg)`,
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))",
          }}
        />

        {/* Explosion effect (Scene 3) */}
        {showExplosion && (
          <div
            style={{
              position: "absolute",
              left: width * 0.6,
              top: height * 0.48,
              width: 100,
              height: 100,
              borderRadius: "50%",
              backgroundColor: "#FF6B00",
              transform: `scale(${explosionScale})`,
              opacity: explosionOpacity,
              boxShadow: "0 0 50px rgba(255,107,0,1)",
            }}
          />
        )}
      </div>

      {/* HUD - Score & Time */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 40,
          fontFamily: "Courier New, monospace",
          fontSize: 40,
          fontWeight: "bold",
          color: "#FFFF00",
          textShadow: "4px 4px 0 #000",
          opacity: scene2 || scene3 ? 1 : 0,
        }}
      >
        SCORE: {score}
      </div>
      <div
        style={{
          position: "absolute",
          top: 40,
          right: 40,
          fontFamily: "Courier New, monospace",
          fontSize: 40,
          fontWeight: "bold",
          color: "#00FFFF",
          textShadow: "4px 4px 0 #000",
          opacity: scene2 || scene3 ? 1 : 0,
        }}
      >
        TIME: {timeElapsed}
      </div>

      {/* Vignette effect (Scene 3) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle, transparent 40%, rgba(0,0,0,0.9) 100%)",
          opacity: vignetteOpacity,
          pointerEvents: "none",
        }}
      />

      {/* Flash effect (Scene 4 transition) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#FFF",
          opacity: flashOpacity,
          pointerEvents: "none",
        }}
      />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: currentTitlePosY,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: "translateY(-50%)",
          opacity: currentTitleOpacity,
        }}
      >
        <h1
          style={{
            fontFamily: "Courier New, monospace",
            fontSize: currentTitleSize,
            fontWeight: "bold",
            color: "#00FF00",
            textShadow: "6px 6px 0 #000",
            margin: 0,
            textAlign: "center",
            lineHeight: 1.2,
            letterSpacing: "0.05em",
          }}
        >
          RETRO
          <br />
          ROLLING BALL
        </h1>
      </div>

      {/* CTA (Scene 4) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: height * 0.2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: ctaOpacity,
        }}
      >
        <div
          style={{
            padding: "30px 60px",
            fontSize: 60,
            fontFamily: "Courier New, monospace",
            fontWeight: "bold",
            backgroundColor: "#4169E1",
            color: "#FFF",
            border: "6px solid #FFF",
            boxShadow: "8px 8px 0 #000",
            textTransform: "uppercase",
          }}
        >
          PLAY NOW
        </div>
      </div>
    </AbsoluteFill>
  );
};
