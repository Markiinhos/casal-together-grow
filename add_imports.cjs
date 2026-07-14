const fs = require('fs');
const files = [
'src/routes/app/agenda.tsx',
'src/routes/app/cardapio.tsx',
'src/routes/app/financas.assinaturas.$id.tsx',
'src/routes/app/financas.assinaturas.index.tsx',
'src/routes/app/financas.assinaturas.nova.tsx',
'src/routes/app/financas.planejamento.index.tsx',
'src/routes/app/financas.simular.tsx',
'src/routes/app/index.tsx',
'src/routes/app/rotina.tsx',
'src/routes/app/saude.tsx',
'src/routes/app/tarefas.tsx',
'src/routes/app/casa/compras.$id.tsx'
];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    if (!content.includes('import { getLocalISODate }')) {
      content = content.replace(/import /, 'import { getLocalISODate } from "@/lib/date-utils";\nimport ');
      fs.writeFileSync(f, content);
      console.log('Fixed ' + f);
    }
  }
});
