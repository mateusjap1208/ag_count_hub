/** Ativa os hooks do projeto (.githooks) no git local. Roda no "npm install" (script prepare). */
const { execSync } = require('node:child_process');

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
  // sem git (ex.: build da Vercel): nada a fazer
}
