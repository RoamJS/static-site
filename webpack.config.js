const Dotenv = require("dotenv-webpack");
const path = require("path");

module.exports = {
  entry: "./src/index.ts",
  target: "node",
  mode: "development",
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
            },
          },
        ],
      },
      {
        test: /\.br$/,
        use: [
          {
            loader: "file-loader",
            options: {
              name: "[path][name].[ext]",
            },
          },
        ],
      },
    ],
  },
  output: {
    libraryTarget: "commonjs2",
    path: path.join(__dirname, "out"),
    filename: "deploy.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  plugins: [
    new Dotenv({
      path: ".env.local",
      silent: true
    }),
  ],
};
