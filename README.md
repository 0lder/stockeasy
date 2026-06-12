# StockEasy 📈

问财（pywencai）数据查询工具 — 通过自然语言查询 A 股市场数据，支持命令行和 Web UI 两种方式。

## 项目结构

```
stockeasy/
├── wencai.py          # 问财数据爬虫 CLI 工具
├── server/            # Node.js + Express 后端
│   └── src/index.ts
├── client/            # React + Vite + TypeScript 前端
│   └── src/
│       ├── App.tsx
│       └── App.css
└── README.md
```

---

## 🖥️ CLI 命令行工具

### 安装依赖

```bash
pip install pywencai pandas
```

### 基本用法

```bash
# 查询指数成分股
python wencai.py "上证指数"

# 条件筛选
python wencai.py "2025年一季度净利润增长率大于50%的股票" --limit 10

# 保存结果
python wencai.py "北向资金流向" --save
python wencai.py "涨停股" --csv output.csv

# 交互模式
python wencai.py -i

# JSON 输出（供 API 调用）
python wencai.py "上证指数" --json
```

### CLI 参数

| 参数 | 说明 |
|------|------|
| `query` | 问财查询语句（自然语言） |
| `-l / --limit` | 显示条数，默认 20 |
| `--raw` | 原始格式输出 |
| `--save` | 自动保存 CSV（自动命名） |
| `--csv path` | 指定路径保存 CSV |
| `--json` | JSON 格式输出（供 API 调用） |
| `-i / --interactive` | 交互模式 |

---

## 🌐 Web UI（苹果设计风格）

### 快速启动

```bash
# 安装后端依赖
cd server && npm install

# 安装前端依赖并构建
cd ../client && npm install && npm run build

# 回到项目根目录启动
cd ..
npm start
```

访问 `http://localhost:3001`

### 开发模式（热更新）

```bash
# 终端1: 启动后端
cd server && npm run dev

# 终端2: 启动前端（Vite 开发服务器）
cd client && npm run dev
```

前端开发服务器运行在 `http://localhost:5173`，自动代理 `/api` 请求到后端。

### 技术栈

| 层 | 技术 |
|---|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 后端框架 | Express + TypeScript |
| 运行时 | tsx (TypeScript 执行) |
| 数据引擎 | pywencai（问财爬虫） |
| 设计风格 | Apple SF Pro 风格 |

### 功能特点

- 🎨 苹果网站设计风格 — SF 字体、毛玻璃导航、柔和阴影
- 🔍 自然语言查询 — 直接输入"北向资金流向"即可
- 💡 快捷搜索建议 — 一键点击热门查询
- 📊 智能表格展示 — 自动识别数值列、对齐格式化
- 📱 响应式设计 — 桌面和移动端均适配
- ⚡ 实时查询 — 后端调用 Python 爬虫引擎获取最新数据

---

## 📝 许可证

MIT
