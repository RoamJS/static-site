const Dotenv = require("dotenv-webpack");
const path = require("path");

module.exports = {
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
        exclude: /node_modules/,
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
  node: {
    // Make sure that __dirname works in node env
    __dirname: true,
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
