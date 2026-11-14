/**
 * Avisos de atualização: compara o build publicado com o último build que o usuário já viu.
 * Usuário que nunca viu um aviso recebe só o da versão atual (não o histórico inteiro).
 */
const versao = require('../config/versao');
const lista = require('../config/novidades');

const ordenadas = [...lista].sort((a, b) => b.build - a.build);
const rotulo = (build) => `v${versao.version}.${build}`;

/** Situação das novidades para um usuário: aviso pendente e o que mostrar nele */
function paraUsuario(user) {
  const visto = Number.isFinite(Number(user?.buildVisto)) ? Number(user.buildVisto) : versao.build - 1;
  const pendente = visto < versao.build;
  const novas = ordenadas.filter((n) => n.build > visto && n.build <= versao.build).map((n) => ({ ...n, versao: rotulo(n.build) }));
  return {
    atual: versao.label,
    build: versao.build,
    pendente,
    // Versão publicada sem texto de novidades: aviso genérico
    novas: novas.length || !pendente ? novas : [{ build: versao.build, versao: versao.label, titulo: 'O sistema foi atualizado', itens: ['Melhorias e correções.'] }],
  };
}

/** Histórico completo para a tela de Novidades */
function historico() {
  return ordenadas.filter((n) => n.build <= versao.build).map((n) => ({ ...n, versao: rotulo(n.build) }));
}

module.exports = { paraUsuario, historico };
