import * as esbuild from "esbuild";
import { globSync } from "glob";

const entryPoints = globSync("./public/scripts/*.js", {
    ignore: "./public/scripts/*.min.js",
});

(async () => {
    await (
        await esbuild.context({
            entryPoints: entryPoints || [],
            bundle: true,
            minify: true,
            outdir: "public",
            outbase: "public",
            outExtension: { ".js": ".min.js" },
            sourcemap: true,
        })
    ).watch();
    console.log("Esbuild is watching for changes. Press Ctrl-C to stop.");
})().catch((err) => {
    console.log(err);
    process.exit(1);
});
