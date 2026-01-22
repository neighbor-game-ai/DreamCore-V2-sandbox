/**
 * Style Image Cache System
 * Uses pre-generated local images for style previews
 * Styles are genre-independent; images are found from any available folder
 */

const fs = require('fs');
const path = require('path');
const { getStyleOptions } = require('./stylePresets');

// Path to pre-generated style images
const IMAGES_DIR = path.join(__dirname, '../public/images/styles');

/**
 * Find an image for a style from any available folder
 */
function findStyleImage(dimension, styleId) {
  const dimPath = path.join(IMAGES_DIR, dimension);
  if (!fs.existsSync(dimPath)) return null;

  const folders = fs.readdirSync(dimPath).filter(f => {
    const fPath = path.join(dimPath, f);
    return fs.statSync(fPath).isDirectory();
  });

  // Search all folders for the style image (prefer WebP)
  for (const folder of folders) {
    // Try WebP first
    const webpPath = path.join(dimPath, folder, `${styleId}.webp`);
    if (fs.existsSync(webpPath)) {
      return `/images/styles/${dimension}/${folder}/${styleId}.webp`;
    }
    // Fallback to PNG
    const pngPath = path.join(dimPath, folder, `${styleId}.png`);
    if (fs.existsSync(pngPath)) {
      return `/images/styles/${dimension}/${folder}/${styleId}.png`;
    }
  }

  return null;
}

/**
 * Get local image path for a style
 * Returns URL path (not filesystem path) for use in browser
 */
function getStyleImageUrl(dimension, styleId) {
  return findStyleImage(dimension, styleId);
}

/**
 * Get all available styles with images for a dimension
 * Uses stylePresets.js as the source of truth for style definitions
 */
function getStyleOptionsWithImages(dimension) {
  const dim = dimension === '3d' ? '3d' : '2d';
  const styles = getStyleOptions(dim);

  return styles.map(style => {
    const imageUrl = findStyleImage(dim, style.id);
    return {
      id: style.id,
      name: style.name,
      imageUrl: imageUrl
    };
  });
}

/**
 * Get available images for a dimension
 * Useful for debugging/listing what's generated
 */
function getAvailableImages(dimension) {
  const dimPath = path.join(IMAGES_DIR, dimension);
  if (!fs.existsSync(dimPath)) return [];

  const results = [];
  const folders = fs.readdirSync(dimPath);

  for (const folder of folders) {
    const folderPath = path.join(dimPath, folder);
    if (fs.statSync(folderPath).isDirectory()) {
      const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.webp') || f.endsWith('.png'));
      for (const file of files) {
        results.push({
          dimension,
          folder,
          styleId: file.replace('.png', ''),
          url: `/images/styles/${dimension}/${folder}/${file}`
        });
      }
    }
  }

  return results;
}

module.exports = {
  getStyleImageUrl,
  getStyleOptionsWithImages,
  getAvailableImages
};
