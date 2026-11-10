// Builds the release APK (for direct install / testing) and AAB (for Google Play) of the app in the
// current folder, then copies them to mobile/dist/. Run via `npm run build -w customer|shop`.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { androidSdk, javaHome } from "./java.mjs";

const app = path.basename(process.cwd());
const androidDir = path.join(process.cwd(), "android");
const versionName = process.env.VERSION_NAME ?? "1.0.0";
const versionCode = process.env.VERSION_CODE ?? "1";

if (!existsSync(path.join(androidDir, "keystore.properties"))) {
  console.warn("⚠ No keystore.properties — run `node scripts/make-keystore.mjs` first. Building UNSIGNED release artifacts.");
}
writeFileSync(path.join(androidDir, "local.properties"), `sdk.dir=${androidSdk().replace(/\\/g, "/")}\n`);

const gradlew = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
execFileSync(gradlew, ["assembleRelease", "bundleRelease", `-PversionName=${versionName}`, `-PversionCode=${versionCode}`, "--no-daemon", "-q"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, JAVA_HOME: javaHome() },
});

const dist = path.join(process.cwd(), "..", "dist");
mkdirSync(dist, { recursive: true });
const outs = [
  [path.join(androidDir, "app/build/outputs/apk/release/app-release.apk"), `dukaan-${app}-${versionName}.apk`],
  [path.join(androidDir, "app/build/outputs/bundle/release/app-release.aab"), `dukaan-${app}-${versionName}.aab`],
];
for (const [src, name] of outs) {
  if (existsSync(src)) {
    copyFileSync(src, path.join(dist, name));
    console.log(`✔ ${path.join("mobile", "dist", name)} (${(readFileSync(src).length / 1024 / 1024).toFixed(1)} MB)`);
  } else console.warn(`✖ missing ${src}`);
}
