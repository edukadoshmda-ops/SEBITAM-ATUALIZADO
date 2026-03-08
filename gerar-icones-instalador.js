// gerar-icones-instalador.js
// Gera todos os ícones do instalador Android (mipmap) e PWA a partir do logo SEBITAM
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// =========================================
// CONFIGURAÇÃO: usa logo.jpg como fonte
// =========================================
const SOURCE = path.join(__dirname, 'logo.jpg');
console.log(`📷 Fonte: ${SOURCE}`);
if (!fs.existsSync(SOURCE)) {
    console.error('❌ Arquivo logo.jpg não encontrado!');
    process.exit(1);
}

// Fundo branco (igual ao fundo do logo original)
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

// =========================================
// 1) Ícones PWA — pasta /icons
// =========================================
const ICONS_DIR = path.join(__dirname, 'icons');
if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR);

const PWA_SIZES = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

// =========================================
// 2) Ícones Android — mipmap
// =========================================
const ANDROID_BASE = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

const MIPMAP_SIZES = [
    { folder: 'mipmap-mdpi', size: 48 },
    { folder: 'mipmap-hdpi', size: 72 },
    { folder: 'mipmap-xhdpi', size: 96 },
    { folder: 'mipmap-xxhdpi', size: 144 },
    { folder: 'mipmap-xxxhdpi', size: 192 },
];

async function resizeSquare(src, outPath, size) {
    await sharp(src)
        .resize(size, size, {
            fit: 'contain',
            background: BG
        })
        .flatten({ background: BG })   // remove canal alpha, fundo branco
        .png({ quality: 100 })
        .toFile(outPath);
}

async function main() {
    console.log('\n📦 Gerando ícones PWA...');
    for (const size of PWA_SIZES) {
        const dest = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
        await resizeSquare(SOURCE, dest, size);
        console.log(`  ✅ ${size}x${size} → icons/icon-${size}x${size}.png`);
    }

    // Raiz: icon-512.png e icon-192.png (para manifest.json)
    await resizeSquare(SOURCE, path.join(__dirname, 'icon-512.png'), 512);
    console.log('  ✅ 512x512 → icon-512.png (raiz)');
    await resizeSquare(SOURCE, path.join(__dirname, 'icon-192.png'), 192);
    console.log('  ✅ 192x192 → icon-192.png (raiz)');

    // Favicons
    await resizeSquare(SOURCE, path.join(__dirname, 'favicon-32.png'), 32);
    console.log('  ✅ 32x32  → favicon-32.png');
    await resizeSquare(SOURCE, path.join(__dirname, 'favicon-16.png'), 16);
    console.log('  ✅ 16x16  → favicon-16.png');

    console.log('\n📱 Gerando ícones do instalador Android (mipmap)...');
    for (const { folder, size } of MIPMAP_SIZES) {
        const dir = path.join(ANDROID_BASE, folder);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // ic_launcher, ic_launcher_round, ic_launcher_foreground
        for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
            const dest = path.join(dir, `${name}.png`);
            await resizeSquare(SOURCE, dest, size);
        }
        console.log(`  ✅ ${size}x${size} → android/.../res/${folder}/ic_launcher*.png`);
    }

    // Também gerar splash placeholder básico (1920x1080, logo centralizado)
    console.log('\n🖼️  Gerando splash screens...');
    const SPLASH_SIZES = [
        { folder: 'drawable', w: 480, h: 800 },
        { folder: 'drawable-port-mdpi', w: 320, h: 480 },
        { folder: 'drawable-port-hdpi', w: 480, h: 800 },
        { folder: 'drawable-port-xhdpi', w: 720, h: 1280 },
        { folder: 'drawable-port-xxhdpi', w: 1080, h: 1920 },
        { folder: 'drawable-port-xxxhdpi', w: 1440, h: 2560 },
        { folder: 'drawable-land-mdpi', w: 480, h: 320 },
        { folder: 'drawable-land-hdpi', w: 800, h: 480 },
        { folder: 'drawable-land-xhdpi', w: 1280, h: 720 },
        { folder: 'drawable-land-xxhdpi', w: 1920, h: 1080 },
        { folder: 'drawable-land-xxxhdpi', w: 2560, h: 1440 },
    ];

    for (const { folder, w, h } of SPLASH_SIZES) {
        const dir = path.join(ANDROID_BASE, folder);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, 'splash.png');

        // Logo centralizado com fundo branco, logo ocupa 40% da dimensão menor
        const logoSize = Math.round(Math.min(w, h) * 0.40);
        const logoBuffer = await sharp(SOURCE)
            .resize(logoSize, logoSize, { fit: 'contain', background: BG })
            .flatten({ background: BG })
            .png()
            .toBuffer();

        await sharp({
            create: { width: w, height: h, channels: 4, background: BG }
        })
            .composite([{
                input: logoBuffer,
                gravity: 'center'
            }])
            .flatten({ background: BG })
            .png({ quality: 100 })
            .toFile(dest);

        console.log(`  ✅ ${w}x${h} → android/.../res/${folder}/splash.png`);
    }

    console.log('\n🎉 Todos os ícones e splash screens gerados com sucesso!');
    console.log('   Logo SEBITAM aplicado em todos os tamanhos do instalador.\n');
}

main().catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
});
