// Adiciona as permissões de microfone ao AndroidManifest gerado pelo Capacitor.
// Sem RECORD_AUDIO o WebView recusa o microfone sem mostrar o pedido ao usuário.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = "android/app/src/main/AndroidManifest.xml";
if (!existsSync(path)) {
  console.log("[permissions] Pasta android não encontrada. Rode `npx cap add android` primeiro.");
  process.exit(0);
}

let xml = readFileSync(path, "utf8");
const perms = [
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.INTERNET",
];
let added = 0;
for (const p of perms) {
  if (!xml.includes(`"${p}"`)) {
    xml = xml.replace("</manifest>", `    <uses-permission android:name="${p}" />\n</manifest>`);
    added++;
  }
}
writeFileSync(path, xml);
console.log(`[permissions] ${added} permissão(ões) adicionada(s) ao AndroidManifest.`);
