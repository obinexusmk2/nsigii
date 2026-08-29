#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { openSync, readSync, closeSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { wrapFile } from "./core/wrap.js";
import { inspectFile } from "./core/inspect.js";
import { verifyFile } from "./core/verify.js";
import { extractFile } from "./core/extract.js";
import { linkArtifacts, resolveTopology } from "./core/link.js";
import { detectNsigiiVariant } from "./core/variant.js";
import { detectNsigiiKind, describeNsigiiKind, NSIGII_KIND } from "./format/dispatch.js";
import { inspectCodecFile, verifyCodecFile } from "./core/codec.js";

const program = new Command();

program
  .name("nsigii")
  .description("NSIGII — Linkable Then Executable Runtime\nOBINexus Constitutional Verification System")
  .version("0.1.0");

program
  .command("wrap <file>")
  .description("Wrap any file into a NSIGII constitutional container")
  .option("-o, --output <path>", "output path")
  .option("-f, --format <hint>", "format hint")
  .action(async (file: string, opts: { output?: string; format?: string }) => {
    const spinner = ora("Wrapping payload into NSIGII container...").start();
    try {
      const out = wrapFile(file, { formatHint: opts.format as any, originalFilename: basename(file), outputPath: opts.output });
      spinner.succeed(chalk.green(`Wrapped → ${out}`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Wrap failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("dispatch <file>")
  .description("Identify which of the three NSIGII layouts a file is — read-only, never executes")
  .action((file: string) => {
    let head: Buffer;
    let size: number;
    try {
      const path = resolve(file);
      size = statSync(path).size;
      const fd = openSync(path, "r");
      try {
        head = Buffer.alloc(16);
        const n = readSync(fd, head, 0, 16, 0);
        head = head.subarray(0, n);
      } finally {
        closeSync(fd);
      }
    } catch (err: any) {
      console.error(chalk.red(`Dispatch failed: ${err.message}`));
      process.exit(1);
    }

    const kind = detectNsigiiKind(head);
    const info = describeNsigiiKind(kind);
    console.log(chalk.bold(`NSIGII dispatch — ${kind}`));
    console.log(chalk.gray("─".repeat(40)));
    console.log(`${chalk.bold("Layout:")}   ${info.label}`);
    console.log(`${chalk.bold("Owner:")}    ${info.owner}`);
    console.log(`${chalk.bold("Size:")}     ${size} bytes`);
    console.log(`${chalk.bold("Next:")}     ${info.nextAction}`);

    try {
      if (kind === NSIGII_KIND.CONSTITUTIONAL_WRAPPER) {
        const meta = inspectFile(file);
        console.log(chalk.gray("─".repeat(40)));
        console.log(`${chalk.bold("Payload:")}  ${meta.header.payloadSize} bytes, hint "${meta.header.formatHint ?? "unknown"}"`);
        console.log(`${chalk.bold("Original:")} ${meta.header.originalFilename ?? "N/A"}`);
        console.log(`${chalk.bold("Recorded consensus:")} ${meta.verification.consensus} — run \`nsigii verify\` for an independent 3/3 check`);
      } else if (kind === NSIGII_KIND.LEGACY_CODEC_STREAM) {
        const meta = inspectCodecFile(file);
        console.log(chalk.gray("─".repeat(40)));
        console.log(`${chalk.bold("Stream:")}   v${meta.version} — ${meta.kind === "ascii" ? "interactive ASCII rotation grid" : "I420 video timeline"}`);
        console.log(`${chalk.bold("Geometry:")} ${meta.width} × ${meta.height}, ${meta.frameCount} frames (${meta.complete ? "complete" : "truncated"})`);
        console.log(chalk.gray("Open in obinexus/nsigii_viewer — this CLI does not render media."));
      } else if (kind === NSIGII_KIND.CORE_V1) {
        console.log(chalk.gray("─".repeat(40)));
        console.log(chalk.gray("Decode with the C core in obinexus/nsigii_project (CLI `unpack`, or the WASM build)."));
        console.log(chalk.gray("The decoded bytes may themselves be another NSIGII artifact — re-run `dispatch` on them."));
      } else {
        console.log(chalk.gray("─".repeat(40)));
        const preview = head.subarray(0, Math.min(head.length, 16)).toString("hex").replace(/(..)/g, "$1 ").trimEnd();
        console.log(`${chalk.bold("First bytes:")} ${preview || "(empty)"}`);
        console.log(chalk.yellow("Inert bytes — NSIGII will not decode, render, or execute this file."));
      }
    } catch (err: any) {
      console.log(chalk.gray("─".repeat(40)));
      console.log(chalk.yellow(`Header recognised as ${kind}, but its body did not parse: ${err.message}`));
    }
  });

program
  .command("inspect <file>")
  .description("Inspect NSIGII container metadata")
  .action(async (file: string) => {
    try {
      if (detectNsigiiVariant(file) === "codec") {
        const info = inspectCodecFile(file);
        console.log(chalk.bold(`NSIGII codec stream v${info.version}`));
        console.log(chalk.gray("─".repeat(40)));
        console.log(`${chalk.bold("Kind:")}         ${info.kind === "ascii" ? "interactive ASCII state grid" : "I420 video timeline"}`);
        console.log(`${chalk.bold("Dimensions:")}   ${info.width} × ${info.height}`);
        console.log(`${chalk.bold("Frames:")}       ${info.frameCount} found / ${info.declaredFrameCount || "unpatched"} declared`);
        console.log(`${chalk.bold("Frame table:")}  ${info.complete ? "complete" : "truncated"}`);
        console.log(`${chalk.bold("Data-only:")}    raw DEFLATE frame blobs; no embedded program`);
        return;
      }
      const info = inspectFile(file);
      console.log(chalk.bold("NSIGII v7.0.0"));
      console.log(chalk.gray("─".repeat(40)));
      console.log(`${chalk.bold("File ID:")}      ${info.header.fileId}`);
      console.log(`${chalk.bold("Created:")}      ${info.header.createdAt}`);
      console.log(`${chalk.bold("Original:")}     ${info.header.originalFilename ?? "N/A"}`);
      console.log(`${chalk.bold("Format Hint:")}  ${info.header.formatHint ?? "unknown"}`);
      console.log(`${chalk.bold("Payload Size:")} ${info.header.payloadSize} bytes`);
      console.log(`${chalk.bold("Payload Hash:")} ${info.header.payloadHash}`);
      console.log(`${chalk.bold("Consensus:")}    ${info.verification.consensus} (${info.verification.consensusScore * 3}/3 recorded)`);
      console.log(`${chalk.bold("Classification:")} ${info.verification.consensus === "YES" ? "SIGNAL" : "NOSIGNAL"}`);
      console.log(`${chalk.bold("RWX Chain:")}    ${info.segments.map((s) => `CH${s.channelId} ${["WRITE","READ","EXECUTE"][s.channelId]}`).join(" → ")}`);
      console.log(`${chalk.bold("Channels:")}`);
      for (const ch of info.channels) console.log(`  CH${ch.id} ${ch.role} (${ch.state})`);
      console.log(`${chalk.bold("Final Hash:")}   ${info.footer.finalHash}`);
      if (info.footer.signature) console.log(`${chalk.bold("Signature:")}    ${info.footer.signature.slice(0,16)}...`);
    } catch (err: any) {
      console.error(chalk.red(`Inspect failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("verify <file>")
  .description("Verify payload integrity against stored hashes")
  .action(async (file: string) => {
    const spinner = ora("Verifying NSIGII container...").start();
    try {
      if (detectNsigiiVariant(file) === "codec") {
        const result = verifyCodecFile(file);
        if (!result.readable) throw new Error(result.error ?? "codec stream could not be read");
        const count = result.frameCountMatch ? "matches header" : "is readable; header count is unpatched or differs";
        spinner.succeed(chalk.green(`Codec data verified: ${result.inflatedFrames} raw-DEFLATE frames inflated; count ${count}.`));
        return;
      }
      const result = verifyFile(file);
      if (result.consensus === "YES") {
        spinner.succeed(chalk.green(`Container verified. Consensus: YES (3/3) | Classification: SIGNAL`));
      } else if (result.consensus === "NO") {
        spinner.fail(chalk.red(`Container tampered. Consensus: NO | Classification: NOISE`));
        process.exit(1);
      } else {
        spinner.warn(chalk.yellow(`Container uncertain. Consensus: MAYBE | Classification: NOSIGNAL`));
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Verification failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("extract <file>")
  .description("Extract payload from NSIGII container")
  .option("-o, --output <path>", "output path")
  .action(async (file: string, opts: { output?: string }) => {
    const spinner = ora("Extracting payload...").start();
    try {
      if (detectNsigiiVariant(file) === "codec") {
        throw new Error("Codec streams are frame data, not a wrapped original payload. Open them in nsigii-viewer.html or nsigii_play.py.");
      }
      const result = extractFile(file, opts.output);
      if (result.verified) spinner.succeed(chalk.green(`Extracted → ${result.outputPath} (verified)`));
      else spinner.warn(chalk.yellow(`Extracted → ${result.outputPath} (unverified)`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Extraction failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("link [files...]")
  .description("Link and resolve multiple NSIGII artifacts")
  .action(async (files: string[]) => {
    if (!files || files.length === 0) {
      console.log(chalk.yellow("Usage: nsigii link <file1.nsigii> <file2.nsigii> ..."));
      return;
    }
    const artifacts = linkArtifacts(files);
    const topology = resolveTopology(artifacts);
    console.log(chalk.bold("Linked Artifacts:"));
    for (const a of artifacts) {
      const status = a.verified ? chalk.green("✓") : chalk.red("✗");
      console.log(`  ${status} ${a.path} ${a.headerHash ? "hash=" + a.headerHash.slice(0,16) + "..." : ""}`);
    }
    console.log(chalk.bold(`Topology Resolution: ${topology}`));
  });

program
  .command("topology")
  .description("Inspect trident topology")
  .action(() => {
    console.log(chalk.bold("NSIGII Trident Topology"));
    console.log(chalk.gray("─".repeat(40)));
    console.log(`CH0 TRANSMIT  → WRITE  → 127.0.0.1`);
    console.log(`CH1 RECEIVE   → READ   → 127.0.0.2`);
    console.log(`CH2 VERIFY    → EXECUTE → 127.0.0.3`);
    console.log(chalk.gray("Consensus threshold: 3/3 (1.00)"));
    console.log(chalk.gray("RWX chain: WRITE → READ → EXECUTE"));
  });

program
  .command("run <file>")
  .description("Verify data-only container; never execute its payload")
  .action(async (file: string) => {
    try {
      const variant = detectNsigiiVariant(file);
      if (variant === "wrapper") {
        const result = verifyFile(file);
        if (result.consensus !== "YES") throw new Error(`wrapper verification did not reach 3/3 consensus (${result.consensusCount}/3)`);
      } else {
        const result = verifyCodecFile(file);
        if (!result.readable) throw new Error(result.error ?? "codec verification failed");
      }
      console.log(chalk.green("Verified data-only NSIGII artifact. No payload was executed."));
      console.log(chalk.gray("Use `nsigii view <file>` to select a renderer, or `nsigii extract` for a verified wrapper payload."));
    } catch (err: any) {
      console.error(chalk.red(`Run refused: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("view <file>")
  .description("Validate an NSIGII data artifact and identify its independent viewer")
  .action((file: string) => {
    try {
      const variant = detectNsigiiVariant(file);
      if (variant === "wrapper") {
        const result = verifyFile(file);
        if (result.consensus !== "YES") throw new Error(`wrapper verification did not reach 3/3 consensus (${result.consensusCount}/3)`);
        console.log(chalk.green("Openable in nsigii-viewer.html: constitutional wrapper receipt (3/3 verified)."));
      } else {
        const result = verifyCodecFile(file);
        if (!result.readable) throw new Error(result.error ?? "codec verification failed");
        console.log(chalk.green("Openable in nsigii-viewer.html: codec frame data (no executable payload)."));
      }
      console.log(chalk.gray(`Drop ${resolve(file)} onto examples/nsigii-viewer.html.`));
    } catch (err: any) {
      console.error(chalk.red(`View refused: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("sign <file>")
  .description("Sign NSIGII container (future)")
  .action(async (file: string) => {
    console.log(chalk.yellow("Digital signing not yet implemented in v0.1.0."));
    console.log(chalk.gray(`Target: ${resolve(file)}`));
  });

program.parse();
