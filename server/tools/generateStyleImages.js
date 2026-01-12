/**
 * Style Image Batch Generator
 * Pre-generates ~100 visual style reference images using Gemini
 */

const fs = require('fs');
const path = require('path');
const geminiClient = require('../geminiClient');

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../../public/images/styles');

// Style definitions: dimension -> genre -> styles[]
const styleDefinitions = {
  '2d': {
    shooting: [
      { id: 'retro', prompt: '2D retro pixel art space shooter game screenshot, 8-bit style, colorful bullets, enemy ships, starfield background' },
      { id: 'neon', prompt: '2D neon cyberpunk shooter game screenshot, glowing bullets, dark background with neon colors, synthwave aesthetic' },
      { id: 'minimal', prompt: '2D minimalist shooter game screenshot, simple geometric shapes, clean lines, limited color palette, white background' },
      { id: 'kawaii', prompt: '2D cute kawaii shooter game screenshot, pastel colors, adorable characters, sparkles, soft rounded shapes' },
      { id: 'anime', prompt: '2D anime style shooter game screenshot, cel-shaded graphics, dynamic action, Japanese manga aesthetic' }
    ],
    action: [
      { id: 'retro', prompt: '2D retro pixel art action platformer game screenshot, 16-bit style, side-scrolling, detailed sprites' },
      { id: 'anime', prompt: '2D anime action game screenshot, cel-shaded characters, dynamic poses, Japanese art style' },
      { id: 'minimal', prompt: '2D minimalist action game screenshot, simple shapes, clean design, monochrome with accent color' },
      { id: 'kawaii', prompt: '2D kawaii cute action game screenshot, pastel colors, chibi characters, hearts and stars' },
      { id: 'comic', prompt: '2D comic book style action game screenshot, bold outlines, halftone dots, POW effects' }
    ],
    puzzle: [
      { id: 'pastel', prompt: '2D pastel colored puzzle game screenshot, soft colors, clean blocks, relaxing aesthetic' },
      { id: 'minimal', prompt: '2D minimalist puzzle game screenshot, geometric shapes, limited colors, zen-like design' },
      { id: 'kawaii', prompt: '2D kawaii puzzle game screenshot, cute block characters, pastel rainbow colors, sparkles' },
      { id: 'modern', prompt: '2D modern flat design puzzle game screenshot, bold colors, clean UI, material design' },
      { id: 'nature', prompt: '2D nature-themed puzzle game screenshot, leaves, flowers, organic shapes, earthy colors' }
    ],
    racing: [
      { id: 'retro', prompt: '2D retro pixel art racing game screenshot, top-down view, classic arcade style, checkered flags' },
      { id: 'neon', prompt: '2D neon racing game screenshot, glowing car trails, dark track, synthwave colors' },
      { id: 'kawaii', prompt: '2D kawaii racing game screenshot, cute cars with faces, pastel road, clouds and stars' },
      { id: 'cartoon', prompt: '2D cartoon racing game screenshot, exaggerated proportions, bright colors, fun style' },
      { id: 'futuristic', prompt: '2D futuristic racing game screenshot, hover cars, sci-fi track, blue and orange' }
    ],
    platformer: [
      { id: 'retro', prompt: '2D retro pixel art platformer game screenshot, classic Mario-like, colorful platforms, coins' },
      { id: 'hand_drawn', prompt: '2D hand-drawn sketch style platformer game screenshot, pencil textures, artistic' },
      { id: 'kawaii', prompt: '2D kawaii platformer game screenshot, cute character, fluffy clouds, pastel world' },
      { id: 'dark', prompt: '2D dark atmospheric platformer game screenshot, silhouette style, moody lighting, limbo-like' },
      { id: 'paper', prompt: '2D paper craft style platformer game screenshot, layered paper cutouts, textured' }
    ],
    rpg: [
      { id: 'retro', prompt: '2D retro JRPG game screenshot, 16-bit pixel art, top-down village, classic RPG style' },
      { id: 'anime', prompt: '2D anime RPG game screenshot, beautiful character portraits, fantasy world' },
      { id: 'kawaii', prompt: '2D kawaii RPG game screenshot, chibi characters, cute monsters, pastel fantasy' },
      { id: 'dark_fantasy', prompt: '2D dark fantasy RPG game screenshot, gothic style, detailed pixel art, moody' },
      { id: 'watercolor', prompt: '2D watercolor style RPG game screenshot, soft painted textures, dreamy atmosphere' }
    ],
    rhythm: [
      { id: 'neon', prompt: '2D neon rhythm game screenshot, glowing notes, dark background, music visualizer' },
      { id: 'kawaii', prompt: '2D kawaii rhythm game screenshot, cute music notes, pastel colors, idol theme' },
      { id: 'retro', prompt: '2D retro arcade rhythm game screenshot, pixel art, classic DDR style' },
      { id: 'modern', prompt: '2D modern sleek rhythm game screenshot, minimalist UI, gradient backgrounds' },
      { id: 'pop', prompt: '2D pop art rhythm game screenshot, bold colors, comic style, energetic' }
    ],
    tower_defense: [
      { id: 'medieval', prompt: '2D medieval tower defense game screenshot, castle towers, fantasy enemies, strategic view' },
      { id: 'kawaii', prompt: '2D kawaii tower defense game screenshot, cute towers, adorable enemies, pastel colors' },
      { id: 'sci_fi', prompt: '2D sci-fi tower defense game screenshot, laser turrets, alien enemies, space theme' },
      { id: 'minimal', prompt: '2D minimalist tower defense game screenshot, geometric towers, clean path design' },
      { id: 'cartoon', prompt: '2D cartoon tower defense game screenshot, funny characters, bright colors' }
    ]
  },
  '3d': {
    action: [
      { id: 'kawaii', prompt: '3D kawaii action game screenshot, cute low-poly characters, pastel colors, soft lighting' },
      { id: 'lowpoly', prompt: '3D low-poly action game screenshot, faceted geometric style, vibrant colors' },
      { id: 'realistic', prompt: '3D realistic action game screenshot, detailed textures, dramatic lighting, AAA quality' },
      { id: 'toon', prompt: '3D toon-shaded action game screenshot, cel-shaded graphics, bold outlines, anime style' },
      { id: 'voxel', prompt: '3D voxel action game screenshot, minecraft-like blocks, colorful cubic world' }
    ],
    racing: [
      { id: 'kawaii', prompt: '3D kawaii racing game screenshot, cute cars, pastel race track, fluffy clouds' },
      { id: 'lowpoly', prompt: '3D low-poly racing game screenshot, geometric vehicles, stylized environment' },
      { id: 'arcade', prompt: '3D arcade racing game screenshot, colorful tracks, boost pads, fun style' },
      { id: 'futuristic', prompt: '3D futuristic racing game screenshot, hover vehicles, neon tracks, sci-fi' },
      { id: 'realistic', prompt: '3D realistic racing game screenshot, detailed cars, photorealistic track' }
    ],
    platformer: [
      { id: 'kawaii', prompt: '3D kawaii platformer game screenshot, cute character, fluffy platforms, pastel world' },
      { id: 'lowpoly', prompt: '3D low-poly platformer game screenshot, geometric world, colorful platforms' },
      { id: 'toon', prompt: '3D toon-shaded platformer game screenshot, cartoon style, bright colors' },
      { id: 'fantasy', prompt: '3D fantasy platformer game screenshot, magical world, floating islands, sparkles' },
      { id: 'voxel', prompt: '3D voxel platformer game screenshot, blocky world, cubic character' }
    ],
    obstacle: [
      { id: 'kawaii', prompt: '3D kawaii obstacle course game screenshot, cute runner, pastel obstacles' },
      { id: 'lowpoly', prompt: '3D low-poly obstacle game screenshot, geometric hazards, clean design' },
      { id: 'neon', prompt: '3D neon obstacle game screenshot, glowing platforms, dark environment, synthwave' },
      { id: 'minimal', prompt: '3D minimalist obstacle game screenshot, white environment, simple shapes' },
      { id: 'temple_run', prompt: '3D temple run style game screenshot, ancient ruins, dynamic camera' }
    ],
    puzzle: [
      { id: 'kawaii', prompt: '3D kawaii puzzle game screenshot, cute objects, pastel room, soft lighting' },
      { id: 'minimal', prompt: '3D minimalist puzzle game screenshot, clean white room, simple objects' },
      { id: 'isometric', prompt: '3D isometric puzzle game screenshot, monument valley style, impossible geometry' },
      { id: 'nature', prompt: '3D nature puzzle game screenshot, garden setting, plants and stones' },
      { id: 'mechanical', prompt: '3D mechanical puzzle game screenshot, gears and levers, steampunk elements' }
    ],
    adventure: [
      { id: 'kawaii', prompt: '3D kawaii adventure game screenshot, cute explorer, colorful world' },
      { id: 'lowpoly', prompt: '3D low-poly adventure game screenshot, stylized landscapes, journey-like' },
      { id: 'realistic', prompt: '3D realistic adventure game screenshot, detailed environment, atmospheric' },
      { id: 'cartoon', prompt: '3D cartoon adventure game screenshot, zelda wind waker style, cel-shaded' },
      { id: 'fantasy', prompt: '3D fantasy adventure game screenshot, magical forest, mystical creatures' }
    ],
    sports: [
      { id: 'kawaii', prompt: '3D kawaii sports game screenshot, cute athletes, pastel stadium' },
      { id: 'arcade', prompt: '3D arcade sports game screenshot, exaggerated action, bright colors' },
      { id: 'realistic', prompt: '3D realistic sports game screenshot, detailed players, stadium atmosphere' },
      { id: 'lowpoly', prompt: '3D low-poly sports game screenshot, geometric players, stylized field' },
      { id: 'cartoon', prompt: '3D cartoon sports game screenshot, funny characters, oversized equipment' }
    ],
    simulation: [
      { id: 'kawaii', prompt: '3D kawaii simulation game screenshot, cute buildings, pastel city' },
      { id: 'lowpoly', prompt: '3D low-poly simulation game screenshot, geometric buildings, clean design' },
      { id: 'realistic', prompt: '3D realistic simulation game screenshot, detailed environment, lifelike' },
      { id: 'isometric', prompt: '3D isometric simulation game screenshot, city builder view, detailed' },
      { id: 'toon', prompt: '3D toon simulation game screenshot, cartoon buildings, bright colors' }
    ]
  }
};

// Count total images
function countImages() {
  let count = 0;
  for (const dim of Object.keys(styleDefinitions)) {
    for (const genre of Object.keys(styleDefinitions[dim])) {
      count += styleDefinitions[dim][genre].length;
    }
  }
  return count;
}

// Ensure output directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Save base64 data URL to file
function saveBase64Image(dataUrl, filePath) {
  // Extract base64 data from data URL
  const matches = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid data URL format');
  }
  const buffer = Buffer.from(matches[1], 'base64');
  fs.writeFileSync(filePath, buffer);
}

// Generate a single image
async function generateImage(dimension, genre, style, index, total) {
  const outputPath = path.join(OUTPUT_DIR, dimension, genre);
  const filename = `${style.id}.png`;
  const fullPath = path.join(outputPath, filename);

  // Skip if already exists
  if (fs.existsSync(fullPath)) {
    console.log(`[${index}/${total}] SKIP: ${dimension}/${genre}/${style.id} (already exists)`);
    return { success: true, skipped: true };
  }

  ensureDir(outputPath);

  console.log(`[${index}/${total}] Generating: ${dimension}/${genre}/${style.id}...`);

  try {
    const result = await geminiClient.generateImage({
      prompt: style.prompt,
      transparent: false  // We want backgrounds for style previews
    });

    if (result.success && result.image) {
      // Save the base64 image to file
      saveBase64Image(result.image, fullPath);
      console.log(`  -> Saved: ${fullPath}`);
      return { success: true, path: fullPath };
    } else {
      console.log(`  -> FAILED: No image data`);
      return { success: false, error: 'No image data' };
    }
  } catch (error) {
    console.log(`  -> ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main batch generation
async function generateAll() {
  const total = countImages();
  console.log(`\n=== Style Image Generator ===`);
  console.log(`Total images to generate: ${total}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  let index = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const dimension of Object.keys(styleDefinitions)) {
    for (const genre of Object.keys(styleDefinitions[dimension])) {
      for (const style of styleDefinitions[dimension][genre]) {
        index++;
        const result = await generateImage(dimension, genre, style, index, total);

        if (result.skipped) {
          skipped++;
        } else if (result.success) {
          success++;
        } else {
          failed++;
        }

        // Rate limiting - wait between requests
        if (!result.skipped) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  console.log(`\n=== Generation Complete ===`);
  console.log(`Success: ${success}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${total}`);
}

// Export for use as module
module.exports = { styleDefinitions, generateAll };

// Run if called directly
if (require.main === module) {
  generateAll().catch(console.error);
}
