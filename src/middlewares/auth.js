/**
 * Autenticação e autorização.
 * A cada requisição o usuário é recarregado do banco (com cache curto), para que mudanças
 * de perfil, centros de lucro liberados ou desativação valham imediatamente.
 */
const User = require('../models/User');
const Telas = require('../config/telas');

const CACHE_MS = 15 * 1000;
const cache = new Map(); // id → { user, at }

async function freshUser(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;
  const user = await User.get(id);
  cache.set(id, { user, at: Date.now() });
  return user;
}
/** Chamado após editar/excluir usuários */
function invalidateUser(id) { if (id) cache.delete(id); else cache.clear(); }

async function requireAuth(req, res, next) {
  try {
    const sid = req.session?.user?.id;
    const user = sid ? await freshUser(sid) : null;
    if (!user || !user.active) {
      if (sid) return req.session.destroy(() => (req.path.startsWith('/api/') ? res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' }) : res.redirect('/login')));
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    req.session.user = user;
    req.user = user;
    req.permission = User.permission(user);
    return next();
  } catch (e) { return next(e); }
}

function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  const err = new Error('Acesso restrito a administradores.');
  err.status = 403;
  return next(err);
}

/**
 * Bloqueia telas não liberadas para o usuário (cadastro de Usuários → Telas liberadas).
 * tela: id fixo ('indicadores') ou função (req) => id/slug do módulo.
 */
function requireTela(tela) {
  return (req, res, next) => {
    const id = typeof tela === 'function' ? tela(req) : tela;
    if (Telas.podeVer(req.user, id)) return next();
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Você não tem acesso a esta tela.' });
    const err = new Error('Você não tem acesso a esta tela. Peça a liberação a um administrador.');
    err.status = 403;
    return next(err);
  };
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session?.user) return res.redirect('/');
  return next();
}

module.exports = { requireAuth, requireAdmin, requireTela, redirectIfAuthenticated, invalidateUser };
