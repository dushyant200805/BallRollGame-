/* Loads the browser core modules into Node (they attach to globalThis.BP). */
const path = require('path');

const CORE = ['constants', 'tiles', 'rng', 'board', 'pathfinding', 'generator', 'session'];

module.exports = function loadCore({ withLevels = false } = {}) {
  const root = path.join(__dirname, '..', 'js');
  CORE.forEach((name) => require(path.join(root, 'core', name + '.js')));
  if (withLevels) {
    require(path.join(root, 'data', 'levels.js'));
    require(path.join(root, 'game', 'level-manager.js'));
  }
  return globalThis.BP;
};
