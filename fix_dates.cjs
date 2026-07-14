const fs = require('fs');
const glob = require('glob');
const files = glob.sync('src/**/*.{ts,tsx}');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('toISOString().slice(0, 10)')) {
    content = content.replace(/(new Date\([^)]*\)|[a-zA-Z0-9_\.]+)\.toISOString\(\)\.slice\(0,\s*10\)/g, 'getLocalISODate($1)');
    if (!content.includes('getLocalISODate')) {
      const match = content.match(/import .* from ['\"][^'\"]+['\"];?/g);
      const lastImport = match ? match[match.length - 1] : null;
      const importStmt = 'import { getLocalISODate } from "@/lib/date-utils";\n';
      if (lastImport) {
        content = content.replace(lastImport, lastImport + '\n' + importStmt);
      } else {
        content = importStmt + content;
      }
    }
    fs.writeFileSync(f, content);
    console.log('Fixed', f);
  }
});
