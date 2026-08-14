const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'build', 'wechatgame');
const maxMainPackageBytes = 4 * 1024 * 1024;

assert(fs.existsSync(root), 'build/wechatgame does not exist; build the project first.');

function directorySize(directory, excludedDirectoryName) {
    let total = 0;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name === excludedDirectoryName) {
            continue;
        }

        const entryPath = path.join(directory, entry.name);
        total += entry.isDirectory()
            ? directorySize(entryPath)
            : fs.statSync(entryPath).size;
    }

    return total;
}

const mainPackageBytes = directorySize(root, 'subpackages');
const mainPackageKiB = mainPackageBytes / 1024;
const headroomKiB = (maxMainPackageBytes - mainPackageBytes) / 1024;

assert(
    mainPackageBytes <= maxMainPackageBytes,
    `WeChat main package is ${mainPackageKiB.toFixed(2)} KiB; maximum is 4096 KiB.`,
);

console.log(
    `wechat_main_package=passed, size=${mainPackageKiB.toFixed(2)}KiB, `
    + `headroom=${headroomKiB.toFixed(2)}KiB`,
);
