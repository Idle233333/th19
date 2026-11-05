# TH19 网页版移植

此目录可以直接作为独立仓库根目录。运行、构建所需的游戏文件均在本目录内，不依赖 launcher、旧 test13 或相邻目录。

## 运行

需要 Node.js 22 或更新版本。无需 npm install；运行脚本只使用 Node.js 内置模块。

双击“启动兽王园.bat”，或在本目录运行：

```sh
npm start
```

访问 http://127.0.0.1:8130/。服务监听 0.0.0.0:8130，可通过这台电脑的 IP 访问。此独立入口直接进入游戏，存档保存在浏览器 IndexedDB 中。首次操作后浏览器才允许播放声音。

## 操作和对局规则

- 方向键移动，Z 射击 / 确认，Shift 低速，**X 按住蓄力、松开释放，C Bomb**，Esc 暂停 / 返回。
- 手机、平板自动显示触屏按键；电脑可点右上角“触屏按键”显示。左下是方向键，右下有独立的 X「蓄力」、C「Bomb」、射击、低速和暂停键。也可以在游戏画面拖动移动、点击确认。取消触控或切换窗口会释放按键。
- 对局双方默认各 **5 条命**，菜单中的生命数统一调整 1–5，双方保持一致。
- 固定无时间限制，屏障固定手动蓄力恢复。菜单不再提供时间和屏障恢复方式的调整项。
- Easy / Normal / Hard / Lunatic 分别使用难度索引 0 / 1 / 2 / 3，双方脚本和 CPU 使用同一难度。
- 原生菜单和战斗音效使用即时输出，重复播放会从头开始。

这里是 TH19 独立入口。多作品游戏库、联机房间大厅和存档导入导出由 eagler-touhou 启动器提供；本仓库保留其运行协议和联机运行层。

## 文件归属

| 路径 | 用途 |
| --- | --- |
| cpp/game、cpp/sdl | C++ 游戏逻辑与游戏侧渲染接口，含生成好的文字与数据头文件 |
| portable/sdl、portable/input、portable/compat | SDL/GLES 渲染器、触控和本仓库自带的兼容接口 |
| fonts | 保留的字体子集资源 |
| sdl-runtime | 与启动器通信的适配层源码 |
| runtime | 已编译的 WASM、JS 和适配层运行文件 |
| content/th19.dat、content/music、content/msgothic.ttf | 原版游戏数据、音乐和运行字体 |
| game-resources.json | 本体资源清单和原始资源哈希 |
| index.html、standalone.mjs、standalone.css | 独立运行入口、触屏操作与按键说明 |
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

构建使用本仓库的 portable/compat，不依赖其他仓库的 common/。字体由独立入口加载 content/msgothic.ttf 到运行文件系统，构建无需嵌入字体。运行文件的文本统一使用 LF，保证跨平台克隆后的清单哈希一致。

## 验证

```sh
npm test
```

运行传输和回滚测试，不需要安装依赖。浏览器验证需要 Chrome / Edge 和 Puppeteer Core：

```sh
npm install --no-save --package-lock=false puppeteer-core
```

先运行 npm start，在另一个终端设置 TH19_BROWSER 为浏览器可执行文件的路径，再运行 npm run test:touch、npm run test:versus、npm run test:audio。脚本可用 --url 指定服务地址，报告默认写入 artifacts/。也可通过 TH19_PUPPETEER_MODULE 指定已有 puppeteer-core 模块的绝对路径。

这些检查分别覆盖独立页面的剧情流程和真实触屏事件、四档难度与对局规则及回滚恢复、重复音效的非零 PCM 输出。

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

现有 runtime/th19.html 和 runtime/th19-multiplayer.html 保留 eagler-touhou/1 协议，普通模式与联机模式分别使用 /savesth19 和 /savesth19mp 存档。启动器可通过同源配置引用 runtime/ 和 content/；需要由宿主提供资源加载、输入和联机房间配置。直接运行本仓库使用上面的 npm start。
