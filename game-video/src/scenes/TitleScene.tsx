import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img } from "remotion";
import { SceneProps } from "../types";

export const TitleScene: React.FC<SceneProps> = ({ title = "My Game", assetUrls = [], brandColor = "#FF3B30" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation: fade in and slide up
  const titleOpacity = interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0.3 * fps, 0.7 * fps], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleScale = interpolate(frame, [0.3 * fps, 0.7 * fps], [0.9, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Background gameplay image animation
  const bgOpacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  const bgScale = interpolate(frame, [0, fps * 2], [1.1, 1], {
    extrapolateRight: "clamp",
  });

  const firstAsset = assetUrls[0];

  return (
    <AbsoluteFill
      style={{
        background: "#0a0a0a",
      }}
    >
      {/* Full screen gameplay image as background */}
      {firstAsset && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: bgOpacity,
            transform: `scale(${bgScale})`,
            overflow: "hidden",
          }}
        >
          <Img
            src={firstAsset}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        </div>
      )}

      {/* Dark gradient overlay for title readability */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.8) 100%)`,
        }}
      />

      {/* Title at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 40,
          right: 40,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px) scale(${titleScale})`,
        }}
      >
        <h1
          style={{
            fontSize: 64,
            fontWeight: "bold",
            color: "#ffffff",
            textAlign: "center",
            margin: 0,
            textShadow: "0 4px 20px rgba(0,0,0,0.5)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {title}
        </h1>
      </div>

      {/* Brand accent line */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          width: interpolate(frame, [0.5 * fps, 0.9 * fps], [0, 100], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          height: 4,
          backgroundColor: brandColor,
          borderRadius: 2,
        }}
      />
    </AbsoluteFill>
  );
};
