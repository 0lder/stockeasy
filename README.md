# StockEasy 📈

问财数据查询工具 + Web UI — 纯 Node.js/TypeScript 实现，无需 Python 依赖。

支持命令行和 Web 界面两种方式查询 A 股市场数据。

## 项目结构

```
stockeasy/
├── wencai.py              # [可选] CLI 工具 (Python/pywencai)
├── server/
│   ├── src/
│   │   ├── index.ts       # Express 后端服务 (纯 Node.js)
│   │   ├── wencai.ts      # 问财 API 纯 TypeScript 实现 ✨
│   │   └── hexin-v.bundle.js  # 同花顺令牌生成 (5MB, 自包含)
│   └── package.json
├── client/
│   └── src/
│       ├── App.tsx        # React 主界面 (苹果设计风格)
│       └── App.css
└── README.md
```

## ⚡ 核心技术

### 纯 Node.js 引擎 (无需 Python)

实现了 `pywencai` 的完整替代版 `server/src/wencai.ts`：

| 组件 | 说明 |
|------|------|
| **令牌生成** | `hexin-v.bundle.js` — 同花顺反爬签名，Webpack 自包含包 |
| **Step 1** | `get-robot-data` — 获取查询条件和 URL 参数 |
| **Step 2** | `getDataList / find` — 拉取实际数据，支持分页 |
| **结果解析** | 多组件类型处理 (container/tab1/tab4/common 等) |

---

## 🖥️ CLI 命令行

```bash
# Python 版 (可选)
pip install pywencai pandas
python wencai.py "上证指数"
python wencai.py "北向资金流向" --save

# Node.js 版
cd server && npx tsx src/wencai.ts "上证指数" --limit 10
```

## 🌐 Web UI 启动

```bash
# 1. 安装依赖
cd server && npm install
cd ../client && npm install && npm run build

# 2. 启动 (纯 Node.js, 无需 Python)
cd ../server && npx tsx src/index.ts

# 3. 访问 http://localhost:3001
```

### 开发模式 (热更新)

```bash
# 终端 1: 后端
cd server && npx tsx src/index.ts

# 终端 2: 前端
cd client && npm run dev  # → http://localhost:5173
```

### 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + TypeScript + Vite 6 |
| 后端 | Express + TypeScript (tsx 运行时) |
| 数据引擎 | **纯 TypeScript 实现**, 替代 pywencai |
| 设计风格 | Apple SF Pro (毛玻璃导航、圆角搜索栏) |

## 🚀 GitHub

```bash
git clone git@github.com:0lder/stockeasy.git
cd stockeasy
# 按照上面 Web UI 启动步骤操作
```
