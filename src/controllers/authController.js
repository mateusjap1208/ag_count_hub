const User = require('../models/User');

exports.showLogin = (req, res) => {
  res.set('Cache-Control', 'no-store'); // nunca reaproveitar a página com um token antigo
  res.render('auth/login', { error: null, email: '' });
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.authenticate(email, password);
    if (!user) {
      return res.status(401).render('auth/login', { error: 'E-mail ou senha inválidos.', email: email || '' });
    }
    const returnTo = req.session.returnTo;
    // Regenera a sessão no login (evita fixação de sessão)
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = user;
      const safeReturn = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
      req.session.save(() => res.redirect(safeReturn));
    });
  } catch (e) { next(e); }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('agch.sid');
    res.redirect('/login');
  });
};
