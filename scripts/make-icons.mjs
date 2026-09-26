// Generates the Xbox tile and splash images from one vector mark.
import sharp from 'sharp';
import path from 'node:path';
const out = path.resolve(import.meta.dirname, '../native/Attract/Assets');
const BG = '#141218', FG = '#E6E0E9';
const mark = (w, h, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${BG}"/>
<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Roboto, DejaVu Sans, sans-serif" font-weight="700" font-size="${size}" fill="${FG}">Attract</text></svg>`;
const square = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><rect width="100%" height="100%" rx="${s * 0.12}" fill="${BG}"/>
<text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-family="Roboto, DejaVu Sans, sans-serif" font-weight="700" font-size="${s * 0.62}" fill="${FG}">A</text></svg>`;
const jobs = [
  ['Square150x150Logo.png', square(150)], ['Square44x44Logo.png', square(44)], ['StoreLogo.png', square(50)],
  ['Wide310x150Logo.png', mark(310, 150, 46)], ['SplashScreen.png', mark(620, 300, 88)],
];
for (const [name, svg] of jobs) await sharp(Buffer.from(svg)).png().toFile(path.join(out, name));
console.log('Icons written.');
