// generate-icons.js — Gera todos os ícones PWA do SEBITAM
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SOURCE = path.join(__dirname, 'logo.jpg');
const DEST = path.join(__dirname, 'icons');

// Tamanhos exigidos pelo PWA (Android, iOS, Chrome, Windows)
const SIZES = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

if (!fs.existsSync(DEST)) fs.mkdirSync(DEST);

// Também copiar o ícone gerado por IA (512px premium) se disponível
const AI_ICON = path.join(
    'C:\\Users\\eduka\\.gemini\\antigravity\\brain\\c9bad48b-ff4c-4c19-a250-b3ea059b0816',
    'sebitam_icon_512_1772992091620.png'
);

const sourceFile = fs.existsSync(AI_ICON) ? AI_ICON : SOURCE;
console.log(`📷 Usando fonte: ${sourceFile}`);

async function generate() {
    for (const size of SIZES) {
        const dest = path.join(DEST, `icon-${size}x${size}.png`);
        await sharp(sourceFile)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 15, g: 23, b: 42, alpha: 1 } // #0f172a
            })
            .png({ quality: 100 })
            .toFile(dest);
        console.log(`  ✅ ${size}x${size} → icons/icon-${size}x${size}.png`);
    }

    // Gerar também favicon 32x32 e 16x16 na raiz
    await sharp(sourceFile)
        .resize(32, 32, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
        .png()
        .toFile(path.join(__dirname, 'favicon-32.png'));

    await sharp(sourceFile)
        .resize(16, 16, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
        .png()
        .toFile(path.join(__dirname, 'favicon-16.png'));

    // Cópia do ícone principal 512 na raiz para uso direto
    await sharp(sourceFile)
        .resize(512, 512, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
        .png()
        .toFile(path.join(__dirname, 'icon-512.png'));

    await sharp(sourceFile)
        .resize(192, 192, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
        .png()
        .toFile(path.join(__dirname, 'icon-192.png'));

    console.log('\n🎉 Todos os ícones gerados com sucesso!');
}

generate().catch(err => { console.error('❌ Erro:', err); process.exit(1); });
