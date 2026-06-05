const path = require('path');

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
      '@designer/pm-engine': path.resolve(__dirname, '../pm-engine/src'),
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
    ],
  },
  plugins: [
    new (require('html-webpack-plugin'))({
      template: './index.html',
    }),
  ],
  devServer: {
    port: 3008,
    hot: true,
  },
  mode: 'development',
  devtool: 'source-map',
};
