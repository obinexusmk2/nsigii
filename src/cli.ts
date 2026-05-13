#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { resolve, basename } from "node:path";
import { wrapFile } from "./core/wrap.js";
import { inspectFile } from "./core/inspect.js";
import { verifyFile } from "./core/verify.js";
import { extractFile } from "./core/extract.js";
import { linkArtifacts, resolveTopology } from "./core/link.js";

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
      const out = wrapFile(file, { formatHint: opts.format as any, originalFilename: basename(file) });
      spinner.succeed(chalk.green(`Wrapped → ${out}`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Wrap failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("inspect <file>")
  .description("Inspect NSIGII container metadata")
  .action(async (file: string) => {
    try {
      const info = inspectFile(file);
      console.log(chalk.bold("NSIGII v7.0.0"));
      console.log(chalk.gray("─".repeat(40)));
      console.log(`${chalk.bold("File ID:")}      ${info.header.fileId}`);
      console.log(`${chalk.bold("Created:")}      ${info.header.createdAt}`);
      console.log(`${chalk.bold("Original:")}     ${info.header.originalFilename ?? "N/A"}`);
      console.log(`${chalk.bold("Format Hint:")}  ${info.header.formatHint ?? "unknown"}`);
      console.log(`${chalk.bold("Payload Size:")} ${info.header.payloadSize} bytes`);
      console.log(`${chalk.bold("Payload Hash:")} ${info.header.payloadHash}`);
      console.log(`${chalk.bold("Consensus:")}    ${info.verification.consensus}`);
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
      const result = verifyFile(file);
      if (result.consensus === "YES") {
        spinner.succeed(chalk.green(`Container verified. Consensus: YES | Classification: SIGNAL`));
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
    console.log(chalk.gray("Consensus threshold: 2/3 (0.67)"));
    console.log(chalk.gray("RWX chain: WRITE → READ → EXECUTE"));
  });

program
  .command("run <file>")
  .description("Execute verified payload (adapter-based, future)")
  .action(async (file: string) => {
    console.log(chalk.yellow("Run adapter not yet implemented. Use 'extract' to retrieve payload."));
    console.log(chalk.gray(`Target: ${resolve(file)}`));
  });

program
  .command("sign <file>")
  .description("Sign NSIGII container (future)")
  .action(async (file: string) => {
    console.log(chalk.yellow("Digital signing not yet implemented in v0.1.0."));
    console.log(chalk.gray(`Target: ${resolve(file)}`));
  });

program.parse();
