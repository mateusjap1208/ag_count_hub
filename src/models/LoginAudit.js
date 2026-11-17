/**
 * Auditoria de login: registra no banco cada tentativa de entrada no sistema
 * (quem, quando, de onde e se deu certo). Horários gravados em UTC (ISO) e
 * exibidos no horário de Brasília (fmt.dateTime).
 */
const crypto = require('node:crypto');
const { logins } = require('../repositories');

const TZ_OFFSET = '-03:00'; // Brasília (sem horário de verão desde 2019)
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Grava a tentativa; nunca derruba o login se o banco falhar */
async function registrar(req, { user = null, email = '', sucesso, motivo = null }) {
  try {
    await logins.add({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      sucesso: !!sucesso,
      motivo,
      userId: user?.id || null,
      nome: user?.name || null,
      email: String(user?.email || email || '').trim().slice(0, 200),
      perfil: user?.role || null,
      ip: String(req.ip || '').slice(0, 64),
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
    });
  } catch (e) {
    console.error('[auditoria-login] falha ao registrar:', e.message);
  }
}

/** Filtros da tela: datas DD/MM/AAAA viram limites em UTC considerando o fuso de Brasília */
async function listar({ q = '', de = '', ate = '', resultado = '' } = {}) {
  const ini = DATA_RE.test(de) ? new Date(`${de}T00:00:00${TZ_OFFSET}`).toISOString() : null;
  const fim = DATA_RE.test(ate) ? new Date(new Date(`${ate}T00:00:00${TZ_OFFSET}`).getTime() + 864e5).toISOString() : null;
  return logins.list({ q: String(q).trim().slice(0, 100), de: ini, ate: fim, resultado: ['sucesso', 'falha'].includes(resultado) ? resultado : '' });
}

/** Navegador e sistema em texto curto, a partir do user-agent */
function dispositivo(ua = '') {
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Outro';
  const so = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return so ? `${nav} · ${so}` : nav;
}

module.exports = { registrar, listar, dispositivo };
