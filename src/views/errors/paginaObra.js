/**
 * Página de erro autônoma (sem Express, sem banco, sem CSS externo) com a animação da obra:
 * usada quando o sistema nem consegue iniciar (configuração incompleta na Vercel ou falha na partida).
 * O desenho é o mesmo da página de erro 500 (partials/obra-animacao.ejs).
 */
const fs = require('node:fs');
const path = require('node:path');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let svg = '';
try {
  svg = fs.readFileSync(path.join(__dirname, '..', 'partials', 'obra-animacao.ejs'), 'utf8').replace(/<%#[\s\S]*?%>\s*/g, '');
} catch { svg = ''; }

const CSS = `
:root { --bg: #F4F6FA; --texto: #06172B; --suave: #5B6573; --borda: #E3E8F0; --azul: #3074F6; }
@media (prefers-color-scheme: dark) { :root { --bg: #020B17; --texto: #E8EEF7; --suave: #9AA8BC; --borda: #1B2E4A; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--texto);
  font-family: Montserrat, system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px; text-align: center; }
.caixa { max-width: 640px; }
h1 { font-size: 22px; margin: 6px 0 8px; }
.codigo { font-size: 56px; font-weight: 800; color: var(--azul); line-height: 1; margin-top: 4px; }
p { color: var(--suave); line-height: 1.6; margin: 6px 0; }
ul { text-align: left; display: inline-block; margin: 10px auto; padding: 12px 18px 12px 34px; border: 1px solid var(--borda); border-radius: 12px; color: var(--texto); }
li { margin: 4px 0; }
.obra-anim { width: min(460px, 92vw); height: auto; display: block; margin: 0 auto 4px; overflow: visible; }
.oa-chao { stroke: var(--borda); stroke-width: 3; stroke-linecap: round; }
.oa-terra, .oa-carga, .oa-terra-concha, .oa-queda circle { fill: #8B5E3C; }
.oa-carga { transform-box: fill-box; transform-origin: 50% 100%; animation: oa-carga 10.8s ease-in-out infinite; }
.oa-cacamba { fill: #9AA5B4; } .oa-cacamba-faixa { fill: #7D8898; } .oa-chassi, .oa-escape, .oa-pino { fill: #283344; }
.oa-cabine { fill: #3074F6; } .oa-janela, .oa-vidro { fill: #CFE0FF; } .oa-roda { fill: #1E2530; } .oa-cubo { fill: #C7CDD6; }
.oa-corpo { fill: #F5B800; } .oa-faixa { fill: #283344; opacity: .85; } .oa-cabine-retro { fill: #E0A800; }
.oa-peca { fill: #F5B800; stroke: #C28F00; stroke-width: 2; } .oa-balde { fill: #5B6573; }
.oa-dentes { fill: none; stroke: #5B6573; stroke-width: 2.5; stroke-linejoin: round; }
.oa-terra-concha { animation: oa-terra-concha 3.6s ease-in-out infinite; }
.oa-queda { opacity: 0; animation: oa-queda 3.6s ease-in infinite; }
.oa-fumaca circle { fill: #B9C1CC; opacity: 0; transform-box: fill-box; transform-origin: center; animation: oa-fumaca 1.8s ease-out infinite; }
.oa-fumaca circle:nth-child(2) { animation-delay: .3s; } .oa-fumaca circle:nth-child(3) { animation-delay: .6s; }
.oa-lanca, .oa-braco, .oa-concha { transform-origin: 0 0; animation-duration: 3.6s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
.oa-lanca { animation-name: oa-lanca; } .oa-braco { animation-name: oa-braco; } .oa-concha { animation-name: oa-concha; }
.oa-retro { animation: oa-trepida 3.6s ease-in-out infinite; }
@keyframes oa-lanca { 0%, 22% { transform: rotate(20deg); } 48%, 72% { transform: rotate(-20deg); } 100% { transform: rotate(20deg); } }
@keyframes oa-braco { 0% { transform: rotate(60deg); } 20% { transform: rotate(40deg); } 48%, 72% { transform: rotate(-55deg); } 100% { transform: rotate(60deg); } }
@keyframes oa-concha { 0% { transform: rotate(0deg); } 20%, 52% { transform: rotate(45deg); } 60%, 72% { transform: rotate(-75deg); } 90%, 100% { transform: rotate(0deg); } }
@keyframes oa-terra-concha { 0%, 14% { opacity: 0; } 20%, 56% { opacity: 1; } 62%, 100% { opacity: 0; } }
@keyframes oa-queda { 0%, 56% { opacity: 0; transform: translateY(-6px); } 60% { opacity: 1; } 74% { opacity: 1; transform: translateY(12px); } 80%, 100% { opacity: 0; transform: translateY(14px); } }
@keyframes oa-carga { 0%, 18% { transform: scaleY(.15); } 22%, 51% { transform: scaleY(.45); } 55%, 84% { transform: scaleY(.75); } 88%, 96% { transform: scaleY(1); } 100% { transform: scaleY(.15); } }
@keyframes oa-fumaca { 0% { opacity: 0; transform: translateY(4px) scale(.6); } 30% { opacity: .7; } 100% { opacity: 0; transform: translateY(-14px) scale(1.4); } }
@keyframes oa-trepida { 0%, 100% { transform: translateY(0); } 20% { transform: translateY(1px); } 50% { transform: translateY(-1px); } }
@media (prefers-reduced-motion: reduce) { .obra-anim * { animation: none !important; } .oa-carga { transform: scaleY(.6); } }
/* Caminhão cheio sai e entra outro vazio: despejos em 20%, 53% e 87% do ciclo de 10,8 s */
.obra-anim { overflow: hidden; }
.oa-caminhao { animation: oa-caminhao 10.8s ease-in-out infinite; }
.oa-carga { animation: oa-carga-viagem 10.8s ease-in-out infinite; }
@keyframes oa-caminhao {
  0% { transform: translateX(230px); }
  12%, 88% { transform: translateX(0); }
  89%, 91% { transform: translateX(-3px); }
  98%, 100% { transform: translateX(230px); }
}
@keyframes oa-carga-viagem { 0%, 20% { transform: scaleY(.08); } 23%, 53% { transform: scaleY(.4); } 56%, 86% { transform: scaleY(.7); } 89%, 100% { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .oa-caminhao { animation: none !important; transform: none; } }
`;

/**
 * @param {object} o
 * @param {number} o.status   código HTTP exibido (ex.: 503)
 * @param {string} o.titulo   título curto
 * @param {string} o.texto    explicação (texto simples)
 * @param {string[]} [o.itens] lista opcional (ex.: o que falta configurar), sem valores secretos
 */
function paginaObra({ status, titulo, texto, itens = [] }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AG Cont Hub · ${esc(titulo)}</title><style>${CSS}</style></head>
<body><main class="caixa">${svg}
<p>Estamos fazendo uma obrinha por aqui. Tente de novo em instantes.</p>
<div class="codigo">${esc(status)}</div>
<h1>${esc(titulo)}</h1>
<p>${esc(texto)}</p>
${itens.length ? `<ul>${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
</main></body></html>`;
}

module.exports = { paginaObra };
