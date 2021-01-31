const Dotenv = require("dotenv-webpack");
const path = require("path");

module.exports = {
  entry: {
    deploy: "./src/deploy.ts",
    launch: "./src/launch.ts",
    shutdown: "./src/shutdown.ts",
    "origin-request": "./src/origin-request.ts",
    complete: "./src/complete.ts",
  },
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
  output: {
    libraryTarget: "commonjs2",
    path: path.join(__dirname, "out"),
    filename: "[name].js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  node: {
    __dirname: true,
  },
  externals: ["aws-sdk"],
  plugins: [
    new Dotenv({
      path: ".env.local",
      silent: true,
    }),
  ],
};
