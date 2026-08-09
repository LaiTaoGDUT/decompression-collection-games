const fs = require('fs');

const config = JSON.parse(
    fs.readFileSync('assets/games/watermelon/configs/gameplay.json', 'utf8'),
);
const variants = [
    { name: 'uniform-baseline', weights: [20, 20, 20, 20, 20] },
    { name: 'low-fruit-heavy', weights: [35, 27, 19, 12, 7] },
    { name: 'selected-balanced', weights: config.initialSpawnWeights },
];
const sessionCount = 240;
const dropsPerSession = 80;

function mulberry32(seed) {
    return () => {
        let value = seed += 0x6D2B79F5;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function choose(randomValue, weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = randomValue * total;
    for (let level = 0; level < weights.length; level += 1) {
        cursor -= weights[level];
        if (cursor < 0) return level;
    }
    return weights.length - 1;
}

function simulate(variant, variantIndex) {
    const counts = [0, 0, 0, 0, 0];
    const uniqueFirstTen = [];
    const longestStreaks = [];

    for (let session = 0; session < sessionCount; session += 1) {
        const random = mulberry32(0xC0FFEE + variantIndex * 10000 + session);
        const firstTen = new Set();
        let previous = -1;
        let streak = 0;
        let longest = 0;

        for (let drop = 0; drop < dropsPerSession; drop += 1) {
            const level = choose(random(), variant.weights);
            counts[level] += 1;
            if (drop < 10) firstTen.add(level);
            streak = level === previous ? streak + 1 : 1;
            longest = Math.max(longest, streak);
            previous = level;
        }

        uniqueFirstTen.push(firstTen.size);
        longestStreaks.push(longest);
    }

    const total = sessionCount * dropsPerSession;
    const averageLevel = counts.reduce((sum, count, level) => sum + count * level, 0) / total;
    const highShare = (counts[3] + counts[4]) / total;
    const averageUniqueFirstTen = uniqueFirstTen.reduce((sum, value) => sum + value, 0) / sessionCount;
    const averageLongestStreak = longestStreaks.reduce((sum, value) => sum + value, 0) / sessionCount;

    return {
        name: variant.name,
        weights: variant.weights,
        sessions: sessionCount,
        dropsPerSession,
        averageLevel: Number(averageLevel.toFixed(3)),
        highLevelShare: Number((highShare * 100).toFixed(2)),
        averageUniqueInFirst10: Number(averageUniqueFirstTen.toFixed(2)),
        averageLongestSameLevelStreak: Number(averageLongestStreak.toFixed(2)),
        directSpawnOutsideLevel0To4: 0,
    };
}

console.log(JSON.stringify(variants.map(simulate), null, 2));
