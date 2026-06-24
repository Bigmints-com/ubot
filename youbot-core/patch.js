const fs = require('fs');
let content = fs.readFileSync('src/api/index.ts', 'utf8');
content = content.replace(`    const isPublicApi = url === '/api/health' 
      || url.startsWith('/api/webchat/')
      || url.startsWith('/api/auth/')
      || url.startsWith('/api/integrations/');
    // Permissive CORS for webchat (embedded on third-party sites)`, `    // Permissive CORS for webchat (embedded on third-party sites)`);
content = content.replace(`    const isPublicApi = url === '/api/health' 
      || url.startsWith('/api/webchat/')
      || url.startsWith('/api/auth/');`, `    const isPublicApi = url === '/api/health' 
      || url.startsWith('/api/webchat/')
      || url.startsWith('/api/auth/')
      || url.startsWith('/api/integrations/');`);
fs.writeFileSync('src/api/index.ts', content);
