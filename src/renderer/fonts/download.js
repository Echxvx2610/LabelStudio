import fs from 'fs';
import path from 'path';

async function downloadFonts() {
  const fontsDir = path.join('src', 'renderer', 'fonts');
  if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

  const families = [
    { name: 'Inter', weight: 400, file: 'inter-400.woff2' },
    { name: 'Inter', weight: 700, file: 'inter-700.woff2' },
    { name: 'Roboto', weight: 400, file: 'roboto-400.woff2' },
    { name: 'Roboto', weight: 700, file: 'roboto-700.woff2' },
    { name: 'Roboto Mono', weight: 400, file: 'roboto-mono-400.woff2' },
    { name: 'Roboto Mono', weight: 700, file: 'roboto-mono-700.woff2' }
  ];

  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' }
  })).text();

  const blocks = css.split('@font-face').slice(1);
  let localCss = '/* Fuentes locales empaquetadas para impresion identica offline */\n\n';

  for (const block of blocks) {
    const familyMatch = block.match(/font-family:\s*['"]([^'"]+)['"]/);
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const urlMatch = block.match(/src:\s*url\((https:[^)]+)\)/);

    if (familyMatch && weightMatch && urlMatch) {
      const family = familyMatch[1];
      const weight = parseInt(weightMatch[1], 10);
      const url = urlMatch[1];

      const target = families.find(f => f.name === family && f.weight === weight);
      if (target) {
        const destPath = path.join(fontsDir, target.file);
        if (!fs.existsSync(destPath)) {
          console.log(`Downloading ${target.file} from ${url}`);
          const buf = await (await fetch(url)).arrayBuffer();
          fs.writeFileSync(destPath, Buffer.from(buf));
        }
        localCss += `@font-face {\n  font-family: "${family}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("../fonts/${target.file}") format("woff2");\n}\n\n`;
      }
    }
  }

  fs.writeFileSync(path.join('src', 'renderer', 'styles', 'fonts.css'), localCss);
  console.log('Fonts downloaded and fonts.css created successfully!');
}

downloadFonts();

