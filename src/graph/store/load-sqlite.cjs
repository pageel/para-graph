module.exports = function() {
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  
  if (nodeMajor >= 22) {
    const { DatabaseSync } = require('node:sqlite');
    
    // Polyfill db.transaction() for node:sqlite to maintain API compatibility with better-sqlite3
    if (typeof DatabaseSync.prototype.transaction !== 'function') {
      DatabaseSync.prototype.transaction = function(fn) {
        return (...args) => {
          this.exec('BEGIN');
          try {
            const result = fn(...args);
            this.exec('COMMIT');
            return result;
          } catch (err) {
            this.exec('ROLLBACK');
            throw err;
          }
        };
      };
    }
    
    return DatabaseSync;
  }
  
  return require('better-sqlite3');
};
