// Renders Google Play store graphics for both apps into mobile/play-store/<app>/:
//   icon-512.png            — Play listing icon (512×512, full-bleed square; Play rounds the corners)
//   feature-graphic.png     — 1024×500 banner shown at the top of the listing
//   screenshots/NN-*.png    — 1080×1920 phone screenshots with a caption, made from raw captures
// Raw captures (390×844 @3x PNGs) are read from mobile/play-store/<app>/raw/.
// Usage (from mobile/): node scripts/make-store-assets.mjs
import { existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const FONT = "Segoe UI, Roboto, Arial, sans-serif";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const APPS = [
  {
    dir: "customer",
    name: "Dukaan Express",
    tagline: "Groceries & essentials from local shops, delivered in minutes",
    from: "#22c55e",
    to: "#14532d",
    hero: "customer-1-home",
    shots: [
      ["customer-1-home", "Groceries in minutes", "From trusted shops in your neighbourhood"],
      ["customer-2-categories", "Everything you need", "Fruits, dairy, staples, medicines & more"],
      ["customer-3-store", "Shop from local stores", "See delivery time, distance and ratings"],
      ["customer-4-product", "Never above MRP", "Clear prices and offers on every item"],
      ["customer-5-cart", "Quick, easy checkout", "UPI, cards, net banking or cash on delivery"],
      ["customer-6-order", "Track every step", "From the shop's counter to your door"],
    ],
  },
  {
    dir: "shop",
    name: "Dukaan Partner",
    tagline: "Take orders online and grow your shop with Dukaan Express",
    from: "#15803d",
    to: "#052e16",
    hero: "shop-1-dashboard",
    shots: [
      ["shop-1-dashboard", "Run your shop online", "Today's orders and sales at a glance"],
      ["shop-2-orders", "Never miss an order", "Loud alerts the moment an order arrives"],
      ["shop-3-order", "Accept & pack in seconds", "See what to pack and what you earn"],
      ["shop-4-inventory", "Manage stock easily", "Update prices and stock in one tap"],
      ["shop-5-earnings", "Get paid when you want", "Earnings after commission, payout on request"],
      ["shop-6-settings", "Your shop, your hours", "Set opening hours and preparation time"],
    ],
  },
];

const grad = (id, from, to) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
// soft decorative circles so the background isn't flat
const blobs = (w, h) =>
  `<circle cx="${w * 0.9}" cy="${h * 0.08}" r="${w * 0.32}" fill="#ffffff" opacity="0.07"/><circle cx="${w * 0.05}" cy="${h * 0.95}" r="${w * 0.4}" fill="#ffffff" opacity="0.05"/>`;
const svg = (w, h, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`);

/** Screenshot inside a dark phone bezel with rounded corners. Returns a PNG buffer of the framed phone. */
async function phone(rawPath, width) {
  const bezel = Math.round(width * 0.028);
  const r = Math.round(width * 0.085);
  const inner = width - bezel * 2;
  const meta = await sharp(rawPath).metadata();
  const innerH = Math.round((inner * meta.height) / meta.width);
  const h = innerH + bezel * 2;
  const screen = await sharp(rawPath)
    .resize(inner, innerH)
    .composite([{ input: svg(inner, innerH, `<rect width="${inner}" height="${innerH}" rx="${r - bezel}" fill="#fff"/>`), blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(svg(width, h, `<rect width="${width}" height="${h}" rx="${r}" fill="#0b1410"/><rect x="1.5" y="1.5" width="${width - 3}" height="${h - 3}" rx="${r - 1}" fill="none" stroke="#3b4a42" stroke-width="3"/>`))
    .composite([{ input: screen, left: bezel, top: bezel }])
    .png()
    .toBuffer();
}

for (const a of APPS) {
  const base = `play-store/${a.dir}`;
  const raw = `${base}/raw`;
  mkdirSync(`${base}/screenshots`, { recursive: true });

  // 1) Listing icon, from the launcher artwork made by make-assets.mjs
  await sharp(`${a.dir}/assets/icon-only.png`).resize(512, 512).png().toFile(`${base}/icon-512.png`);

  // 2) Phone screenshots with captions (1080×1920, 9:16)
  const W = 1080;
  const H = 1920;
  for (const [i, [file, title, sub]] of a.shots.entries()) {
    const src = `${raw}/${file}.png`;
    if (!existsSync(src)) {
      console.warn(`skip ${src} (missing)`);
      continue;
    }
    const ph = await phone(src, 820);
    const bg = svg(
      W,
      H,
      `<defs>${grad("g", a.from, a.to)}</defs><rect width="${W}" height="${H}" fill="url(#g)"/>${blobs(W, H)}
       <text x="${W / 2}" y="190" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="82" fill="#ffffff">${esc(title)}</text>
       <text x="${W / 2}" y="270" text-anchor="middle" font-family="${FONT}" font-weight="400" font-size="40" fill="#ffffff" fill-opacity="0.88">${esc(sub)}</text>`,
    );
    // The phone runs off the bottom edge; crop it to the canvas.
    const top = 360;
    const phH = (await sharp(ph).metadata()).height;
    const visible = await sharp(ph).extract({ left: 0, top: 0, width: 820, height: Math.min(phH, H - top) }).png().toBuffer();
    await sharp(bg)
      .composite([{ input: visible, left: (W - 820) / 2, top }])
      .flatten({ background: a.to })
      .png()
      .toFile(`${base}/screenshots/${String(i + 1).padStart(2, "0")}-${file.replace(/^\w+-\d-/, "")}.png`);
  }

  // 3) Feature graphic 1024×500 (no transparency allowed)
  const FW = 1024;
  const FH = 500;
  const icon = await sharp(`${a.dir}/assets/icon-only.png`)
    .resize(132, 132)
    .composite([{ input: svg(132, 132, `<rect width="132" height="132" rx="30" fill="#fff"/>`), blend: "dest-in" }])
    .png()
    .toBuffer();
  const heroPhone = await phone(`${raw}/${a.hero}.png`, 300);
  const heroH = (await sharp(heroPhone).metadata()).height;
  const words = a.tagline.split(" ");
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= 34) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const fg = svg(
    FW,
    FH,
    `<defs>${grad("g", a.from, a.to)}</defs><rect width="${FW}" height="${FH}" fill="url(#g)"/>${blobs(FW, FH)}
     <text x="232" y="150" font-family="${FONT}" font-weight="700" font-size="56" fill="#ffffff">${esc(a.name)}</text>
     <text x="234" y="190" font-family="${FONT}" font-weight="600" font-size="22" fill="#ffffff" fill-opacity="0.8" letter-spacing="1">POWERED BY ABHAYCART</text>
     ${lines.map((l, i) => `<text x="80" y="${290 + i * 46}" font-family="${FONT}" font-weight="400" font-size="36" fill="#ffffff">${esc(l)}</text>`).join("")}`,
  );
  await sharp(fg)
    .composite([
      { input: icon, left: 80, top: 82 },
      { input: await sharp(heroPhone).extract({ left: 0, top: 0, width: 300, height: Math.min(heroH, FH - 40) }).png().toBuffer(), left: FW - 300 - 60, top: 40 },
    ])
    .flatten({ background: a.to })
    .png()
    .toFile(`${base}/feature-graphic.png`);

  console.log(`store assets rendered for ${a.dir}`);
}
