import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const inputDir = "./frames/verified";
const outputDir = "./frames/png";

fs.mkdirSync(outputDir, { recursive: true });

const files = fs
  .readdirSync(inputDir)
  .filter(file => /^frame-\d{6}\.svg$/.test(file))
  .sort();

console.log(`Rendering ${files.length} SVG frames...`);

for (let i = 0; i < files.length; i++) {
  const file = files[i];

  const input = path.join(inputDir, file);
  const output = path.join(
    outputDir,
    file.replace(/\.svg$/, ".png")
  );

  await sharp(input, {
    density: 144
  })
    .resize(800, 450)
    .png()
    .toFile(output);

  console.log(`[${i + 1}/${files.length}] ${output}`);
}

console.log("PNG rendering complete.");