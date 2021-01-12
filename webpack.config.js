const Dotenv = require("dotenv-webpack");
const path = require("path");

module.exports = {
  devtool: "inline-source-map",
  entry: "./src/index.ts",
  target: "node",
  mode: "production",
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
    libraryTarget: "commonjs",
    path: path.join(__dirname, "out"),
    filename: "deploy.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  plugins: [
    new Dotenv({
      path: ".env",
      systemvars: true,
    }),
  ],
};
