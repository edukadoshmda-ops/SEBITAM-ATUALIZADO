const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, 'assets', 'c__Users_eduka_AppData_Roaming_Cursor_User_workspaceStorage_d6a105ce2cfc917480cc32fd3add95fd_images_IMG-20260121-WA0037__1_-removebg-preview-7ae6cc0f-f6e1-4b62-9ebc-27004116cefe.png');
const output = path.join(__dirname, 'logo-sebitam.png');
const fallbackInput = path.join(__dirname, 'logo-sebitam.png');
const fs = require('fs');

async function fixLogo() {
  const input = fallbackInput;
  const img = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = img;
  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] ?? 255;
    const isGray = Math.abs(r - g) < 25 && Math.abs(g - b) < 25;
    const isMediumGray = r > 70 && r < 170 && g > 70 && g < 170 && b > 70 && b < 170;
    if (isGray && isMediumGray && a > 50) {
      data[i + 3] = 0;
    }
  }

  await sharp(Buffer.from(data), { raw: { width, height, channels } })
    .png()
    .toFile(output);
  console.log('Logo: fundo cinza removido (transparente)');
}

fixLogo().catch(console.error);
