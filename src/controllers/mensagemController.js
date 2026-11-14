/** Cadastro das mensagens do rodapé (somente administradores) */
const Mensagem = require('../models/Mensagem');

const hoje = () => new Date().toISOString().slice(0, 10);
const situacao = (m) => {
  if (m.ativa === false) return 'Desativada';
  if (m.inicio && m.inicio > hoje()) return 'Agendada';
  if (m.fim && m.fim < hoje()) return 'Encerrada';
  return 'No ar';
};

async function render(res, { form, editing = null, errors = {}, error = null, flash = null }) {
  const lista = (await Mensagem.list()).map((m) => ({ ...m, situacao: situacao(m) }));
  res.render('mensagens/index', {
    title: 'Mensagens do rodapé', subtitle: 'Avisos que passam no rodapé de todas as telas', hideFilters: true,
    lista, tipos: Mensagem.TIPOS, form, editing, errors, error, flash,
  });
}

exports.index = async (req, res, next) => {
  try {
    const editing = req.query.editar ? (await Mensagem.list()).find((m) => m.id === req.query.editar) || null : null;
    const flash = req.session.flashMensagem || null;
    delete req.session.flashMensagem;
    await render(res, { form: editing || { tipo: 'info', ativa: true }, editing, flash });
  } catch (e) { next(e); }
};

exports.save = async (req, res, next) => {
  const id = req.params.id || null;
  try {
    await Mensagem.save(id, req.body, { actor: req.user });
    req.session.flashMensagem = id ? 'Mensagem atualizada.' : 'Mensagem publicada no rodapé.';
    return res.redirect('/mensagens');
  } catch (e) {
    if (e instanceof Mensagem.MensagemError) {
      res.status(422);
      return render(res, { form: { ...req.body, ativa: req.body.ativa === 'on' }, editing: id ? { id } : null, errors: e.fields || {}, error: e.message });
    }
    return next(e);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await Mensagem.remove(req.params.id);
    req.session.flashMensagem = 'Mensagem excluída.';
    return res.redirect('/mensagens');
  } catch (e) { return next(e); }
};
