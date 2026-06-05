const path = require('path');
const fs = require('fs');

// Reads package.json and generates a publish-ready dist/package.json
class EmitPackageJsonPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('EmitPackageJsonPlugin', () => {
      const rootPkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
      );
      const distPkg = {
        name: rootPkg.name,
        version: rootPkg.version,
        description: rootPkg.description,
        main: 'index.js',
        module: 'index.mjs',
        types: 'index.d.ts',
        peerDependencies: rootPkg.peerDependencies,
        dependencies: rootPkg.dependencies,
        publishConfig: rootPkg.publishConfig,
        license: rootPkg.license,
      };
      fs.writeFileSync(
        path.resolve(__dirname, 'dist', 'package.json'),
        JSON.stringify(distPkg, null, 2) + '\n'
      );
    });
  }
}

// Externals function: externalize three, pixi.js, react, react-dom, and all @designer/core paths
function makeExternals(isEsm) {
  const exactExternals = {
    three: isEsm ? 'module three' : { commonjs: 'three', commonjs2: 'three', amd: 'three', root: 'THREE' },
    'pixi.js': isEsm ? 'module pixi.js' : { commonjs: 'pixi.js', commonjs2: 'pixi.js', amd: 'pixi.js', root: 'PIXI' },
    react: isEsm ? 'module react' : { commonjs: 'react', commonjs2: 'react', amd: 'react', root: 'React' },
    'react-dom': isEsm ? 'module react-dom' : { commonjs: 'react-dom', commonjs2: 'react-dom', amd: 'react-dom', root: 'ReactDOM' },
  };

  return function ({ request }, callback) {
    if (exactExternals[request]) {
      return callback(null, exactExternals[request]);
    }
    // Externalize all @designer/core and @designer/core/* imports
    if (request === '@designer/core' || request.startsWith('@designer/core/')) {
      if (isEsm) {
        return callback(null, 'module ' + request);
      }
      // For UMD, map to the root package
      return callback(null, { commonjs: request, commonjs2: request, amd: request, root: 'DesignerCore' });
    }
    callback();
  };
}

const rimraf = require('rimraf');
const distDir = path.resolve(__dirname, 'dist');
rimraf.sync(distDir);

const commonConfig = {
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  externals: [makeExternals(false)],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            configFile: path.resolve(__dirname, 'tsconfig.build.json'),
          },
        },
      },
    ],
  },
  mode: 'production',
  devtool: 'source-map',
};

// CommonJS / UMD build
const cjsConfig = {
  ...commonConfig,
  name: 'cjs',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    library: {
      name: 'DesignerApp',
      type: 'umd',
    },
    globalObject: 'this',
    clean: false,
  },
  plugins: [new EmitPackageJsonPlugin()],
};

// ESM build
const esmConfig = {
  ...commonConfig,
  name: 'esm',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.mjs',
    library: {
      type: 'module',
    },
    clean: false,
  },
  externals: [makeExternals(true)],
  experiments: {
    outputModule: true,
  },
};

module.exports = [cjsConfig, esmConfig];
