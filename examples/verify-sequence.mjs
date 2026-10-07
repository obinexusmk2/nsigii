import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { verifyFile } from "nsigii";

const manifestPath = "./frames/manifest.json";
const manifestContainerPath = "./frames/manifest.json.nsigii";
const rawDir = "./frames/raw";

function sha256Chain(previousHash, index, bytes) {
  return crypto
    .createHash("sha256")
    .update(previousHash)
    .update(Buffer.from(String(index)))
    .update(bytes)
    .digest("hex");
}

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing manifest: ${manifestPath}`);
}

if (!fs.existsSync(manifestContainerPath)) {
  throw new Error(`Missing manifest container: ${manifestContainerPath}`);
}

const manifestVerify = verifyFile(manifestContainerPath);
if (manifestVerify.consensus !== "YES") {
  throw new Error(`Manifest NSIGII verification failed: ${manifestVerify.consensus}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

let previousHash = "GENESIS";

for (const frame of manifest.frames) {
  const framePath = path.join(rawDir, frame.filename);
  const containerPath = framePath + ".nsigii";

  if (!fs.existsSync(framePath)) {
    throw new Error(`Missing frame file: ${framePath}`);
  }

  if (!fs.existsSync(containerPath)) {
    throw new Error(`Missing NSIGII container: ${containerPath}`);
  }

  const verifyResult = verifyFile(containerPath);
  if (verifyResult.consensus !== "YES") {
    throw new Error(`Frame NSIGII verification failed: ${frame.filename}`);
  }

  if (frame.previousHash !== previousHash) {
    throw new Error(
      `Chain mismatch at ${frame.filename}: expected previousHash=${previousHash}, got ${frame.previousHash}`
    );
  }

  const bytes = fs.readFileSync(framePath);
  const computedHash = sha256Chain(previousHash, frame.index, bytes);

  if (computedHash !== frame.frameHash) {
    throw new Error(
      `Hash mismatch at ${frame.filename}: expected ${frame.frameHash}, got ${computedHash}`
    );
  }

  previousHash = computedHash;
}

if (previousHash !== manifest.finalHash) {
  throw new Error(
    `Final hash mismatch: expected ${manifest.finalHash}, got ${previousHash}`
  );
}

console.log("Sequence verification PASSED");
console.log(`Final sequence hash: ${previousHash}`);