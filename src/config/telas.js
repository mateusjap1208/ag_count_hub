/**
 * Telas (relatórios) que podem ser liberadas por usuário no cadastro de Usuários.
 * Administradores veem todas. Usuários de consulta veem todas ("todasTelas") ou só as marcadas.
 * Usuários antigos, sem o campo, continuam vendo todas.
 * Telas de administração (upload, obras, parâmetros, usuários…) seguem só para administradores.
 */
const { modules, bySlug } = require('./modules');

/** Ordem do menu (só a navegação; módulos fora da lista vão para o fim, na ordem original) */
const ORDEM_MENU = ['bp', 'dre', 'capital-empregado', 'clientes', 'adiantamentos', 'estoque', 'seguros-garantias', 'imobilizado', 'fornecedores', 'receita-poc', 'arrendamento'];
const posMenu = (m) => { const i = ORDEM_MENU.indexOf(m.slug); return i < 0 ? ORDEM_MENU.length : i; };

/** Módulos do menu na ordem de exibição */
const MODULOS_MENU = modules.filter((m) => !m.hideInMenu).map((m, i) => ({ m, i }))
  .sort((a, b) => posMenu(a.m) - posMenu(b.m) || a.i - b.i).map((x) => x.m);

/** Lista de telas para o formulário: Visão Geral, módulos do menu, Indicadores Contábeis e Relatórios (após o Arrendamento) */
const TELAS = [{ id: 'visao-geral', label: 'Visão Geral', path: '/' }];
for (const m of MODULOS_MENU) {
  TELAS.push({ id: m.slug, label: m.menu, path: `/modulos/${m.slug}` });
  if (m.slug === 'arrendamento') TELAS.push({ id: 'indicadores', label: 'Indicadores Contábeis', path: '/indicadores' }, { id: 'relatorios', label: 'Relatórios', path: '/relatorios' });
}
const IDS = new Set(TELAS.map((t) => t.id));

/** Tela de um módulo: abas escondidas (ex.: Receita · Medição) usam a permissão do item do menu */
function telaDoModulo(slug) {
  const m = bySlug[slug];
  if (!m) return null;
  if (!m.hideInMenu) return m.slug;
  const pai = MODULOS_MENU.find((x) => (x.tabs || []).some((t) => t.slug === slug));
  return pai ? pai.slug : m.slug;
}

const todasTelas = (user) => !user || user.role === 'admin' || user.todasTelas !== false;

/** O usuário pode ver a tela? (id da tela ou slug de módulo) */
function podeVer(user, id) {
  if (!user) return false;
  if (todasTelas(user)) return true;
  const tela = IDS.has(id) ? id : telaDoModulo(id);
  return !!tela && (user.telas || []).includes(tela);
}

/** Primeira tela liberada (para onde mandar quem não tem a Visão Geral) */
const primeiraTela = (user) => TELAS.find((t) => podeVer(user, t.id)) || null;

/** Limpa a lista vinda do formulário: só ids válidos, na ordem do menu */
const normalizar = (lista) => {
  const set = new Set((Array.isArray(lista) ? lista : String(lista || '').split(',')).map((s) => String(s).trim()));
  return TELAS.map((t) => t.id).filter((id) => set.has(id));
};

module.exports = { TELAS, ORDEM_MENU, MODULOS_MENU, telaDoModulo, podeVer, primeiraTela, normalizar };
