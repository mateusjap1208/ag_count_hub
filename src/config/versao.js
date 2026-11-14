/** Versão do sistema (version.json): "version" muda à mão; "build" soma +1 a cada commit */
const v = require('../../version.json');

module.exports = { version: v.version, build: Number(v.build) || 0, label: `v${v.version}.${v.build}` };
