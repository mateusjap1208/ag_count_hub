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

/** Paletas prontas (só preenchem os campos; a pessoa ainda pode ajustar cada cor) */
const PALETAS = [
  { id: 'consag', nome: 'CONSAG (padrão)', cores: { principal: '#3074F6', titulos: '#06172B', fundo: '#F4F6FA', positivo: '#009360', negativo: '#D2232A' } },
  { id: 'petroleo', nome: 'Petróleo', cores: { principal: '#2D758E', titulos: '#0E2A33', fundo: '#F2F6F7', positivo: '#1E8C5A', negativo: '#C8372D' } },
  { id: 'esmeralda', nome: 'Esmeralda', cores: { principal: '#0E8F63', titulos: '#0B2A20', fundo: '#F3F7F5', positivo: '#0E8F63', negativo: '#D2232A' } },
  { id: 'violeta', nome: 'Violeta', cores: { principal: '#6A4CE0', titulos: '#1D1640', fundo: '#F6F5FB', positivo: '#13906A', negativo: '#D2335A' } },
  { id: 'laranja', nome: 'Laranja', cores: { principal: '#D9570B', titulos: '#2B1A0E', fundo: '#FAF6F2', positivo: '#13804F', negativo: '#C21F2B' } },
  { id: 'grafite', nome: 'Grafite', cores: { principal: '#3E4C63', titulos: '#111827', fundo: '#F3F4F6', positivo: '#15803D', negativo: '#B91C1C' } },
];

const HEX = /^#[0-9a-f]{6}$/i;

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

module.exports = { CAMPOS, PALETAS, normalizar, css, versao };
