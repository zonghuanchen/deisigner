const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const assetsDir = path.join(__dirname, '..', 'assets');

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    main: './src/index.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      '@designer/core': path.resolve(__dirname, '../core/src'),
      '@designer/app': path.resolve(__dirname, '../app/src'),
    },
    fallback: {
      path: false,
      fs: false,
      crypto: false,
      child_process: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            configFile: path.resolve(__dirname, 'tsconfig.webpack.json'),
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(glb|gltf|bin|png|jpg|jpeg|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]',
        },
      },
      {
        test: /\.wasm$/,
        type: 'javascript/auto',
        loader: 'file-loader',
        options: {
          publicPath: '../../wasm/',
          outputPath: 'wasm/',
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: '**/*',
          context: assetsDir,
          to: 'assets',
        },
      ],
    }),
  ],
  devServer: {
    port: 3007,
    hot: true,
    static: [
      {
        directory: assetsDir,
        publicPath: '/assets',
      },
    ],
  },
  mode: 'development',
  devtool: 'source-map',
};
