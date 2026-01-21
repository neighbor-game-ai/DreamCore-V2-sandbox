import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { SceneProps } from "../types";

export const CTAScene: React.FC<SceneProps> = ({
  title = "My Game",
  brandColor = "#FF3B30"
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo animation
  const logoScale = interpolate(frame, [0, 0.4 * fps], [0.8, 1], {
    extrapolateRight: "clamp",
  });
  const logoOpacity = interpolate(frame, [0, 0.3 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Title animation
  const titleOpacity = interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Button animation
  const buttonOpacity = interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const buttonScale = interpolate(frame, [0.4 * fps, 0.7 * fps], [0.9, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Button pulse effect
  const pulsePhase = (frame % (fps * 0.8)) / (fps * 0.8);
  const pulse = 1 + Math.sin(pulsePhase * Math.PI * 2) * 0.03;

  // Branding animation
  const brandingOpacity = interpolate(frame, [0.6 * fps, 0.9 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${brandColor}20 0%, #FFFFFF 40%, #FFFFFF 60%, ${brandColor}10 100%)`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Background decorations */}
      <div
        style={{
          position: "absolute",
          top: -200,
          right: -200,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `${brandColor}15`,
          opacity: logoOpacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -150,
          left: -150,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `${brandColor}10`,
          opacity: logoOpacity,
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 50,
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 30,
            background: brandColor,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            boxShadow: `0 10px 40px ${brandColor}50`,
          }}
        >
          <span style={{ fontSize: 60 }}>🎮</span>
        </div>

        {/* Game title */}
        <h1
          style={{
            fontSize: 56,
            fontWeight: "bold",
            color: "#1a1a1a",
            textAlign: "center",
            margin: 0,
            padding: "0 60px",
            opacity: titleOpacity,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {title}
        </h1>

        {/* Play Now button */}
        <div
          style={{
            opacity: buttonOpacity,
            transform: `scale(${buttonScale * pulse})`,
          }}
        >
          <div
            style={{
              padding: "24px 80px",
              borderRadius: 50,
              background: brandColor,
              boxShadow: `0 8px 30px ${brandColor}60`,
            }}
          >
            <span
              style={{
                fontSize: 36,
                fontWeight: "bold",
                color: "#ffffff",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              Play Now
            </span>
          </div>
        </div>

        {/* Sub text */}
        <p
          style={{
            fontSize: 24,
            color: "#666666",
            opacity: buttonOpacity,
            margin: 0,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          Free to play
        </p>
      </div>

      {/* Branding footer */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          opacity: brandingOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#FF3B30",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                background: "white",
                borderRadius: 4,
              }}
            />
          </div>
          <span
            style={{
              fontSize: 20,
              color: "#999999",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            Made with Game Creator
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
