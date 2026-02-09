#!/usr/bin/env bun
/**
 * Standalone Playwright capture runner.
 *
 * Visits one or more URLs, records network traffic via Playwright's HAR
 * recorder, and writes the HAR JSON to disk so it can be parsed or fed
 * into the Unbrowse pipeline manually.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { captureWithHar } from "./src/har-capture";

interface CliOptions {
  waitMs?: number;
  headless?: boolean;
  crawl?: boolean;
  maxPages?: number;
  output?: string;
  userDataDir?: string;
}

function printUsage(): void {
  console.log(`Usage: bun playwright-capture.ts [options] <url> [url...]

Options:
  -w, --wait <ms>         Time to wait on each page before moving on (default: 5000)
      --headless          Run browser in headless mode (default: headed)
      --headed            Force headed mode (window visible)
      --no-crawl          Disable crawler (only visit provided URLs)
      --crawl             Force crawler on
      --max-pages <n>     Max pages for crawler (default: 15)
  -o, --output <path>     Where to save the HAR (default: ./unbrowse-capture-<ts>.har)
      --user-data-dir     Chrome/Chromium profile directory for persistent auth
`);
}

function parseArgs(argv: string[]): { urls: string[]; options: CliOptions } {
  const options: CliOptions = { crawl: true, headless: false };
  const urls: string[] = [];

  const getValue = (args: string[], idx: number, inline?: string): [string, number] => {
    if (inline !== undefined) return [inline, idx];
    const next = args[idx + 1];
    if (!next || next.startsWith("-")) {
      throw new Error("Missing value for option");
    }
    return [next, idx + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-")) {
      urls.push(arg);
      continue;
    }

    const eqIndex = arg.indexOf("=");
    const flag = eqIndex === -1 ? arg : arg.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : arg.slice(eqIndex + 1);

    switch (flag) {
      case "-w":
      case "--wait": {
        const [value, nextIndex] = getValue(argv, i, inlineValue);
        options.waitMs = Number(value);
        if (Number.isNaN(options.waitMs)) throw new Error("wait must be a number");
        i = nextIndex;
        break;
      }
      case "--max-pages": {
        const [value, nextIndex] = getValue(argv, i, inlineValue);
        options.maxPages = Number(value);
        if (Number.isNaN(options.maxPages)) throw new Error("max-pages must be a number");
        i = nextIndex;
        break;
      }
      case "-o":
      case "--output": {
        const [value, nextIndex] = getValue(argv, i, inlineValue);
        options.output = value;
        i = nextIndex;
        break;
      }
      case "--user-data-dir": {
        const [value, nextIndex] = getValue(argv, i, inlineValue);
        options.userDataDir = value;
        i = nextIndex;
        break;
      }
      case "--headless":
        options.headless = true;
        break;
      case "--headed":
        options.headless = false;
        break;
      case "--no-crawl":
        options.crawl = false;
        break;
      case "--crawl":
        options.crawl = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  return { urls, options };
}

async function main() {
  let parsed: { urls: string[]; options: CliOptions };
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    printUsage();
    process.exit(1);
    return;
  }

  if (parsed.urls.length === 0) {
    printUsage();
    process.exit(1);
    return;
  }

  const { urls, options } = parsed;
  console.log(`Capturing via Playwright HAR:
- URLs: ${urls.join(", ")}
- Headless: ${options.headless ? "yes" : "no"}
- Crawl: ${options.crawl !== false ? "yes" : "no"}
`);

  const result = await captureWithHar(urls, {
    waitMs: options.waitMs,
    headless: options.headless ?? false,
    crawl: options.crawl,
    crawlOptions: options.crawl === false ? undefined : {
      maxPages: options.maxPages ?? 15,
      discoverOpenApi: true,
    },
    userDataDir: options.userDataDir,
  });

  const outputPath = resolve(options.output ?? `./unbrowse-capture-${Date.now()}.har`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result.har, null, 2), "utf-8");

  console.log(`Captured ${result.requestCount} request(s) (${result.method}).`);
  if (result.crawlResult) {
    console.log(`Crawler visited ${result.crawlResult.pagesCrawled} page(s).`);
    if (result.crawlResult.openApiSource) {
      console.log(`OpenAPI source detected at ${result.crawlResult.openApiSource}`);
    }
  }
  console.log(`Cookies captured: ${Object.keys(result.cookies).length}`);
  console.log(`HAR saved to ${outputPath}`);
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
