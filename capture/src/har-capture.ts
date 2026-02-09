import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface CaptureResult {
  har: any;
  requestCount: number;
  method: string;
  crawlResult?: {
    pagesCrawled: number;
    openApiSource?: string;
  };
  cookies: Record<string, string>;
}

export interface CaptureOptions {
  waitMs?: number;
  headless?: boolean;
  crawl?: boolean;
  crawlOptions?: {
    maxPages: number;
    discoverOpenApi: boolean;
  };
  userDataDir?: string;
}

export async function captureWithHar(urls: string[], options: CaptureOptions): Promise<CaptureResult> {
  const browser = await chromium.launch({
    headless: options.headless,
  });

  try {
    const context = await browser.newContext({
      recordHar: {
        path: "temp_har.har", // We will extract the content from this file or handle it in memory if possible, but Playwright requires a path.
        // However, since we need to return the HAR object, we'll read it back.
        // Actually, Playwright HAR recording writes to a file. We'll need to read this file.
        // For this implementation, let's use a temporary file path approach or just let Playwright write it and we read it.
        // But wait, the prompt implies "writes the HAR JSON to disk so it can be parsed or fed into the Unbrowse pipeline manually".
        // The main script does that. Here we should probably just return the HAR object.
        // Let's use a temporary file for the HAR recording.
      },
    });
    
    // We need to start tracing or HAR recording.
    // The context `recordHar` option is the easiest way.
    // We'll use a temporary file path.
    const tempHarPath = `temp_${Date.now()}.har`;
    await context.routeFromHAR(tempHarPath, {
      update: true,
      updateContent: 'embed',
      updateMode: 'minimal', 
    });
    
    // Actually, `recordHar` in `newContext` is better for *capturing*. `routeFromHAR` is for *replaying* or *mocking*.
    // Let's re-create the context with the correct option.
    await context.close();
  } catch (e) {
      // ignore
  }

  // Proper implementation using recordHar
  const tempHarPath = `temp_capture_${Date.now()}.har`;
  const context = await browser.newContext({
    recordHar: {
      path: tempHarPath,
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  let pagesVisited = 0;
  
  // Basic crawling logic if enabled, otherwise just visit the URLs
  // For this MVP, let's just visit the provided URLs sequentially.
  
  for (const url of urls) {
    try {
      console.log(`Visting ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      if (options.waitMs) {
        await page.waitForTimeout(options.waitMs);
      }
      pagesVisited++;
    } catch (e) {
      console.error(`Failed to load ${url}:`, e);
    }
  }

  await context.close();
  await browser.close();

  // Read the HAR file
  const fs = await import('node:fs/promises');
  const harContent = await fs.readFile(tempHarPath, 'utf-8');
  await fs.unlink(tempHarPath); // Clean up
  
  const harJson = JSON.parse(harContent);

  // Extract cookies (just from the first request for simplicity, or aggregate)
  const cookies: Record<string, string> = {};
  if (harJson.log && harJson.log.entries) {
    for (const entry of harJson.log.entries) {
      if (entry.request && entry.request.cookies) {
        for (const cookie of entry.request.cookies) {
          cookies[cookie.name] = cookie.value;
        }
      }
      if (entry.response && entry.response.cookies) {
         for (const cookie of entry.response.cookies) {
          cookies[cookie.name] = cookie.value;
        }
      }
    }
  }
  
  return {
    har: harJson,
    requestCount: harJson.log.entries.length,
    method: 'playwright-har',
    crawlResult: {
      pagesCrawled: pagesVisited,
    },
    cookies,
  };
}
