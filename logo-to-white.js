const sharp = require('sharp');
const path = require('path');

const input = path.join(__dirname, 'logo-sebitam.png');
const output = path.join(__dirname, 'logo-sebitam.png');

async function logoToWhite() {
  const img = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = img;
  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] ?? 255;
    const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
    
    // Fundo escuro -> transparente
    if (luminance < 80 && a > 100) {
      data[i + 3] = 0;
    } else if (a > 30) {
      // Resto -> branco
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a > 150 ? 255 : Math.round(a * 1.5);
    }
  }

  await sharp(Buffer.from(data), { raw: { width, height, channels } })
    .png()
    .toFile(output);
  console.log('Logo convertida para branco (PNG)');
}

logoToWhite().catch(console.error);
