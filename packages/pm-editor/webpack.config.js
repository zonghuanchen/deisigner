const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
  context: __dirname,
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
      '@designer/assets': path.resolve(__dirname, '../assets'),
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
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                config: path.resolve(__dirname, 'postcss.config.js'),
              },
            },
          },
        ],
      },
      {
        test: /\.(png|jpe?g|gif|svg|webp)$/i,
        type: 'asset/resource',
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
