const path = require('path');
const rspack = require('@rspack/core');

/** @type {import('@rspack/core').Configuration} */
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
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'typescript',
                tsx: true,
              },
              transform: {
                react: {
                  runtime: 'automatic',
                },
              },
            },
          },
        },
      },
      {
        test: /\.css$/,
        type: 'css',
        use: ['postcss-loader'],
      },
      {
        test: /\.(glb|gltf|bin|png|jpg|jpeg|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]',
        },
      },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: './index.html',
    }),
    new rspack.CopyRspackPlugin({
      patterns: [
        {
          from: 'assets',
          to: 'assets',
        },
      ],
    }),
  ],
  experiments: {
    css: true,
  },
  devServer: {
    port: 3001,
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
};
