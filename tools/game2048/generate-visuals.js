const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sourceRoot = path.resolve('art_sources/game2048/t48-neon-v1');
const runtimeRoot = path.resolve('assets/lobby/visual/covers/game2048');
fs.mkdirSync(sourceRoot, { recursive: true });
fs.mkdirSync(runtimeRoot, { recursive: true });

const tiles = [
    ['2', '#1A3C4F'], ['4', '#19525B'], ['8', '#1F7772'], ['16', '#239982'],
    ['32', '#2AB990'], ['64', '#36DC9F'], ['128', '#7FC056'], ['256', '#C4C249'],
    ['512', '#EBAC3E'], ['1024', '#F68441'], ['2048', '#FFBE49'], ['', '#1B283A'],
];

const tileSvg = tiles.map(([value, fill], index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = 228 + column * 123;
    const y = 224 + row * 105;
    const fontSize = value.length <= 2 ? 38 : value.length === 3 ? 31 : 25;
    return `<g>
      <rect x="${x - 4}" y="${y - 4}" width="108" height="88" rx="18" fill="${fill}" opacity="0.26" filter="url(#glow)"/>
      <rect x="${x}" y="${y}" width="100" height="80" rx="16" fill="${fill}" stroke="${value === '2048' ? '#F8FFFF' : '#70F3DC'}" stroke-opacity="0.72" stroke-width="2"/>
      <text x="${x + 50}" y="${y + 52}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${Number(value) >= 512 ? '#07101A' : '#F0FCFF'}">${value}</text>
    </g>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="690" viewBox="0 0 920 690">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050915"/><stop offset="0.55" stop-color="#0B1323"/><stop offset="1" stop-color="#111A2B"/>
    </linearGradient>
    <radialGradient id="cyanHalo"><stop offset="0" stop-color="#34E0C7" stop-opacity="0.24"/><stop offset="1" stop-color="#34E0C7" stop-opacity="0"/></radialGradient>
    <radialGradient id="amberHalo"><stop offset="0" stop-color="#FFBE49" stop-opacity="0.2"/><stop offset="1" stop-color="#FFBE49" stop-opacity="0"/></radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="8"/></filter>
  </defs>
  <rect width="920" height="690" fill="url(#bg)"/>
  <circle cx="90" cy="92" r="280" fill="url(#cyanHalo)"/><circle cx="860" cy="620" r="300" fill="url(#amberHalo)"/>
  <g stroke="#2A5B71" stroke-width="2" opacity="0.33">
    <path d="M0 92 H144 V160 H205"/><path d="M920 116 H780 V172 H696"/>
    <path d="M0 594 H145 V532 H202"/><path d="M920 548 H782 V488 H710"/>
    <circle cx="144" cy="92" r="6" fill="#34E0C7"/><circle cx="780" cy="116" r="6" fill="#FFBE49"/>
  </g>
  <text x="460" y="86" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="7" fill="#34E0C7">DIGITAL MERGE CIRCUIT</text>
  <text x="460" y="162" text-anchor="middle" font-family="Arial, sans-serif" font-size="70" font-weight="900" letter-spacing="4" fill="#F0F8FF">NEON 2048</text>
  <rect x="198" y="196" width="524" height="354" rx="34" fill="#0F182A" stroke="#34E0C7" stroke-opacity="0.55" stroke-width="3"/>
  ${tileSvg}
  <text x="460" y="618" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" letter-spacing="4" fill="#8BA4BC">SWIPE · MERGE · LIGHT THE GRID</text>
</svg>`;

const source = path.join(sourceRoot, 't48-neon-cover-v1.svg');
const runtime = path.join(runtimeRoot, 't48-neon-cover-v1.png');
fs.writeFileSync(source, svg);
sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(runtime)
    .then(() => console.log(`game2048_cover=${runtime}, size=920x690`));
