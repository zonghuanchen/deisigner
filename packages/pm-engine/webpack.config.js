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
    alias: {
      '@designer/assets': path.resolve(__dirname, '../assets'),
    },
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
    '@designer/core': {
      commonjs: '@designer/core',
      commonjs2: '@designer/core',
      amd: '@designer/core',
      root: 'DesignerCore',
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
      {
        test: /\.(png|jpe?g|gif|svg|webp|glb|gltf)$/i,
        type: 'asset/resource',
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
      name: 'DesignerPmEngine',
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
    clean: false,
  },
  externals: {
    three: 'three',
    '@jscad/modeling': '@jscad/modeling',
    '@designer/core': '@designer/core',
  },
  experiments: {
    outputModule: true,
  },
};

module.exports = [cjsConfig, esmConfig];
