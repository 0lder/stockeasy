# StockEasy 📈

问财数据查询工具 + Web UI — **纯 Node.js/TypeScript 实现，零 Python 依赖。**

支持命令行 CLI 和 Web 界面两种方式查询 A 股市场数据，使用自然语言即可。

---

## 项目结构

```
stockeasy/
├── server/
│   ├── src/
│   │   ├── index.ts              # Express 后端服务入口
│   │   ├── wencai.ts             # 问财 API 纯 TypeScript 实现 ✨
│   │   └── hexin-v.bundle.js     # 同花顺令牌生成器 (自包含)
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.tsx               # React 主界面 (苹果设计风格)
│   │   └── App.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── README.md
```

## ⚡ 核心技术

### 纯 TypeScript 引擎 (`server/src/wencai.ts`)

完全替代了 Python 版 `pywencai`，实现了完整的问财数据 API 调用链路：

| 组件 | 说明 |
|------|------|
| **令牌生成** | `hexin-v.bundle.js` — 同花顺反爬签名，Webpack 自包含包 |
| **Step 1** | `POST get-robot-data` — 获取查询条件和 URL 参数 |
| **Step 2** | `POST getDataList / find` — 拉取实际数据，支持分页 |
| **结果解析** | 多组件类型处理 (container/tab1/tab4/common 等) |

---

## 🖥️ CLI 命令行模式

```bash
cd server

# 查询指数成分股
npx tsx src/wencai.ts "上证指数"

# 条件筛选
npx tsx src/wencai.ts "北向资金流向" --limit 10

# 保存到文件
npx tsx src/wencai.ts "涨停股" --limit 5 > result.json
```

## 🌐 Web UI 模式

### 一键启动

```bash
# 1. 安装后端依赖
cd server && npm install

# 2. 安装前端依赖并编译
cd ../client && npm install && npm run build

# 3. 启动服务
cd ../server && npx tsx src/index.ts

# 4. 打开浏览器访问 http://localhost:3001
```

> 注：从根目录可以直接 `cd server && npx tsx src/index.ts`（前提是前端已构建过）。

### 开发模式（热更新）

```bash
# 终端 1: 后端
cd server && npx tsx src/index.ts

# 终端 2: 前端 (Vite dev server, 自动代理 API)
cd client && npm run dev  # → http://localhost:5173
```

## 🎨 功能特性

- **自然语言查询** — 直接输入 "北向资金流向"、"涨停股"、"市盈率低于20的消费股"
- **苹果设计风格** — SF 字体、毛玻璃导航、圆角搜索栏、柔和阴影
- **快捷搜索建议** — 一键点击热门查询
- **智能表格展示** — 自动识别数值列、对齐格式化
- **响应式布局** — 桌面和移动端均适配
- **实时查询** — 纯 TypeScript 引擎，毫秒级响应

## 🔧 技术栈

| 层 | 技术 |
|---|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 后端框架 | Express + TypeScript |
| 运行时 | tsx (TypeScript 直接执行) |
| 数据引擎 | **纯 TypeScript 实现**（替代 pywencai） |
| 反爬令牌 | hexin-v (同花顺签名, 自包含 JS bundle) |
| 设计风格 | Apple SF Pro 风格 |

## 🚀 快速上手

```bash
git clone git@github.com:0lder/stockeasy.git
cd stockeasy/server && npm install
cd ../client && npm install && npm run build
cd ../server && npx tsx src/index.ts
# 打开 http://localhost:3001
```
