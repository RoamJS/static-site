const esbuild = require("esbuild");
const fs = require("fs");

const extensions = fs.readdirSync("./components/");
const entryPoints = Object.fromEntries(
  extensions.map((e) => [
    e
      .substring(0, e.length - 4)
      .split(/(?=[A-Z])/)
      .map((s) => s.toLowerCase())
      .join("-"),
    `./components/${e}`,
  ])
);

esbuild
  .build({
    entryPoints,
    minify: true,
    bundle: true,
    outdir: "build",
    define: {
      "process.env.CLIENT_SIDE": "true",
    },
  })
  .then((e) => console.log("done", e));
