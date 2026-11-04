# TH19 Web 游戏本体

此目录可以直接作为独立仓库根目录。运行、构建所需的游戏文件均在本目录内，不依赖 launcher、旧 test13 或相邻目录。

## 运行

需要 Node.js 22 或更新版本。无需 npm install；运行脚本只使用 Node.js 内置模块。

双击“启动兽王园.bat”，或在本目录运行：

```sh
npm start
```

访问 http://127.0.0.1:8130/。服务监听 0.0.0.0:8130，可通过这台电脑的 IP 访问。此独立入口直接进入原游戏，不包含启动器的游戏库、存档导入导出或触控设置面板；游戏存档仍保存在浏览器 IndexedDB 中，游戏自身菜单和键盘操作继续可用。

## 文件归属

| 路径 | 用途 |
| --- | --- |
| cpp/game、cpp/sdl | C++ 游戏逻辑与游戏侧渲染接口，含生成好的文字与数据头文件 |
| portable/sdl | 本体使用的 SDL/GLES 渲染器和第三方头文件 |
| fonts | 编译时嵌入的字体 |
| sdl-runtime | 与启动器通信的适配层源码 |
| runtime | 已编译的 WASM、JS 和适配层运行文件 |
| content/th19.dat、content/music、content/msgothic.ttf | 原版游戏数据、音乐和运行字体 |
| game-resources.json | 本体资源清单和原始资源哈希 |
| index.html、standalone.mjs | 独立运行入口，复用现有游戏适配协议 |
| scripts、serve.mjs | 构建、文件完整性检查和静态服务器 |

## 修改并重新编译

需要 Python 3 和已安装、激活的 Emscripten SDK（含 SDL3 port）。无需把 SDK 提交到本仓库。

先激活 emsdk_env，使 EMSDK 环境变量生效，或手动设置 TH19_EMSDK：

```powershell
$env:TH19_EMSDK='D:\tools\emsdk'
npm run build
```

```sh
export TH19_EMSDK=/opt/emsdk
npm run build
```

编译器支持标准 upstream/emscripten 和 install/emscripten 布局。可通过 TH19_PYTHON 指定 Python，通过 TH19_EM_CONFIG 指定 Emscripten 配置。构建直接更新本目录 runtime/，中间文件放在 work/build/，已由 .gitignore 忽略。

需要先验证候选运行包时，可设置 TH19_OUTPUT_DIR，将产物输出到指定目录。运行适配层对只读原版数据和音乐使用 MEMFS 的 canOwn 选项，以减少内存中的资源副本；不用于存档导入或回滚数据。

```sh
npm run check
```

检查原版数据、音乐及运行包的哈希和本体文件是否齐全。

## 上传仓库

content/th19.dat 超过 GitHub 普通 Git 的 100 MiB 单文件上限，已在 .gitattributes 中配置 Git LFS。上传前安装 Git LFS，再执行：

```sh
git lfs install
git init
git add .
git commit -m "Import TH19 Web"
```

从仓库克隆后执行 git lfs pull，确保 content/th19.dat 是完整数据而不是 LFS 指针。无需为运行安装 Git LFS；只有从 LFS 仓库获取资源或上传仓库时需要。

## 接入独立启动器

现有 runtime/th19.html 保留 eagler-touhou/1 协议。启动器可以通过配置引用 runtime/ 和 content/，不必复制本体文件到启动器内部。父目录的 serve.mjs 已将本目录挂载到 /th19_web/，并将 launcher/ 挂载到网站根路径。
