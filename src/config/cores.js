/**
 * Personalização de cores por usuário (tela Personalizar).
 * Cada campo troca uma ou mais variáveis CSS do sistema; o CSS é gerado no servidor
 * (/preferencias/cores.css) e carregado no <head>, antes da página aparecer.
 */
const crypto = require('node:crypto');

const CAMPOS = [
  { chave: 'principal', rotulo: 'Cor principal', ajuda: 'Botões, links, item ativo do menu, gráficos e destaques.', padrao: '#3074F6' },
  { chave: 'titulos', rotulo: 'Títulos', ajuda: 'Títulos das telas e dos cards (tema claro).', padrao: '#06172B' },
  { chave: 'fundo', rotulo: 'Fundo das telas', ajuda: 'Cor atrás dos cards (tema claro).', padrao: '#F4F6FA' },
  { chave: 'positivo', rotulo: 'Valores positivos', ajuda: 'Indicadores bons, lucro e avisos de sucesso.', padrao: '#009360' },
  { chave: 'negativo', rotulo: 'Valores negativos', ajuda: 'Valores negativos, prejuízo e alertas.', padrao: '#D2232A' },
];

/**
 * Paletas prontas, uma por empresa do grupo, a partir dos manuais de identidade visual
 * (só preenchem os campos; a pessoa ainda pode ajustar cada cor).
 * Na cor principal, usamos o azul da marca que funciona nos temas claro e escuro.
 * Quando o manual não traz uma cor para o campo, usamos a paleta digital do Grupo AG
 * (positivo #009360 e negativo #D2232A) ou o fundo padrão do sistema (#F4F6FA).
 */
const PALETAS = [
  // CONSAG: azul vivo, azul-escuro principal; verde e vermelho da paleta digital
  { id: 'consag', nome: 'CONSAG (padrão)', cores: { principal: '#3074F6', titulos: '#06172B', fundo: '#F4F6FA', positivo: '#009360', negativo: '#D2232A' } },
  // AGSA: Pantone 312 (principal), Pantone 303 (títulos), Pantone 7534 (fundo)
  { id: 'agsa', nome: 'AGSA', cores: { principal: '#00A1D4', titulos: '#001434', fundo: '#EDE8DF', positivo: '#009360', negativo: '#D2232A' } },
  // AGCS: mesmo manual da marca Andrade Gutierrez (mesmas cores da AGSA)
  { id: 'agcs', nome: 'AGCS', cores: { principal: '#00A1D4', titulos: '#001434', fundo: '#EDE8DF', positivo: '#009360', negativo: '#D2232A' } },
  // MOVAG: azul vivo e azul-marinho institucional
  { id: 'movag', nome: 'MOVAG', cores: { principal: '#3074F6', titulos: '#0A182B', fundo: '#F4F6FA', positivo: '#009360', negativo: '#D2232A' } },
  // VERTIN: azul elétrico e grafite principal
  { id: 'vertin', nome: 'VERTIN', cores: { principal: '#005CFB', titulos: '#3E3E3D', fundo: '#F4F6FA', positivo: '#009360', negativo: '#D2232A' } },
];

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Tom do menu: a cor principal um pouco mais saturada e escura, para destacar do fundo da tela.
 * (A mesma conta existe em public/js/app.js para a prévia ao vivo.)
 */
function corMenu(hex) {
  let [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = 0, l = (max + min) / 2;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  s = Math.min(1, s * 1.15 + 0.05);
  l *= 0.82;
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Variáveis do menu lateral quando a cor principal é personalizada ('principal' = tom do menu) */
const MENU = {
  'menu-bg': 'principal',
  'menu-item': 'rgba(255, 255, 255, .9)',
  'menu-label': 'rgba(255, 255, 255, .72)',
  'menu-line': 'rgba(255, 255, 255, .22)',
  'menu-hover': 'rgba(255, 255, 255, .14)',
  'menu-marca': '#FFFFFF',
};
/** Menu padrão (azul-escuro), usado na prévia ao voltar a cor principal ao padrão */
const MENU_PADRAO = {
  'menu-bg': '#06172B',
  'menu-item': '#B8C4D6',
  'menu-label': '#6F7F98',
  'menu-line': 'rgba(255, 255, 255, .08)',
  'menu-hover': 'rgba(255, 255, 255, .06)',
  'menu-marca': 'var(--consag-cyan, #4FA3FF)',
};

/** Só aceita cores hexadecimais válidas e diferentes do padrão; nada válido → null (volta ao padrão) */
function normalizar(entrada) {
  if (!entrada || typeof entrada !== 'object') return null;
  const out = {};
  for (const c of CAMPOS) {
    const v = String(entrada[c.chave] || '').trim();
    if (HEX.test(v) && v.toUpperCase() !== c.padrao.toUpperCase()) out[c.chave] = v.toUpperCase();
  }
  return Object.keys(out).length ? out : null;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgba = (hex, a) => `rgba(${rgb(hex).join(', ')}, ${a})`;

/** CSS com as variáveis trocadas (tema claro e escuro) */
function css(cores) {
  const c = normalizar(cores);
  if (!c) return '';
  const claro = [];
  const escuro = [];
  if (c.principal) {
    claro.push(`--consag-blue: ${c.principal}`, `--blue-soft: ${rgba(c.principal, 0.1)}`, `--chip-border: ${rgba(c.principal, 0.4)}`, `--section-bg: ${rgba(c.principal, 0.08)}`, `--dropzone-border: ${rgba(c.principal, 0.35)}`);
    escuro.push(`--consag-blue: ${c.principal}`, `--blue-soft: ${rgba(c.principal, 0.18)}`, `--chip-border: ${rgba(c.principal, 0.45)}`, `--section-bg: ${rgba(c.principal, 0.16)}`);
    // Menu lateral com fundo na cor principal (textos em branco translúcido)
    const menu = Object.entries(MENU).map(([k, v]) => `--${k}: ${v === 'principal' ? corMenu(c.principal) : v}`);
    claro.push(...menu);
    escuro.push(...menu);
  }
  if (c.titulos) claro.push(`--heading: ${c.titulos}`);
  if (c.fundo) claro.push(`--bg: ${c.fundo}`, `--topbar-bg: ${rgba(c.fundo, 0.92)}`);
  if (c.positivo) { claro.push(`--ok: ${c.positivo}`); escuro.push(`--ok: ${c.positivo}`); }
  if (c.negativo) { claro.push(`--danger: ${c.negativo}`); escuro.push(`--danger: ${c.negativo}`); }
  let out = '/* Cores personalizadas do usuário */\n';
  if (claro.length) out += `:root:not([data-theme="dark"]) { ${claro.join('; ')}; }\n`;
  if (escuro.length) out += `:root:root[data-theme="dark"] { ${escuro.join('; ')}; }\n`;
  return out;
}

/** Versão curta para o endereço do CSS (muda quando as cores mudam) */
const versao = (cores) => crypto.createHash('sha1').update(JSON.stringify(normalizar(cores) || {})).digest('hex').slice(0, 10);

module.exports = { CAMPOS, PALETAS, MENU, MENU_PADRAO, corMenu, normalizar, css, versao };
