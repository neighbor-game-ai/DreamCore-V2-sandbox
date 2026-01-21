import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img } from "remotion";
import { SceneProps } from "../types";

export const SlideshowScene: React.FC<SceneProps> = ({
  assetUrls = [],
  brandColor = "#FF3B30"
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Use all assets for slideshow (gameplay screenshots)
  const hasAssets = assetUrls.length > 0;

  // Calculate which image to show
  const slideDuration = durationInFrames / Math.max(assetUrls.length, 1);
  const currentSlideIndex = Math.min(
    Math.floor(frame / slideDuration),
    assetUrls.length - 1
  );
  const currentSlide = assetUrls[Math.max(0, currentSlideIndex)];

  // Ken Burns effect for current slide
  const slideProgress = (frame % slideDuration) / slideDuration;
  const scale = interpolate(slideProgress, [0, 1], [1, 1.15]);
  const xOffset = interpolate(slideProgress, [0, 1], [0, -30]);

  // Fade in/out for slide transitions
  const slideLocalFrame = frame % slideDuration;
  const fadeIn = interpolate(slideLocalFrame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(slideLocalFrame, [slideDuration - 8, slideDuration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{
        background: "#0a0a0a",
      }}
    >
      {/* Full screen gameplay image */}
      {hasAssets && currentSlide && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: "hidden",
            opacity,
          }}
        >
          <Img
            src={currentSlide}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: `scale(${scale}) translateX(${xOffset}px)`,
            }}
          />
        </div>
      )}

      {/* Subtle vignette overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Slide indicators */}
      {assetUrls.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 12,
          }}
        >
          {assetUrls.map((_, index) => (
            <div
              key={index}
              style={{
                width: index === currentSlideIndex ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: index === currentSlideIndex ? brandColor : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};
