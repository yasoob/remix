import * as path from "node:path";
import fse from "fs-extra";
import type * as esbuild from "esbuild";
import postcss from "postcss";
import postcssDiscardDuplicates from "postcss-discard-duplicates";

import type { Context } from "../context";

export async function write(ctx: Context, outputFiles: esbuild.OutputFile[]) {
  let cssBundleFile = outputFiles.find((outputFile) =>
    isCssBundleFile(ctx, outputFile, ".css")
  );
  if (!cssBundleFile) return;

  let cssBundlePath = cssBundleFile.path;

  let { css, map } = await postcss([
    // We need to discard duplicate rules since "composes"
    // in CSS Modules can result in duplicate styles
    postcssDiscardDuplicates(),
  ]).process(cssBundleFile.text, {
    from: cssBundlePath,
    to: cssBundlePath,
    map: ctx.options.sourcemap && {
      prev: outputFiles.find((outputFile) =>
        isCssBundleFile(ctx, outputFile, ".css.map")
      )?.text,
      inline: false,
      annotation: false,
      sourcesContent: true,
    },
  });

  await fse.ensureDir(path.dirname(cssBundlePath));

  await Promise.all([
    fse.writeFile(cssBundlePath, css),
    ctx.options.mode !== "production" && map
      ? fse.writeFile(`${cssBundlePath}.map`, map.toString()) // Write our updated source map rather than esbuild's
      : null,
    ...outputFiles
      .filter((outputFile) => !/\.(css|js|map)$/.test(outputFile.path))
      .map(async (asset) => {
        await fse.ensureDir(path.dirname(asset.path));
        await fse.writeFile(asset.path, asset.contents);
      }),
  ]);
}

function isCssBundleFile(
  ctx: Context,
  outputFile: esbuild.OutputFile,
  extension: ".css" | ".css.map"
): boolean {
  return (
    path.dirname(outputFile.path) === ctx.config.assetsBuildDirectory &&
    path.basename(outputFile.path).startsWith("css-bundle") &&
    outputFile.path.endsWith(extension)
  );
}

type GroupedCssBundleFiles = {
  css?: esbuild.OutputFile;
  sourceMap?: esbuild.OutputFile;
  assets: esbuild.OutputFile[];
}

export function groupCssBundleFiles(
  ctx: Context,
  files: esbuild.OutputFile[]
): GroupedCssBundleFiles {
  let groupedFiles: GroupedCssBundleFiles = {
    css: undefined,
    sourceMap: undefined,
    assets: [],
  };

  for (let file of files) {
    if (isCssBundleFile(ctx, file, ".css")) {
      groupedFiles.css = file;
    } else if (isCssBundleFile(ctx, file, ".css.map")) {
      groupedFiles.sourceMap = file;
    } else {
      groupedFiles.assets.push(file);
    }
  }

  return groupedFiles;
}
