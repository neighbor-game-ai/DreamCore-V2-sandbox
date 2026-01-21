export type GameVideoProps = {
  // Game information
  title: string;
  howToPlay: string;

  // Visual assets (file paths or data URLs)
  assetUrls: string[];

  // Branding
  brandColor?: string;  // Default: #FF3B30
};

export type SceneProps = {
  title?: string;
  howToPlay?: string;
  assetUrls?: string[];
  brandColor?: string;
};
