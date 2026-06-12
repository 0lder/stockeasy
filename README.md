# stockeasy

## 简介
问财（pywencai）数据查询工具 — 通过自然语言查询 A 股市场数据

## 快速开始

```bash
pip install pywencai pandas
```

## 用法

```bash
python wencai.py "上证指数"
python wencai.py "北向资金流向" -l 10
python wencai.py "2025年一季度净利润增长率大于50%的股票" --save
python wencai.py "涨停股" --csv output.csv
python wencai.py -i   # 交互模式
```

## 参数

| 参数 | 说明 |
|------|------|
| `query` | 问财查询语句（自然语言） |
| `-l / --limit` | 显示条数，默认 20 |
| `--raw` | 原始格式输出 |
| `--save` | 自动保存 CSV |
| `--csv path` | 指定路径保存 CSV |
| `-i / --interactive` | 交互模式 |
