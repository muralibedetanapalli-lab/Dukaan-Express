// Creates the release (upload) signing key once and wires it into both Android projects.
// The key lives OUTSIDE the repo in ~/.dukaan-keys — back that folder up. With Play App Signing,
// a lost upload key can be reset through Play Console, but it's still a hassle.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { javaHome } from "./java.mjs";

const dir = path.join(os.homedir(), ".dukaan-keys");
const store = path.join(dir, "dukaan-upload.jks");
const info = path.join(dir, "keystore.properties");
mkdirSync(dir, { recursive: true });

if (!existsSync(store)) {
  const pass = randomBytes(18).toString("base64url");
  const keytool = path.join(javaHome(), "bin", process.platform === "win32" ? "keytool.exe" : "keytool");
  execFileSync(keytool, [
    "-genkeypair", "-v", "-keystore", store, "-alias", "upload", "-keyalg", "RSA", "-keysize", "4096", "-validity", "10000",
    "-storepass", pass, "-keypass", pass, "-dname", "CN=Dukaan Express, O=Dukaan Express, C=IN",
  ], { stdio: "ignore" });
  writeFileSync(info, `storeFile=${store.replace(/\\/g, "/")}\nstorePassword=${pass}\nkeyAlias=upload\nkeyPassword=${pass}\n`);
  console.log(`Created upload key: ${store}`);
} else {
  console.log(`Using existing upload key: ${store}`);
}

const props = readFileSync(info, "utf8");
for (const app of ["customer", "shop"]) {
  writeFileSync(path.join(import.meta.dirname, "..", app, "android", "keystore.properties"), props);
}
console.log("keystore.properties written to customer/android and shop/android (git-ignored)");
console.log(`BACK UP ${dir} somewhere safe (password manager / encrypted drive).`);
