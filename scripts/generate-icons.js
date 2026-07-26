const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// UsayO 아이콘 원본(벡터). 흰 원 테두리 + 연보라 체크마크 + (분리 가능한) 보라 배경.
const SRC = path.resolve(__dirname, '../assets/usayo-icon.svg');
const OUT_DIR = path.resolve(__dirname, '../assets');
const BRAND_BG = '#534AB7'; // Voice Purple

async function generate() {
  const full = fs.readFileSync(SRC, 'utf-8');
  // 배경 rect(id="bg") 제거본 = 투명 배경 (adaptive/splash 용)
  const transparent = full.replace(/<rect id="bg"[^>]*\/>\s*/, '');

  // 1. iOS/기본 앱 아이콘 — 배경 포함, 알파 채널 제거(App Store 요건: 아이콘에 투명도 금지)
  await sharp(Buffer.from(full))
    .resize(1024, 1024)
    .flatten({ background: BRAND_BG })
    .png()
    .toFile(path.join(OUT_DIR, 'icon.png'));
  console.log('✓ icon.png (1024x1024, no alpha)');

  // 2. Android adaptive foreground — 투명 배경(앱 backgroundColor가 채움).
  //    원+체크를 중앙 세이프존(~63%)에 배치해 잘림 없이 충실히 채움.
  await sharp(Buffer.from(transparent))
    .resize(980, 980)
    .extend({ top: 22, bottom: 22, left: 22, right: 22, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_DIR, 'adaptive-icon.png'));
  console.log('✓ adaptive-icon.png (1024x1024, transparent bg, center safe-zone)');

  // 3. Splash 로고 — 투명 배경(앱 splash.backgroundColor가 채움), 중앙 로고 정사각.
  await sharp(Buffer.from(transparent))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(OUT_DIR, 'splash-icon.png'));
  console.log('✓ splash-icon.png (1024x1024, transparent bg)');

  // 4. Web favicon — 배경 포함.
  await sharp(Buffer.from(full))
    .resize(196, 196)
    .flatten({ background: BRAND_BG })
    .png()
    .toFile(path.join(OUT_DIR, 'favicon.png'));
  console.log('✓ favicon.png (196x196)');
}

generate().catch((e) => { console.error(e); process.exit(1); });
