const { companies } = require('../repositories');

/**
 * Empresas cadastradas. Sem nome real cadastrado, a empresa é exibida só pelo código ("1000");
 * com o parâmetro T001 carregado, o nome dele é usado ("1000 · Nome").
 */
async function list() {
  const all = await companies.list();
  const Parameter = require('./Parameter');
  const out = [];
  for (const c of all) {
    const provisorio = !c.name || c.name === c.code || /^Empresa \S+$/.test(c.name);
    const fromParam = provisorio ? await Parameter.nameOf('empresas', c.code).catch(() => null) : null;
    out.push({ ...c, name: fromParam || (provisorio ? c.code : c.name) });
  }
  return out;
}

async function upsert({ code, name }) {
  code = String(code || '').trim();
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(code)) throw new Error('Código da empresa inválido (use letras, números, "-" ou "_").');
  if (!name) throw new Error('Informe o nome da empresa.');
  await companies.upsert({ code, name });
  return { code, name };
}

module.exports = { list, upsert };
