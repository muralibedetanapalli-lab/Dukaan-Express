// Generates www/index.html and www/offline.html for an app (run from the app folder before `cap sync`).
// The app normally loads the live site; these local pages are only shown when it can't be reached.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_SERVER = "https://dukaan-app.bluesky-9c69274d.centralindia.azurecontainerapps.io";
const role = path.basename(process.cwd()); // customer | shop
const server = (process.env.DUKAAN_URL ?? DEFAULT_SERVER).replace(/\/$/, "");
const start = `${server}${role === "shop" ? "/shop" : "/"}`;
const color = role === "shop" ? "#0f3d24" : "#15803d";
const name = role === "shop" ? "Dukaan Partner" : "Dukaan Express";

const page = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${name}</title>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7faf7;color:#14261c}
  main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center;box-sizing:border-box}
  .logo{width:72px;height:72px;border-radius:20px;background:${color};display:grid;place-items:center}
  h1{font-size:20px;margin:8px 0 0} p{margin:0;color:#56695e;max-width:320px;line-height:1.5}
  button{margin-top:8px;border:0;border-radius:12px;background:${color};color:#fff;font-size:16px;font-weight:700;padding:14px 28px}
</style>
</head>
<body><main>${body}</main>
<script>
  var START = ${JSON.stringify(start)};
  function retry(){ document.getElementById('msg') && (document.getElementById('msg').textContent = 'Connecting…'); location.replace(START); }
</script>
</body>
</html>`;

const logo = `<div class="logo"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>`;

mkdirSync("www", { recursive: true });
writeFileSync("www/index.html", page(`${logo}<h1>${name}</h1><p id="msg">Loading…</p><script>location.replace(START)</script>`));
writeFileSync(
  "www/offline.html",
  page(`${logo}<h1>You're offline</h1><p id="msg">We couldn't reach ${name}. Check your internet connection and try again.</p><button onclick="retry()">Try again</button>
<script>window.addEventListener('online', retry);</script>`),
);
console.log(`www written for ${role} → ${start}`);
