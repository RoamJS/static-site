const esbuild = require("esbuild");
const fs = require('fs');

esbuild
  .build({
    entryPoints: ["./action/index.ts"],
    platform: "node",
    minify: true,
    bundle: true,
    outdir: "action",
    external: ["canvas", "re2"],
    target: "node12",
    plugins: [
      {
        name: "jsdom-patch",
        setup: (build) => {
          build.onLoad({ filter: /XMLHttpRequest-impl\.js$/ }, async (args) => {
            let contents = await fs.promises.readFile(args.path, "utf8");

            contents = contents.replace(
              'const syncWorkerFile = require.resolve ? require.resolve("./xhr-sync-worker.js") : null;',
              `const syncWorkerFile = null;`
            );

            return { contents, loader: "js" };
          });
        },
      },
    ],
    define: {
      "process.env.CLIENT_SIDE": "true",
      "process.env.BLUEPRINT_NAMESPACE": '"bp3"',
    },
  })
  .then((e) => console.log("done", e));
