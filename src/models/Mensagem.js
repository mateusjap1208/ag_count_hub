/**
 * Mensagens do rodapé (faixa que passa em todas as telas, como as cotações num telejornal).
 * Ex.: "Fechamento de outubro em andamento". Cada mensagem pode ter período de exibição (início/fim).
 */
const crypto = require('node:crypto');
const { mensagens } = require('../repositories');

class MensagemError extends Error {}
const TIPOS = { info: 'Informativo', alerta: 'Atenção', urgente: 'Urgente' };

let cache = null; // { at, list }
const CACHE_MS = 30 * 1000;
const limpar = () => { cache = null; };

async function list() { return mensagens.list(); }

/** Mensagens que devem aparecer agora (ativas e dentro do período) */
async function ativas(hoje = new Date().toISOString().slice(0, 10)) {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), list: await mensagens.list() };
  return cache.list.filter((m) => m.ativa !== false && (!m.inicio || m.inicio <= hoje) && (!m.fim || m.fim >= hoje));
}

function normalize(input) {
  const data = {
    texto: String(input.texto || '').replace(/\s+/g, ' ').trim(),
    tipo: TIPOS[input.tipo] ? input.tipo : 'info',
    inicio: /^\d{4}-\d{2}-\d{2}$/.test(input.inicio || '') ? input.inicio : '',
    fim: /^\d{4}-\d{2}-\d{2}$/.test(input.fim || '') ? input.fim : '',
    ativa: input.ativa === 'on' || input.ativa === true || input.ativa === '1',
  };
  const errors = {};
  if (data.texto.length < 3) errors.texto = 'Escreva a mensagem.';
  else if (data.texto.length > 200) errors.texto = 'Use no máximo 200 caracteres.';
  if (data.inicio && data.fim && data.fim < data.inicio) errors.fim = 'O fim precisa ser depois do início.';
  return { data, errors };
}

async function save(id, input, { actor } = {}) {
  const { data, errors } = normalize(input);
  if (Object.keys(errors).length) { const e = new MensagemError('Verifique os campos destacados.'); e.fields = errors; throw e; }
  const atual = id ? (await mensagens.list()).find((m) => m.id === id) : null;
  if (id && !atual) throw new MensagemError('Mensagem não encontrada.');
  const now = new Date().toISOString();
  const m = { ...(atual || { id: crypto.randomUUID(), createdAt: now }), ...data, updatedAt: now, updatedBy: actor?.name || actor?.email || '' };
  await mensagens.save(m);
  limpar();
  return m;
}

async function remove(id) { await mensagens.remove(id); limpar(); }

module.exports = { list, ativas, save, remove, TIPOS, MensagemError };
