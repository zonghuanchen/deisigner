const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    main: './src/editor/index.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@app': path.resolve(__dirname, 'src/app'),
      '@editor': path.resolve(__dirname, 'src/editor'),
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
          from: 'assets',
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
        directory: path.resolve(__dirname, 'src'),
      },
      {
        directory: path.resolve(__dirname, 'assets'),
        publicPath: '/assets',
      },
    ],
  },
  mode: 'development',
  devtool: 'source-map',
};
