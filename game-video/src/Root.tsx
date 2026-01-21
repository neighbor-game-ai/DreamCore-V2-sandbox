import { Composition } from "remotion";
import { GameDemo } from "./GameDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="GameVideo"
      component={GameDemo}
      durationInFrames={210}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
