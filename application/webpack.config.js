const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const config = [
  {
    site: 'index'
  },
  {
    site: 'settings'
  }
];

const entryHtmlPlugins = config.map(({
  site
}) => {
  return new HtmlWebpackPlugin({
    filename: `${site}.html`,
    chunks: [site],
    template: `./src/templates/${site}.html`
  });
});

module.exports = {
  mode: 'production',
  name: 'browser',
  entry: {
    index: './src/js/index.js',
    settings: './src/js/settings.js',
  },
  output: {
    path: __dirname + '/dist',
    filename: '[name].js',
    publicPath: './'
  },
  module: {
    // Bundle styles into main.css
    rules: [
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin(),
    new CopyPlugin({
      patterns: [
        { // Copy Shoelace assets to dist/shoelace
          from: path.resolve(__dirname, 'node_modules/@shoelace-style/shoelace/dist/assets'),
          to: path.resolve(__dirname, 'dist/shoelace/assets')
        },
        {
          from: path.resolve(__dirname, 'src/images'),
          to: path.resolve(__dirname, 'dist/images')
        },
      ]
    })
  ].concat(entryHtmlPlugins)
}