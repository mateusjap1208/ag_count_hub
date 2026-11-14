/**
 * Usuários do sistema e permissões.
 *
 * Perfis:
 *   admin  → acesso total, inclusive uploads, parâmetros, obras e usuários
 *   viewer → consulta; enxerga só os centros de lucro liberados (ou todos, se "todosCentros")
 * As empresas que o usuário consulta são as que possuem algum dos seus centros de lucro.
 */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { users } = require('../repositories');

class UserError extends Error {}
const ROLES = { admin: 'Administrador', viewer: 'Consulta' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: u.active !== false,
  // Usuários antigos (sem o campo) mantêm acesso total
  todosCentros: u.role === 'admin' || u.todosCentros !== false,
  centros: u.centros || [],
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
  lastLoginAt: u.lastLoginAt,
  buildVisto: u.buildVisto, // último build cujo aviso de atualização o usuário já fechou
});

/** Conjunto de centros permitidos (null = sem restrição) e chave de cache da permissão */
function permission(user) {
  if (!user || user.role === 'admin' || user.todosCentros) return { allowed: null, key: '' };
  const centros = [...new Set((user.centros || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean))].sort();
  return { allowed: new Set(centros), key: crypto.createHash('sha1').update(centros.join(',')).digest('hex').slice(0, 12) };
}

async function authenticate(email, password) {
  const user = await users.findByEmail(String(email || '').trim());
  // Compara mesmo sem usuário para não revelar, pelo tempo de resposta, quais e-mails existem
  const hash = user?.passwordHash || '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(String(password || ''), hash);
  if (!user || !ok || user.active === false) return null;
  await users.touchLogin(user.id);
  return publicUser(user);
}

/** Valida e normaliza os dados do formulário */
function normalize(input, { creating }) {
  const data = {
    name: String(input.name || '').replace(/\s+/g, ' ').trim(),
    email: String(input.email || '').trim().toLowerCase(),
    role: input.role === 'admin' ? 'admin' : 'viewer',
    active: input.active !== false,
    todosCentros: !!input.todosCentros,
    centros: [...new Set((Array.isArray(input.centros) ? input.centros : String(input.centros || '').split(/[,;\n]/))
      .map((c) => String(c).trim().toUpperCase()).filter(Boolean))].sort(),
  };
  if (data.role === 'admin') { data.todosCentros = true; }
  const errors = {};
  if (data.name.length < 3) errors.name = 'Informe o nome completo.';
  if (!EMAIL_RE.test(data.email)) errors.email = 'Informe um e-mail válido.';
  const pwd = String(input.password || '');
  if (creating || pwd) {
    if (pwd.length < 8) errors.password = 'A senha precisa ter pelo menos 8 caracteres.';
    else if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) errors.password = 'Use letras e números na senha.';
    else if (input.passwordConfirm !== undefined && pwd !== String(input.passwordConfirm)) errors.passwordConfirm = 'A confirmação não confere com a senha.';
  }
  if (data.role === 'viewer' && !data.todosCentros && !data.centros.length) {
    errors.centros = 'Selecione pelo menos um centro de lucro ou marque "Todos os centros de lucro".';
  }
  return { data, pwd, errors };
}

const fail = (errors) => { const e = new UserError('Verifique os campos destacados.'); e.fields = errors; throw e; };

async function create(input) {
  const { data, pwd, errors } = normalize(input, { creating: true });
  if (Object.keys(errors).length) fail(errors);
  const passwordHash = await bcrypt.hash(pwd, 10);
  try {
    return publicUser(await users.create({ ...data, passwordHash }));
  } catch (e) {
    if (/e-mail já cadastrado/i.test(e.message)) fail({ email: 'Já existe um usuário com este e-mail.' });
    throw e;
  }
}

async function update(id, input, { actor } = {}) {
  const current = await users.findById(id);
  if (!current) throw new UserError('Usuário não encontrado.');
  const { data, pwd, errors } = normalize(input, { creating: false });
  // Proteções: ninguém tira o próprio acesso de administrador nem se desativa; sempre resta um administrador ativo
  if (actor?.id === id && current.role === 'admin' && data.role !== 'admin') errors.role = 'Você não pode remover o seu próprio perfil de administrador.';
  if (actor?.id === id && !data.active) errors.active = 'Você não pode desativar o seu próprio usuário.';
  if (current.role === 'admin' && (data.role !== 'admin' || !data.active)) {
    const admins = (await users.list()).filter((u) => u.role === 'admin' && u.active !== false && u.id !== id);
    if (!admins.length) errors.role = 'É preciso manter pelo menos um administrador ativo.';
  }
  if (Object.keys(errors).length) fail(errors);
  const patch = { ...data };
  if (pwd) patch.passwordHash = await bcrypt.hash(pwd, 10);
  try {
    return publicUser(await users.update(id, patch));
  } catch (e) {
    if (/e-mail já cadastrado/i.test(e.message)) fail({ email: 'Já existe um usuário com este e-mail.' });
    throw e;
  }
}

async function remove(id, { actor } = {}) {
  const u = await users.findById(id);
  if (!u) return;
  if (actor?.id === id) throw new UserError('Você não pode excluir o seu próprio usuário.');
  if (u.role === 'admin') {
    const admins = (await users.list()).filter((x) => x.role === 'admin' && x.active !== false && x.id !== id);
    if (!admins.length) throw new UserError('É preciso manter pelo menos um administrador ativo.');
  }
  await users.remove(id);
}

/** Marca o aviso de atualização como visto até o build informado */
async function markSeen(id, build) { await users.setBuildVisto(id, build); }

async function list() { return (await users.list()).map(publicUser); }
async function get(id) { const u = await users.findById(id); return u ? publicUser(u) : null; }

module.exports = { markSeen, authenticate, create, update, remove, list, get, permission, publicUser, ROLES, UserError, findByEmail: users.findByEmail };
