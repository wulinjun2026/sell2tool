const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'icons');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#07C160"/>
  <rect x="72" y="188" width="368" height="188" rx="28" fill="#FFFFFF"/>
  <rect x="112" y="228" width="120" height="88" rx="12" fill="#07C160" opacity="0.25"/>
  <circle cx="168" cy="332" r="28" fill="#05A050"/>
  <circle cx="344" cy="332" r="28" fill="#05A050"/>
  <path d="M256 120 L196 188 H316 Z" fill="#FFFFFF"/>
  <text x="256" y="156" text-anchor="middle" font-size="42" font-family="Arial,sans-serif" fill="#07C160" font-weight="700">车</text>
</svg>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const buf = Buffer.from(svg);
  await sharp(buf).resize(192, 192).png().toFile(path.join(OUT, 'icon-192.png'));
  await sharp(buf).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
  console.log('✓ PWA icons generated in public/icons/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
