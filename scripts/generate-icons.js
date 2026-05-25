const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC = path.resolve(__dirname, '../assets/yusay-icon.svg');
const OUT_DIR = path.resolve(__dirname, '../assets');

async function generate() {
  const svgSrc = fs.readFileSync(SRC, 'utf-8');

  // 1. 메인 아이콘 (iOS + 기본)
  await sharp(Buffer.from(svgSrc))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(OUT_DIR, 'icon.png'));
  console.log('✓ icon.png (1024x1024)');

  // 2. Android Adaptive Icon foreground (투명 배경 + 80% safe-zone)
  const adaptiveSvg = svgSrc
    .replace(/<rect x="0" y="0" width="1024" height="1024" fill="#534AB7"\/>/, '');

  await sharp(Buffer.from(adaptiveSvg))
    .resize(820, 820)       // 80% of 1024
    .extend({
      top: 102, bottom: 102, left: 102, right: 102,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(OUT_DIR, 'adaptive-icon.png'));
  console.log('✓ adaptive-icon.png (1024x1024, transparent bg, 80% safe zone)');

  // 3. Splash icon (같은 디자인)
  await sharp(Buffer.from(svgSrc))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(OUT_DIR, 'splash-icon.png'));
  console.log('✓ splash-icon.png (1024x1024)');

  // 4. Favicon (웹용)
  await sharp(Buffer.from(svgSrc))
    .resize(48, 48)
    .png()
    .toFile(path.join(OUT_DIR, 'favicon.png'));
  console.log('✓ favicon.png (48x48)');
}

generate().catch(console.error);
