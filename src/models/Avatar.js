/**
 * Avatar comemorativo: imagem vetorial (SVG, pode ser animada) que flutua no canto da tela
 * para todos os usuários entre as datas de início e fim. Ex.: árvore de Natal com pisca-pisca.
 * Cadastro na tela Personalizar (somente administradores); cada pessoa pode fechar o avatar.
 */
const crypto = require('node:crypto');
const { avatares } = require('../repositories');

class AvatarError extends Error {}

const MAX_BYTES = 300 * 1024;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Hoje no horário de Brasília (o servidor roda em UTC) */
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

let cache = null; // { at, list }
const CACHE_MS = 30 * 1000;
const limpar = () => { cache = null; };

async function list() { return avatares.list(); }
async function get(id) { return avatares.get(id); }

const situacao = (a, dia = hoje()) => (a.inicio > dia ? 'Agendado' : a.fim < dia ? 'Encerrado' : 'No ar');

/** Avatar que deve aparecer agora (o cadastrado mais recente dentro do período) */
async function atual(dia = hoje()) {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), list: await avatares.list() };
  return cache.list.find((a) => situacao(a, dia) === 'No ar') || null;
}

/**
 * Confere se o arquivo é um SVG "limpo": sem scripts, eventos, links externos ou conteúdo embutido.
 * (Além disso, a imagem é exibida com <img> e servida com CSP restrita: mesmo que algo passe, não executa.)
 */
function validarSvg(buffer) {
  if (!buffer || !buffer.length) return 'Cole o código SVG ou escolha o arquivo da imagem (.svg).';
  if (buffer.length > MAX_BYTES) return 'A imagem precisa ter no máximo 300 KB.';
  const svg = buffer.toString('utf8').replace(/^﻿/, '').trim();
  if (!/<svg[\s>]/i.test(svg)) return 'O arquivo não é uma imagem vetorial (SVG) válida.';
  const proibidos = [
    /<script/i, /<foreignObject/i, /<(iframe|embed|object|audio|video)\b/i,
    /\son[a-z]+\s*=/i, /javascript:/i, /@import/i,
    /(href|src)\s*=\s*["']\s*(https?:|\/\/|data:text\/html)/i, /url\(\s*["']?\s*(https?:|\/\/)/i,
  ];
  if (proibidos.some((re) => re.test(svg))) return 'A imagem tem scripts ou links externos, que não são permitidos. Gere ou exporte o SVG sem eles (só com CSS).';
  return null;
}

/**
 * Código SVG colado: aceita a resposta da IA como veio (com ```svg, <?xml ...?> ou texto em volta)
 * e fica só com o trecho <svg ...>...</svg>. Vazio → null.
 */
function extrairSvg(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  const ini = t.search(/<svg[\s>]/i);
  const fim = t.toLowerCase().lastIndexOf('</svg>');
  return ini >= 0 && fim > ini ? t.slice(ini, fim + 6) : t;
}

async function save(input, arquivo, { actor } = {}) {
  const data = {
    nome: String(input.nome || '').replace(/\s+/g, ' ').trim(),
    inicio: DATA.test(input.inicio || '') ? input.inicio : '',
    fim: DATA.test(input.fim || '') ? input.fim : '',
  };
  const errors = {};
  if (data.nome.length < 2) errors.nome = 'Dê um nome ao avatar (ex.: Natal).';
  else if (data.nome.length > 60) errors.nome = 'Use no máximo 60 caracteres.';
  if (!data.inicio) errors.inicio = 'Informe a data de início.';
  if (!data.fim) errors.fim = 'Informe a data de fim.';
  else if (data.inicio && data.fim < data.inicio) errors.fim = 'O fim precisa ser depois do início.';
  // A imagem pode vir colada (código SVG gerado por uma IA, por exemplo) ou como arquivo
  const colado = extrairSvg(input.svgTexto);
  const buffer = colado ? Buffer.from(colado, 'utf8') : arquivo?.buffer;
  const erroSvg = validarSvg(buffer);
  if (erroSvg) errors.arquivo = erroSvg;
  if (Object.keys(errors).length) { const e = new AvatarError('Verifique os campos destacados.'); e.fields = errors; throw e; }

  const now = new Date().toISOString();
  const a = {
    id: crypto.randomUUID(), ...data,
    svg: buffer.toString('utf8').replace(/^﻿/, '').trim(),
    arquivo: colado ? '(código colado)' : String(arquivo.originalname || '').slice(0, 120),
    createdAt: now, updatedAt: now, updatedBy: actor?.name || actor?.email || '',
  };
  await avatares.save(a);
  limpar();
  return a;
}

async function remove(id) { await avatares.remove(id); limpar(); }

module.exports = { list, get, atual, save, remove, situacao, hoje, extrairSvg, MAX_BYTES, AvatarError };
