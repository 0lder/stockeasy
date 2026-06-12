#!/usr/bin/env python3
"""
pywencai 便捷查询工具
用法:
  python wencai.py "上证指数"
  python wencai.py "2025年一季度净利润增长率大于50%的股票" --limit 10
  python wencai.py "北向资金流向" --save
  python wencai.py "光伏行业龙头" --csv /tmp/output.csv
  python wencai.py "涨停股" --raw
"""

import sys
import json
import argparse
import pandas as pd
import pywencai


def query_wencai(query: str, limit: int = 20, raw: bool = False, loop: bool = True):
    """执行问财查询"""
    print(f"🔍 查询: {query}")
    print(f"⏳ 正在爬取数据...")

    df = pywencai.get(query=query, loop=loop)

    if df is None or (isinstance(df, pd.DataFrame) and df.empty):
        print("❌ 没有查到数据")
        return None

    if isinstance(df, dict):
        # 多表结果
        for key, sub_df in df.items():
            print(f"\n📋 数据表: {key}")
            _display_df(sub_df, limit, raw)
        return df

    if isinstance(df, pd.DataFrame):
        _display_df(df, limit, raw)
        return df

    print(f"⚠️  未知返回类型: {type(df)}")
    return df


def _display_df(df: pd.DataFrame, limit: int, raw: bool):
    """格式化显示 DataFrame"""
    total = len(df)
    show = min(limit, total)
    
    print(f"📊 共 {total} 条数据, 显示前 {show} 条:")
    print(f"📐 列数: {len(df.columns)}, 列名: {list(df.columns)}")
    
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 200)
    pd.set_option('display.max_colwidth', 30)

    if raw:
        print(df.head(show).to_string())
    else:
        print(df.head(show))
    
    if total > show:
        print(f"... (还有 {total - show} 条未显示)")
    
    # 显示数值列统计
    numeric_cols = df.select_dtypes(include='number').columns
    if not numeric_cols.empty:
        print(f"\n📈 数值列概览:")
        print(df[numeric_cols].describe().to_string())


def save_to_csv(df, path: str):
    """保存为 CSV"""
    if isinstance(df, dict):
        base, ext = path.rsplit('.', 1) if '.' in path else (path, 'csv')
        for key, sub_df in df.items():
            p = f"{base}_{key}.{ext}"
            sub_df.to_csv(p, index=False, encoding='utf-8-sig')
            print(f"💾 已保存: {p}")
    else:
        df.to_csv(path, index=False, encoding='utf-8-sig')
        print(f"💾 已保存: {path}")


def interactive_mode():
    """交互模式"""
    print("=" * 50)
    print("🟢 pywencai 交互查询模式")
    print("输入查询内容，或输入 q / quit 退出")
    print("=" * 50)
    
    while True:
        try:
            query = input("\n>>> ").strip()
            if not query:
                continue
            if query.lower() in ('q', 'quit', 'exit'):
                print("👋 再见!")
                break
            
            limit_input = input("  显示条数 [默认 20]: ").strip()
            limit = int(limit_input) if limit_input.isdigit() else 20
            
            save_input = input("  保存CSV? [y/N]: ").strip().lower()
            
            result = query_wencai(query, limit=limit)
            
            if result is not None and save_input in ('y', 'yes'):
                from datetime import datetime
                fname = f"wencai_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                save_to_csv(result, fname)
                
        except KeyboardInterrupt:
            print("\n👋 再见!")
            break
        except Exception as e:
            print(f"❌ 出错: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="pywencai 问财查询工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python wencai.py "上证指数"
  python wencai.py "2025年一季度净利润增长率大于50%的股票" --limit 10
  python wencai.py "北向资金流向" --save
  python wencai.py "光伏行业龙头" --csv /tmp/output.csv
  python wencai.py "涨停股" --raw
        """
    )
    parser.add_argument("query", nargs="?", help="问财查询语句")
    parser.add_argument("-l", "--limit", type=int, default=20, help="显示条数 (默认 20)")
    parser.add_argument("--raw", action="store_true", help="原始格式输出")
    parser.add_argument("--save", action="store_true", help="保存为 CSV (自动命名)")
    parser.add_argument("--csv", type=str, help="保存为 CSV (指定路径)")
    parser.add_argument("--json", action="store_true", help="JSON 格式输出 (供 API 调用)")
    parser.add_argument("-i", "--interactive", action="store_true", help="交互模式")

    args = parser.parse_args()

    if args.interactive or not args.query:
        interactive_mode()
        return

    if args.json:
        # JSON 输出模式 — 供后端 API 调用
        import warnings
        warnings.filterwarnings("ignore")
        try:
            df = pywencai.get(query=args.query, loop=True)
            if df is None:
                print(json.dumps({"error": "没有查到数据", "data": []}))
                sys.exit(0)
            if isinstance(df, dict):
                output = {}
                for key, sub_df in df.items():
                    output[key] = json.loads(sub_df.to_json(orient="records", force_ascii=False))
                print(json.dumps(output, ensure_ascii=False))
            elif isinstance(df, pd.DataFrame):
                print(json.dumps(json.loads(df.to_json(orient="records", force_ascii=False)), ensure_ascii=False))
            else:
                print(json.dumps({"error": f"未知返回类型: {type(df)}", "data": []}))
        except Exception as e:
            print(json.dumps({"error": str(e), "data": []}))
        sys.exit(0)

    result = query_wencai(args.query, limit=args.limit, raw=args.raw)
    
    if result is not None:
        if args.save:
            from datetime import datetime
            fname = f"wencai_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            save_to_csv(result, fname)
        elif args.csv:
            save_to_csv(result, args.csv)


if __name__ == "__main__":
    main()
