/** Proteção CSRF simples (token sincronizado na sessão). */
const crypto = require('node:crypto');

function csrfToken(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  next();
}

function verifyCsrf(req, res, next) {
  const sent = req.body?._csrf || req.get('x-csrf-token');
  const expected = req.session?.csrf;
  if (expected && sent && sent.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) return next();
  const err = new Error('Formulário expirado. Recarregue a página e tente novamente.');
  err.status = 403;
  return next(err);
}

module.exports = { csrfToken, verifyCsrf };
