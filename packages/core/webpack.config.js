const path = require('path');
const fs = require('fs');

// Reads root package.json and generates a publish-ready dist/package.json
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

const commonConfig = {
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  externals: {
    three: {
      commonjs: 'three',
      commonjs2: 'three',
      amd: 'three',
      root: 'THREE',
    },
    '@jscad/modeling': {
      commonjs: '@jscad/modeling',
      commonjs2: '@jscad/modeling',
      amd: '@jscad/modeling',
      root: 'jscadModeling',
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
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
      name: 'DesignerCore',
      type: 'umd',
    },
    globalObject: 'this',
    clean: true,
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
    clean: false, // don't clean dist since cjs runs first
  },
  externals: {
    three: 'three',
    '@jscad/modeling': '@jscad/modeling',
  },
  experiments: {
    outputModule: true,
  },
};

module.exports = [cjsConfig, esmConfig];
