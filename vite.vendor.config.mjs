import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// 知识库编辑器 vendor 打包：输出到 public/vendor/
export default defineConfig({
  publicDir: false, // 不复制 public/ 里的静态资源（outDir 就是 public/vendor）
  build: {
    lib: {
      entry: resolve(__dirname, "kb-vendor/main.js"),
      name: "toastui",
      formats: ["iife"],
      fileName: () => "kb-vendor.js"
    },
    outDir: resolve(__dirname, "public/vendor"),
    emptyOutDir: false,
    cssFileName: "kb-vendor",
    minify: "esbuild",
    target: "chrome120"
  }
});
