const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputImage = 'logo-sebitam.png';
const outputDir = 'icons';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const sizes = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
const bgColor = '#f5f5f5'; // Cinza claro, discreto e elegante

async function generateIcons() {
    try {
        for (const size of sizes) {
            // Redimensiona a imagem para ocupar 80% do espaço (para dar uma margem elegante)
            const innerSize = Math.round(size * 0.8);
            const resizedBuffer = await sharp(inputImage)
                .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .toBuffer();

            await sharp({
                create: {
                    width: size,
                    height: size,
                    channels: 4,
                    background: bgColor
                }
            })
                .composite([{ input: resizedBuffer, gravity: 'center' }])
                .png()
                .toFile(path.join(outputDir, `icon-${size}x${size}.png`));

            console.log(`Gerado: icon-${size}x${size}.png`);
        }

        // Ícones "maskable" para Android (usados também na raiz)
        for (const size of [192, 512]) {
            const innerSize = Math.round(size * 0.7); // Mais espaço na borda por causa do maskable
            const resizedBuffer = await sharp(inputImage)
                .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .toBuffer();

            await sharp({
                create: {
                    width: size,
                    height: size,
                    channels: 4,
                    background: bgColor
                }
            })
                .composite([{ input: resizedBuffer, gravity: 'center' }])
                .png()
                .toFile(path.join(__dirname, size === 192 ? 'icon-192.png' : 'icon-512.png'));

            console.log(`Gerado maskable: icon-${size}.png`);
        }

        console.log('✨ Todos os ícones do instalador PWA foram gerados com um fundo cinza claro e elegante!');
    } catch (e) {
        console.error('Erro ao gerar ícones:', e);
    }
}

generateIcons();
