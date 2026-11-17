import { spawn } from "node:child_process";

const origin = "http://127.0.0.1:4174";
const base = origin + "/fontscope-studio/";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4174", "--strictPort"], {
  stdio: "ignore",
  env: process.env,
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOk(url, expectedType) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + " returned HTTP " + response.status);
  if (expectedType && !response.headers.get("content-type")?.includes(expectedType)) {
    throw new Error(url + " returned an unexpected content type: " + response.headers.get("content-type"));
  }
  return response;
}

try {
  let page;
  let lastError;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error("Vite preview server exited before becoming ready.");
    try {
      page = await fetchOk(base, "text/html");
      break;
    } catch (error) {
      lastError = error;
      await wait(250);
    }
  }
  if (!page) throw lastError || new Error("Preview server did not become ready.");
  const html = await page.text();
  if (!html.includes("FontScope — Font Engineering Studio")) throw new Error("Built page is missing its expected document title.");
  if (!html.includes("Content-Security-Policy")) throw new Error("Built page is missing the Content Security Policy.");

  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);
  if (!assets.some((asset) => asset.endsWith(".js"))) throw new Error("No application JavaScript asset was found.");
  for (const asset of assets) await fetchOk(new URL(asset, origin).href);

  for (const path of ["privacy.html", "favicon.svg", "og-image.svg", "robots.txt", "sitemap.xml"]) {
    await fetchOk(base + path);
  }
  console.log("FontScope preview smoke checks passed: HTML, CSP, JS/CSS assets, privacy page, favicon, social image, robots.txt and sitemap.");
} finally {
  server.kill("SIGTERM");
}
