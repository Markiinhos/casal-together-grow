const fs = require('fs');
const glob = require('glob');
const files = glob.sync('src/**/*.tsx');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('value=""')) {
    console.log(f);
  }
});
