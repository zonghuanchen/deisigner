/**
 * Build runner for @designer/app
 *
 * Changes to this package's directory and invokes webpack-cli from the
 * monorepo root, working around shells that block .ps1 script execution.
 *
 * Usage:  node build.js          (from anywhere)
 */
const path = require('path');
process.chdir(__dirname);
const rootDir = path.resolve(__dirname, '../..');
process.argv = [process.argv[0], process.argv[1], '--config', './webpack.config.js'];
require(require.resolve('webpack-cli/bin/cli.js', { paths: [rootDir] }));
