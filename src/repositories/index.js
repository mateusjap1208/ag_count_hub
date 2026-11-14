const config = require('../config');

let repos;
function getRepositories() {
  if (!repos) {
    repos = config.storageDriver === 'mongo'
      ? require('./mongo')(config.mongoUri, config.mongoDb)
      : require('./json')(config.dataDir);
  }
  return repos;
}

module.exports = getRepositories();
