const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const directories = new Map([
    ['assets/games/blade-defense/visual/backgrounds.meta', 'abfd286f-3ec4-4e27-b8d8-343629577d8f'],
    ['assets/games/blade-defense/visual/boards.meta', 'bb6c3bc3-bdca-4c69-a4f5-a9c61c93989c'],
    ['assets/games/blade-defense/visual/pets.meta', '7f174c05-2ac4-493a-9170-99670f34944c'],
    ['assets/games/blade-defense/visual/pets/puppy-l1.meta', '769d0996-3db9-470f-b8b5-1e39ed5327b0'],
    ['assets/games/blade-defense/visual/pets/kitten-l2.meta', 'b1d592da-4a8d-4eb4-a675-e0bec2eebc2d'],
    ['assets/games/blade-defense/visual/enemies.meta', '963b2dd7-de80-4ad0-9984-7e07b8f60162'],
    ['assets/games/blade-defense/visual/enemies/turnip-imp.meta', '8c36492b-f9a2-48bd-9ef2-dcb496a9da2f'],
    ['assets/games/blade-defense/visual/enemies/acorn-boar.meta', 'a48017c1-c085-4935-860a-2850aaabd24c'],
    ['assets/games/blade-defense/visual/weapons.meta', 'd28c30a4-9a57-4cee-8e01-9ef87ad19c68'],
]);

const images = new Map([
    ['assets/games/blade-defense/visual/backgrounds/bd2-spring-camp-bg-v1.png', ['19daad82-939a-49fc-bdf1-c222348e822a', false]],
    ['assets/games/blade-defense/visual/boards/bd2-spring-ring-board-v1.png', ['6eccd9ff-bf18-4694-a6dc-430946064a20', false]],
    ['assets/games/blade-defense/visual/pets/puppy-l1/01.png', ['45933147-6507-4b28-acec-0725b2755a64', true]],
    ['assets/games/blade-defense/visual/pets/puppy-l1/02.png', ['819f4509-a31c-4f57-8e70-4e6f2e4bc021', true]],
    ['assets/games/blade-defense/visual/pets/puppy-l1/03.png', ['79fbcb00-ad7b-4822-8384-13dc14cee06e', true]],
    ['assets/games/blade-defense/visual/pets/puppy-l1/04.png', ['2356309d-45da-4988-9004-92e4d184b44c', true]],
    ['assets/games/blade-defense/visual/pets/kitten-l2/01.png', ['30b886be-b60b-4f86-895c-b05904c42aa3', true]],
    ['assets/games/blade-defense/visual/pets/kitten-l2/02.png', ['161b4174-1652-432b-9c2b-2c4e91f34f30', true]],
    ['assets/games/blade-defense/visual/pets/kitten-l2/03.png', ['e6b9bb5a-c8e1-4a40-b2ac-ec3f548feef0', true]],
    ['assets/games/blade-defense/visual/pets/kitten-l2/04.png', ['895bc106-46a1-4cb8-8f37-a9f13e5cc5af', true]],
    ['assets/games/blade-defense/visual/enemies/turnip-imp/01.png', ['2adc69d7-b6be-43a4-8a2d-25a89ef14108', true]],
    ['assets/games/blade-defense/visual/enemies/turnip-imp/02.png', ['2fb566b5-786c-42d7-b74d-826a6c55df8c', true]],
    ['assets/games/blade-defense/visual/enemies/turnip-imp/03.png', ['daae5c3b-1e61-40cd-b0e4-c13b3724798e', true]],
    ['assets/games/blade-defense/visual/enemies/turnip-imp/04.png', ['9fe31923-d0d5-4182-a314-21d41fcab888', true]],
    ['assets/games/blade-defense/visual/enemies/acorn-boar/01.png', ['9998349e-3b67-4035-9914-ea23cbc4d4be', true]],
    ['assets/games/blade-defense/visual/enemies/acorn-boar/02.png', ['d18f9740-53ea-4bd8-a83e-e2cb0e1c2dea', true]],
    ['assets/games/blade-defense/visual/enemies/acorn-boar/03.png', ['de1a52a4-badc-4f37-8c31-b90fae4f21f9', true]],
    ['assets/games/blade-defense/visual/enemies/acorn-boar/04.png', ['6a8d50e7-402c-45e0-a418-79ae069300ef', true]],
    ['assets/games/blade-defense/visual/weapons/carrot-blade-v1.png', ['71578e47-9fba-4881-a795-228bf73f310a', true]],
    ['assets/games/blade-defense/visual/weapons/fish-boomerang-v1.png', ['d7690c08-6492-434d-bdd3-72ceb052f1c5', true]],
    ['assets/lobby/visual/covers/blade-defense/bd2-spring-guard-cover-v1.png', ['fa184c99-0b67-4337-93b1-9e3b3455021b', false]],
]);

const write = (relative, value) => {
    const target = path.join(root, relative);
    if (fs.existsSync(target)) return;
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

for (const [relative, uuid] of directories) {
    write(relative, {
        ver: '1.2.0', importer: 'directory', imported: true, uuid,
        files: [], subMetas: {}, userData: {},
    });
}

for (const [relative, [uuid, hasAlpha]] of images) {
    const displayName = path.basename(relative, '.png');
    write(`${relative}.meta`, {
        ver: '1.0.27',
        importer: 'image',
        imported: true,
        uuid,
        files: ['.json', '.png'],
        subMetas: {
            '6c48a': {
                importer: 'texture',
                uuid: `${uuid}@6c48a`,
                displayName,
                id: '6c48a',
                name: 'texture',
                userData: {
                    wrapModeS: 'clamp-to-edge',
                    wrapModeT: 'clamp-to-edge',
                    minfilter: 'linear',
                    magfilter: 'linear',
                    mipfilter: 'none',
                    anisotropy: 0,
                    isUuid: true,
                    imageUuidOrDatabaseUri: uuid,
                    visible: false,
                },
                ver: '1.0.22',
                imported: true,
                files: ['.json'],
                subMetas: {},
            },
        },
        userData: {
            type: 'texture',
            fixAlphaTransparencyArtifacts: false,
            hasAlpha,
            redirect: `${uuid}@6c48a`,
        },
    });
}

console.log(`bd2_asset_metas=synced, directories=${directories.size}, images=${images.size}`);
