const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sourceRoot = path.resolve('art_sources/watermelon/w1-paper-v1');
const fruitRoot = path.resolve('assets/games/watermelon/visual/fruits');
const backgroundRoot = path.resolve('assets/games/watermelon/visual/backgrounds');
const lobbyCoverRoot = path.resolve('assets/lobby/visual/covers/watermelon');
fs.mkdirSync(sourceRoot, { recursive: true });
fs.mkdirSync(fruitRoot, { recursive: true });
fs.mkdirSync(backgroundRoot, { recursive: true });
fs.mkdirSync(lobbyCoverRoot, { recursive: true });

const fruits = [
    { id: 'cherry', main: '#E84A4F', dark: '#B72F3B', light: '#FF7771', kind: 'cherry' },
    { id: 'strawberry', main: '#F35E65', dark: '#C83B4A', light: '#FF8B82', kind: 'strawberry' },
    { id: 'grape', main: '#7F5BC5', dark: '#59409A', light: '#A887E0', kind: 'grape' },
    { id: 'dekopon', main: '#F39A38', dark: '#D46B24', light: '#FFC15D', kind: 'dekopon' },
    { id: 'orange', main: '#F6A82E', dark: '#D77A21', light: '#FFCB58', kind: 'orange' },
    { id: 'apple', main: '#D94A43', dark: '#A93436', light: '#F47862', kind: 'apple' },
    { id: 'pear', main: '#B8CD55', dark: '#779C3B', light: '#DCE77C', kind: 'pear' },
    { id: 'peach', main: '#F38F94', dark: '#D45D71', light: '#FFBBB0', kind: 'peach' },
    { id: 'pineapple', main: '#E2AE38', dark: '#B97728', light: '#F9D463', kind: 'pineapple' },
    { id: 'melon', main: '#A8CF7B', dark: '#6EA059', light: '#D6E5A2', kind: 'melon' },
    { id: 'watermelon', main: '#4C9B55', dark: '#276B42', light: '#75BD68', kind: 'watermelon' },
];

function commonDefs(id, shape) {
    return `<defs>
      <clipPath id="clip-${id}">${shape}</clipPath>
      <filter id="shadow-${id}" x="-20%" y="-20%" width="150%" height="150%">
        <feDropShadow dx="10" dy="12" stdDeviation="8" flood-color="#4B2B20" flood-opacity="0.22"/>
      </filter>
      <pattern id="fiber-${id}" width="18" height="18" patternUnits="userSpaceOnUse">
        <path d="M1 4 L8 3 M11 13 L17 12" stroke="#FFF9E9" stroke-opacity="0.18" stroke-width="2"/>
      </pattern>
    </defs>`;
}

function bodyFor(fruit) {
    const outline = '#4B2B20';
    const leaf = '#287A4E';
    const leafLight = '#63B879';
    const circle = '<circle cx="256" cy="270" r="210"/>';
    let shape = circle;
    let details = '';

    if (fruit.kind === 'cherry') {
        shape = '<path d="M80 310 C80 205 165 152 246 218 C318 153 432 196 432 310 C432 406 356 465 258 428 C154 470 80 406 80 310 Z"/>';
        details = `<path d="M170 218 Q202 94 260 80 Q300 124 338 208" fill="none" stroke="${outline}" stroke-width="16" stroke-linecap="round"/>
          <path d="M250 83 Q318 42 364 94 Q314 122 250 83" fill="${leaf}" stroke="${outline}" stroke-width="9"/>`;
    } else if (fruit.kind === 'strawberry') {
        shape = '<path d="M256 466 C190 414 95 317 112 204 C125 116 210 112 256 165 C302 112 387 116 400 204 C417 317 322 414 256 466 Z"/>';
        details = `<path d="M150 171 L201 103 L256 151 L311 103 L362 171 L306 187 L256 164 L206 187 Z" fill="${leaf}" stroke="${outline}" stroke-width="9"/>
          ${[[178,247],[256,225],[330,252],[210,320],[298,322],[254,388]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="7" ry="12" fill="#FFE2A8" transform="rotate(-12 ${x} ${y})"/>`).join('')}`;
    } else if (fruit.kind === 'grape') {
        shape = '<path d="M256 468 C181 431 98 346 116 223 C126 150 188 104 256 142 C324 104 386 150 396 223 C414 346 331 431 256 468 Z"/>';
        details = `${[[201,206],[263,190],[322,220],[170,272],[238,264],[310,280],[205,337],[274,337],[250,407]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="58" fill="${i%3===0?fruit.light:i%3===1?fruit.main:fruit.dark}" stroke="${outline}" stroke-width="7"/>`).join('')}
          <path d="M252 143 Q266 75 332 62 Q323 129 252 143" fill="${leaf}" stroke="${outline}" stroke-width="9"/>`;
    } else if (fruit.kind === 'dekopon') {
        shape = '<path d="M256 468 C128 468 65 376 79 257 C88 174 153 106 221 104 Q225 62 256 51 Q287 62 291 104 C359 106 424 174 433 257 C447 376 384 468 256 468 Z"/>';
        details = `<path d="M226 107 Q266 70 317 112 Q271 139 226 107" fill="${leaf}" stroke="${outline}" stroke-width="9"/>`;
    } else if (fruit.kind === 'apple') {
        shape = '<path d="M256 156 C201 103 116 137 90 235 C54 371 148 465 256 445 C364 465 458 371 422 235 C396 137 311 103 256 156 Z"/>';
        details = `<path d="M257 151 Q246 84 275 53" fill="none" stroke="${outline}" stroke-width="17" stroke-linecap="round"/>
          <path d="M274 78 Q345 57 361 117 Q309 132 274 78" fill="${leaf}" stroke="${outline}" stroke-width="9"/>`;
    } else if (fruit.kind === 'pear') {
        shape = '<path d="M256 70 C214 70 208 144 201 190 C145 222 102 286 104 357 C108 446 179 474 256 474 C333 474 404 446 408 357 C410 286 367 222 311 190 C304 144 298 70 256 70 Z"/>';
        details = `<path d="M259 83 Q261 49 281 31" fill="none" stroke="${outline}" stroke-width="16" stroke-linecap="round"/>
          <path d="M281 54 Q347 48 352 104 Q307 113 281 54" fill="${leaf}" stroke="${outline}" stroke-width="9"/>`;
    } else if (fruit.kind === 'peach') {
        shape = '<path d="M256 466 C126 452 67 349 89 241 C108 148 192 112 256 167 C320 112 404 148 423 241 C445 349 386 452 256 466 Z"/>';
        details = `<path d="M257 168 Q275 116 337 95 Q332 157 257 168" fill="${leaf}" stroke="${outline}" stroke-width="9"/>
          <path d="M257 184 Q216 279 254 443" fill="none" stroke="${outline}" stroke-opacity="0.38" stroke-width="12"/>`;
    } else if (fruit.kind === 'pineapple') {
        shape = '<path d="M256 128 C156 128 105 205 111 320 C116 422 178 468 256 468 C334 468 396 422 401 320 C407 205 356 128 256 128 Z"/>';
        details = `<path d="M256 149 L205 54 L251 96 L270 29 L285 99 L344 53 L310 151 Z" fill="${leaf}" stroke="${outline}" stroke-width="9" stroke-linejoin="round"/>
          <g stroke="${outline}" stroke-opacity="0.34" stroke-width="8">
            <path d="M145 239 L350 423 M126 322 L278 458 M198 154 L391 327"/>
            <path d="M367 206 L154 410 M395 286 L224 458 M306 151 L119 329"/>
          </g>`;
    } else if (fruit.kind === 'melon') {
        details = `<g fill="none" stroke="#FFF2D6" stroke-opacity="0.52" stroke-width="8" clip-path="url(#clip-${fruit.id})">
          <path d="M90 160 Q256 270 422 160 M64 255 Q256 360 448 255 M82 356 Q256 430 430 356"/>
          <path d="M147 82 Q226 270 147 454 M256 58 Q256 270 256 480 M365 82 Q286 270 365 454"/>
        </g>`;
    } else if (fruit.kind === 'watermelon') {
        details = `<g fill="none" stroke="${fruit.dark}" stroke-width="22" stroke-linecap="round" clip-path="url(#clip-${fruit.id})">
          <path d="M126 112 Q211 270 126 428 M210 66 Q289 270 210 474 M302 65 Q223 270 302 475 M386 112 Q301 270 386 428"/>
        </g>
        <circle cx="256" cy="270" r="210" fill="none" stroke="${outline}" stroke-width="18"/>`;
    } else {
        details = `<circle cx="256" cy="270" r="8" fill="${outline}" opacity="0.28"/>`;
    }

    const defs = commonDefs(fruit.id, shape);
    const base = `<g filter="url(#shadow-${fruit.id})">
      <g fill="${fruit.main}" stroke="${outline}" stroke-width="11" stroke-linejoin="round">${shape}</g>
      <g clip-path="url(#clip-${fruit.id})">
        <path d="M38 92 L303 52 L221 492 L48 425 Z" fill="${fruit.light}" opacity="0.78"/>
        <path d="M303 52 L476 126 L452 440 L221 492 Z" fill="${fruit.dark}" opacity="0.68"/>
        <path d="M38 92 L476 126 L221 492 Z" fill="url(#fiber-${fruit.id})"/>
        <path d="M303 52 L221 492" stroke="${outline}" stroke-opacity="0.22" stroke-width="6"/>
      </g>
      ${details}
    </g>`;
    return { defs, base };
}

function fruitSvg(fruit) {
    const { defs, base } = bodyFor(fruit);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${defs}${base}</svg>`;
}

function backgroundSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="1334" viewBox="0 0 750 1334">
      <defs>
        <pattern id="paper" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M2 7 L14 5 M18 22 L28 20" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="2"/></pattern>
        <filter id="soft"><feGaussianBlur stdDeviation="10"/></filter>
      </defs>
      <rect width="750" height="1334" fill="#C9E8D5"/>
      <path d="M0 245 L750 178 L750 1334 L0 1334 Z" fill="#FFF2D6"/>
      <path d="M0 0 H750 V122 L688 192 L624 122 L562 192 L500 122 L438 192 L375 122 L312 192 L250 122 L188 192 L125 122 L62 192 L0 122 Z" fill="#F9C74F"/>
      <path d="M0 0 H750 V68 L0 137 Z" fill="#F28B66" opacity="0.85"/>
      <path d="M0 245 L750 178" stroke="#4B2B20" stroke-opacity="0.12" stroke-width="6"/>
      <g fill="#287A4E" opacity="0.11" filter="url(#soft)">
        <ellipse cx="-20" cy="420" rx="135" ry="58" transform="rotate(-28 -20 420)"/>
        <ellipse cx="735" cy="525" rx="128" ry="52" transform="rotate(31 735 525)"/>
        <ellipse cx="20" cy="1100" rx="110" ry="46" transform="rotate(25 20 1100)"/>
        <ellipse cx="760" cy="1180" rx="120" ry="48" transform="rotate(-32 760 1180)"/>
      </g>
      <rect width="750" height="1334" fill="url(#paper)"/>
    </svg>`;
}

function lobbyCoverSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="690" viewBox="0 0 920 690">
      <defs>
        <pattern id="paper" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M2 6 L10 5 M13 17 L21 16" stroke="#FFF" stroke-opacity=".16" stroke-width="2"/>
        </pattern>
        <filter id="drop" x="-30%" y="-30%" width="170%" height="180%">
          <feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="#4B2B20" flood-opacity=".18"/>
        </filter>
      </defs>
      <rect width="920" height="690" rx="42" fill="#FFF0CF"/>
      <path d="M0 0 H920 V170 L715 122 L588 210 L405 108 L220 190 L0 112 Z" fill="#F28B66"/>
      <path d="M0 0 H920 V72 L716 122 L588 55 L405 108 L220 48 L0 112 Z" fill="#F9C74F"/>
      <path d="M0 540 L210 425 L352 510 L535 405 L715 510 L920 395 V690 H0 Z" fill="#C9E8D5"/>
      <path d="M0 600 L210 425 L352 510 L535 405 L715 510 L920 455 V690 H0 Z" fill="#9ACBAA" opacity=".58"/>
      <ellipse cx="470" cy="535" rx="345" ry="76" fill="#4B2B20" opacity=".12"/>
      <circle cx="462" cy="330" r="260" fill="#FFF7E4" stroke="#4B2B20" stroke-opacity=".14" stroke-width="6" filter="url(#drop)"/>
      <path d="M462 70 V590 M202 330 H722 M278 146 L646 514 M646 146 L278 514" stroke="#D7A95D" stroke-opacity=".18" stroke-width="4" stroke-dasharray="13 12"/>
      <g fill="#FFF7E4" stroke="#4B2B20" stroke-width="5" stroke-linejoin="round">
        <path d="M73 242 L122 216 L150 266 L96 279 Z"/>
        <path d="M770 184 L833 156 L854 221 L794 230 Z"/>
        <path d="M100 468 L155 439 L178 493 L120 510 Z"/>
        <path d="M784 474 L840 441 L868 498 L810 516 Z"/>
      </g>
      <rect width="920" height="690" rx="42" fill="url(#paper)"/>
    </svg>`;
}

(async () => {
    for (let level = 0; level < fruits.length; level += 1) {
        const fruit = fruits[level];
        const prefix = `fruit-${String(level).padStart(2, '0')}-${fruit.id}-w1-v1`;
        const svg = fruitSvg(fruit);
        fs.writeFileSync(path.join(sourceRoot, `${prefix}.svg`), svg);
        const trimmed = await sharp(Buffer.from(svg))
            .png()
            .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
            .toBuffer();
        const trimmedMetadata = await sharp(trimmed).metadata();
        const scale = Math.min(
            488 / (trimmedMetadata.width ?? 512),
            488 / (trimmedMetadata.height ?? 512),
        );
        const fittedWidth = Math.max(1, Math.round((trimmedMetadata.width ?? 512) * scale));
        const fittedHeight = Math.max(1, Math.round((trimmedMetadata.height ?? 512) * scale));
        const left = Math.floor((512 - fittedWidth) / 2);
        const top = Math.floor((512 - fittedHeight) / 2);
        await sharp(trimmed)
            .resize(fittedWidth, fittedHeight)
            .extend({
                top,
                bottom: 512 - fittedHeight - top,
                left,
                right: 512 - fittedWidth - left,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png({ compressionLevel: 9 })
            .toFile(path.join(fruitRoot, `${prefix}.png`));
    }

    const background = backgroundSvg();
    fs.writeFileSync(path.join(sourceRoot, 'w1-paper-fruit-stand-bg-v1.svg'), background);
    await sharp(Buffer.from(background)).jpeg({ quality: 88, progressive: true }).toFile(
        path.join(backgroundRoot, 'w1-paper-fruit-stand-bg-v1.jpg'),
    );
    const coverLayers = [
        { level: 10, width: 338, left: 291, top: 52, rotate: -2 },
        { level: 8, width: 238, left: 160, top: 260, rotate: -8 },
        { level: 9, width: 258, left: 535, top: 254, rotate: 7 },
        { level: 5, width: 186, left: 330, top: 357, rotate: -5 },
        { level: 2, width: 174, left: 466, top: 376, rotate: 6 },
        { level: 0, width: 126, left: 238, top: 424, rotate: -7 },
        { level: 1, width: 128, left: 604, top: 424, rotate: 8 },
    ];
    const coverFruitLayers = await Promise.all(coverLayers.map(async (layer) => {
        const fruit = fruits[layer.level];
        const file = path.join(
            fruitRoot,
            `fruit-${String(layer.level).padStart(2, '0')}-${fruit.id}-w1-v1.png`,
        );
        return {
            input: await sharp(file)
                .resize({ width: layer.width })
                .rotate(layer.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer(),
            left: layer.left,
            top: layer.top,
        };
    }));
    const coverBase = lobbyCoverSvg();
    fs.writeFileSync(path.join(sourceRoot, 'w1-watermelon-cover-v2.svg'), coverBase);
    await sharp(Buffer.from(coverBase))
        .composite(coverFruitLayers)
        .jpeg({ quality: 91, progressive: true })
        .toFile(path.join(lobbyCoverRoot, 'w1-watermelon-cover-v1.jpg'));
    const contactCells = await Promise.all(fruits.map(async (fruit, level) => ({
        input: await sharp(path.join(
            fruitRoot,
            `fruit-${String(level).padStart(2, '0')}-${fruit.id}-w1-v1.png`,
        )).resize(220, 220).png().toBuffer(),
        left: (level % 4) * 230 + 5,
        top: Math.floor(level / 4) * 230 + 5,
    })));
    fs.mkdirSync(path.resolve('temp'), { recursive: true });
    await sharp({
        create: { width: 920, height: 690, channels: 4, background: '#F4E7CC' },
    }).composite(contactCells).png().toFile(path.resolve('temp/step20-fruit-contact.png'));
    console.log(`generated_fruits=${fruits.length}, background=750x1334, cover=920x690, source=${sourceRoot}`);
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
