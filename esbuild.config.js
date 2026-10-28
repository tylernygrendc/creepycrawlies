import * as esbuild from "esbuild";
import { globSync } from "glob";

const entryPoints = globSync("./public/scripts/*.js", {
    ignore: "./public/scripts/*.min.js",
});

await esbuild.build({
    entryPoints: entryPoints || [],
    bundle: true,
    minify: true,
    outdir: "public",
    outbase: "public",
    outExtension: { ".js": ".min.js" },
    sourcemap: true,
});
