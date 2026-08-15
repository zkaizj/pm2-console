/**
 * kb-vendor — 知识库编辑器 vendor bundle 入口
 * 把 @toast-ui/editor（含 prosemirror 依赖）打包为浏览器可用的独立包，
 * 挂载到 window.toastui，供 public/index.html 直接引用。
 */
import Editor from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";
import "./i18n-zh-cn.js";
window.toastui = { Editor };
