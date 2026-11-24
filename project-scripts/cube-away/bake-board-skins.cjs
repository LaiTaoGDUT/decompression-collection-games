'use strict';

// Bake the approved isometric paintings into the top, underside and continuous
// wall regions read by mint-flat.effect. Run Tinify on the resulting JPEGs.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [sourceDir, outputDir] = process.argv.slice(2);
if (!sourceDir || !outputDir) throw new Error('Usage: node bake-board-skins.cjs <approved-art-directory> <output-directory>');
const themes = { coast: '贝壳海岸', meadow: '春日草甸', snow: '冬日雪原', windmill: '风车小镇', maple: '秋日枫谷' };
const size = 1024, half = size / 2, gutter = 2;

function decode(file, width, height) {
    return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${width}:${height}:flags=lanczos`,
        '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: width * height * 4 });
}

// Points in the clean left-hand cube of the approved 1536 x 1024 layouts,
// just inside its rounded silhouette. Adjacent panels share the same corners.
const left = [72, 245], back = [409, 98], right = [722, 249], front = [379, 410];
const lowerLeft = [72, 695], lowerFront = [379, 859], lowerRight = [722, 696];
const top = [left, back, front, right];
const west = [left, front, lowerLeft, lowerFront];
const east = [front, right, lowerFront, lowerRight];

function copyPlanePixel(source, corners, u, v, output, offset) {
    const [a, b, c, d] = corners;
    const x = (a[0]+(b[0]-a[0])*u)*(1-v) + (c[0]+(d[0]-c[0])*u)*v;
    const y = (a[1]+(b[1]-a[1])*u)*(1-v) + (c[1]+(d[1]-c[1])*u)*v;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x-ix, fy = y-iy;
    const i = 3*(iy*1536 + ix), j = i + 1536*3;
    for (let channel = 0; channel < 3; channel++) {
        const p = i+channel, q = j+channel;
        output[offset+channel] = Math.round((source[p]*(1-fx) + source[p+3]*fx)*(1-fy)
            + (source[q]*(1-fx) + source[q+3]*fx)*fy);
    }
}

const coord = (pixel, width) => Math.max(0, Math.min(1, (pixel-gutter)/(width-1-2*gutter)));
for (const [id, name] of Object.entries(themes)) {
    const art = decode(path.join(sourceDir, name+'.png'), 1536, 1024);
    const inner = half-2*gutter;
    const underside = decode(path.join(sourceDir, '底面', id+'.png'), inner, inner);
    const pixels = Buffer.alloc(size*size*3);
    for (let y = 0; y < size; y++) {
        const v = coord(y % half, half);
        for (let x = 0; x < size; x++) {
            const dst = (y*size+x)*3;
            if (y >= half) {
                const u = coord(x, size)*2;
                copyPlanePixel(art, u < 1 ? west : east, u < 1 ? u : u-1, v, pixels, dst);
            } else if (x < half) {
                copyPlanePixel(art, top, coord(x, half), v, pixels, dst);
            } else {
                const src = 3*(Math.round(v*(inner-1))*inner + Math.round(coord(x-half, half)*(inner-1)));
                pixels[dst] = underside[src]; pixels[dst+1] = underside[src+1]; pixels[dst+2] = underside[src+2];
            }
        }
    }
    const directory = path.join(outputDir, id);
    fs.mkdirSync(directory, { recursive: true });
    const ppm = Buffer.concat([Buffer.from(`P6\n${size} ${size}\n255\n`), pixels]);
    execFileSync('cjpeg', ['-quality', '92', '-optimize', '-sample', '1x1', '-outfile', path.join(directory, 'surface.jpg')], { input: ppm });
}
