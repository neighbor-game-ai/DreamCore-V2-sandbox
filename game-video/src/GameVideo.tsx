import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img } from "remotion";
import { GameVideoProps } from "./types";

// 7 seconds = 210 frames at 30fps
// Full screen gameplay demo - arcade style attract mode

export const GameVideo: React.FC<GameVideoProps> = ({
  assetUrls,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const hasAssets = assetUrls.length > 0;

  // Calculate which image to show
  const slideDuration = durationInFrames / Math.max(assetUrls.length, 1);
  const currentSlideIndex = Math.min(
    Math.floor(frame / slideDuration),
    assetUrls.length - 1
  );
  const currentSlide = assetUrls[Math.max(0, currentSlideIndex)];

  // Ken Burns effect - subtle zoom and pan
  const slideLocalFrame = frame % slideDuration;
  const slideProgress = slideLocalFrame / slideDuration;

  const scale = interpolate(slideProgress, [0, 1], [1, 1.08], {
    extrapolateRight: "clamp",
  });

  // Alternate pan direction based on slide index
  const panDirection = currentSlideIndex % 2 === 0 ? 1 : -1;
  const panX = interpolate(slideProgress, [0, 1], [0, 15 * panDirection], {
    extrapolateRight: "clamp",
  });

  // Crossfade between slides
  const fadeIn = interpolate(slideLocalFrame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(slideLocalFrame, [slideDuration - 10, slideDuration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = assetUrls.length > 1 ? Math.min(fadeIn, fadeOut) : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {hasAssets && currentSlide && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity,
          }}
        >
          <Img
            src={currentSlide}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: `scale(${scale}) translateX(${panX}px)`,
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};
