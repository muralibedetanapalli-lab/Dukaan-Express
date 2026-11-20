/**
 * Auto-generated product icons: the same gradient + emoji artwork used for the catalogue's seed images.
 * Pure (no server imports) so the URL can be built anywhere; the SVG itself is served by /art/[file].
 */

/** Category look: emoji and gradient, matched on words in the category name. */
const CATEGORY_LOOKS: { match: RegExp; emoji: string; from: string; to: string }[] = [
  { match: /fruit|veg|vegetable|green/i, emoji: "🥦", from: "#d9f99d", to: "#86efac" },
  { match: /dairy|milk/i, emoji: "🥛", from: "#e0f2fe", to: "#bae6fd" },
  { match: /bakery|bread|cake/i, emoji: "🍞", from: "#ffedd5", to: "#fdba74" },
  { match: /meat|fish|sea ?food|chicken|egg/i, emoji: "🍗", from: "#fee2e2", to: "#fca5a5" },
  { match: /medic|pharma|health|chemist/i, emoji: "💊", from: "#ede9fe", to: "#c4b5fd" },
  { match: /stationery|book|office/i, emoji: "✏️", from: "#e0e7ff", to: "#a5b4fc" },
  { match: /electronic|mobile|gadget/i, emoji: "🔌", from: "#e2e8f0", to: "#94a3b8" },
  { match: /household|home|clean|personal|care/i, emoji: "🧴", from: "#ccfbf1", to: "#5eead4" },
  { match: /grocer|staple|kirana|food|grain|rice|atta/i, emoji: "🌾", from: "#fef3c7", to: "#fcd34d" },
  { match: /snack|beverage|drink|juice/i, emoji: "🥤", from: "#fce7f3", to: "#f9a8d4" },
  { match: /pet/i, emoji: "🐾", from: "#fef9c3", to: "#fde047" },
  { match: /baby|kid|toy/i, emoji: "🧸", from: "#fae8ff", to: "#f0abfc" },
];

/** Fallback gradients for categories we don't recognise, picked by a stable hash of the name. */
const FALLBACK_GRADIENTS: [string, string][] = [
  ["#dcfce7", "#86efac"],
  ["#e0f2fe", "#7dd3fc"],
  ["#fef3c7", "#fcd34d"],
  ["#ede9fe", "#c4b5fd"],
  ["#ffe4e6", "#fda4af"],
  ["#ccfbf1", "#5eead4"],
];

/** Product keywords → emoji. First match wins, so more specific words come first. Matched at word starts. */
const PRODUCT_KEYWORDS: [RegExp, string][] = [
  [/tomato/i, "🍅"],
  [/onion/i, "🧅"],
  [/potato|aloo/i, "🥔"],
  [/carrot/i, "🥕"],
  [/broccoli|cauliflower|cabbage/i, "🥦"],
  [/chil+i|mirch|pepper/i, "🌶️"],
  [/garlic/i, "🧄"],
  [/ginger/i, "🫚"],
  [/corn|maize/i, "🌽"],
  [/cucumber/i, "🥒"],
  [/brinjal|eggplant|baingan/i, "🍆"],
  [/mushroom/i, "🍄"],
  [/coriander|mint|curry leaves|spinach|palak|methi|herb|leaves/i, "🌿"],
  [/banana/i, "🍌"],
  [/apple/i, "🍎"],
  [/mango/i, "🥭"],
  [/watermelon/i, "🍉"],
  [/grape/i, "🍇"],
  [/orange|mosambi|vitamin c/i, "🍊"],
  [/lemon|lime/i, "🍋"],
  [/pineapple/i, "🍍"],
  [/strawberr/i, "🍓"],
  [/coconut/i, "🥥"],
  [/kiwi/i, "🥝"],
  [/cherr/i, "🍒"],
  [/peach|pear|guava/i, "🍐"],
  [/milk shake|milkshake|lassi|buttermilk/i, "🥤"],
  [/milk/i, "🥛"],
  [/curd|dahi/i, "🥣"],
  [/yog(h)?urt/i, "🥄"],
  [/butter(?! ?milk)/i, "🧈"],
  [/ghee/i, "🫙"],
  [/paneer|cheese|tofu/i, "🧀"],
  [/ice ?cream/i, "🍨"],
  [/atta|flour|maida|wheat|sooji|rava/i, "🌾"],
  [/rice|poha/i, "🍚"],
  [/dal|lentil|pulse|chana|rajma|bean/i, "🫘"],
  [/oil/i, "🛢️"],
  [/salt/i, "🧂"],
  [/sugar|jaggery|gur/i, "🍬"],
  [/masala|spice|haldi|turmeric|jeera|cumin/i, "🌶️"],
  [/tea|chai/i, "🍵"],
  [/coffee/i, "☕"],
  [/honey/i, "🍯"],
  [/noodle|pasta|maggi/i, "🍜"],
  [/chips|crisps|namkeen/i, "🍟"],
  [/chocolate|candy|toffee/i, "🍫"],
  [/croissant/i, "🥐"],
  [/pastry|cake/i, "🍰"],
  [/biscuit|cookie/i, "🍪"],
  [/rusk|pretzel/i, "🥨"],
  [/bun|pav|baguette/i, "🥖"],
  [/bread/i, "🍞"],
  [/juice|cola|soda|soft drink|drink/i, "🧃"],
  [/water/i, "💧"],
  [/egg/i, "🥚"],
  [/prawn|shrimp/i, "🦐"],
  [/crab/i, "🦀"],
  [/fish|seer|pomfret|rohu/i, "🐟"],
  [/mutton|lamb|goat|beef|pork/i, "🥩"],
  [/chicken/i, "🍗"],
  [/tablet|capsule|paracetamol|medicine|tabs?\b/i, "💊"],
  [/syrup/i, "🧴"],
  [/band-?aid|bandage|plaster/i, "🩹"],
  [/thermometer/i, "🌡️"],
  [/mask/i, "😷"],
  [/notebook|register|diary/i, "📓"],
  [/pen\b|pens\b|ball ?pen/i, "🖊️"],
  [/pencil/i, "✏️"],
  [/crayon|colou?r/i, "🖍️"],
  [/scissor/i, "✂️"],
  [/book/i, "📚"],
  [/cable|wire|usb/i, "🔌"],
  [/charger|battery|batteries|power ?bank/i, "🔋"],
  [/earphone|headphone|earbud/i, "🎧"],
  [/bulb|led|torch/i, "💡"],
  [/detergent|liquid|surf|shampoo|lotion/i, "🧴"],
  [/dish|scrub|sponge/i, "🧽"],
  [/floor|broom|mop/i, "🧹"],
  [/toilet|harpic/i, "🚽"],
  [/soap/i, "🧼"],
  [/tooth ?paste|tooth ?brush/i, "🪥"],
  [/garbage|trash|dustbin/i, "🗑️"],
  [/tissue|napkin|toilet roll/i, "🧻"],
  [/diaper|nappy/i, "🍼"],
  [/candle|agarbatti|incense/i, "🕯️"],
];

// Keywords only match at the start of a word ("methi" must not match "soMETHIng").
const PRODUCT_EMOJI: [RegExp, string][] = PRODUCT_KEYWORDS.map(([re, e]) => [new RegExp(`\\b(?:${re.source})`, "i"), e]);

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Emoji and gradient for a product, from its name and category name. */
export function productLook(productName: string, categoryName = "") {
  const cat = CATEGORY_LOOKS.find((c) => c.match.test(categoryName));
  const [from, to] = cat ? [cat.from, cat.to] : FALLBACK_GRADIENTS[hash(categoryName || productName) % FALLBACK_GRADIENTS.length];
  const emoji = PRODUCT_EMOJI.find(([re]) => re.test(productName))?.[1] ?? cat?.emoji ?? "🛍️";
  return { emoji, from, to };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60) || "product";

/** URL of the generated icon. Everything needed to draw it is in the URL, so the image never changes once saved. */
export function productArtUrl(productName: string, categoryName = "") {
  const { emoji, from, to } = productLook(productName, categoryName);
  const q = new URLSearchParams({ e: emoji, g: `${from.slice(1)}-${to.slice(1)}` });
  return `/art/${slug(productName)}.svg?${q}`;
}

/** True for icons made by productArtUrl (so a real photo can replace them). */
export const isGeneratedArt = (url: string | null | undefined) => !!url && url.startsWith("/art/");

const HEX = /^[0-9a-f]{6}$/i;

/** The SVG for /art/[file]: identical artwork to the seed catalogue images. Inputs are validated, never trusted. */
export function productArtSvg(emojiParam: string | null, gradientParam: string | null) {
  // Keep at most a couple of characters (an emoji with its variation selector); escape XML just in case.
  const emoji = [...(emojiParam ?? "🛍️")]
    .slice(0, 3)
    .join("")
    .replace(/[<>&"']/g, "") || "🛍️";
  const [a, b] = (gradientParam ?? "").split("-");
  const from = HEX.test(a ?? "") ? `#${a}` : "#dcfce7";
  const to = HEX.test(b ?? "") ? `#${b}` : "#86efac";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="400" rx="48" fill="url(#g)"/><circle cx="200" cy="190" r="120" fill="#ffffff" fill-opacity="0.35"/><text x="200" y="245" font-size="150" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text></svg>`;
}
