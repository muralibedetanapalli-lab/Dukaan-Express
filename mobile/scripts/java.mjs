import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Android builds need JDK 21: prefer JAVA_HOME, else the JDK bundled with Android Studio. */
export function javaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    "/opt/android-studio/jbr",
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(path.join(c, "bin", process.platform === "win32" ? "java.exe" : "java"))) return c;
  }
  throw new Error("JDK 21 not found. Install Android Studio or set JAVA_HOME.");
}

export function androidSdk() {
  const c = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? path.join(os.homedir(), process.platform === "win32" ? "AppData/Local/Android/Sdk" : "Android/Sdk");
  if (!existsSync(c)) throw new Error("Android SDK not found. Install it via Android Studio or set ANDROID_HOME.");
  return c;
}
