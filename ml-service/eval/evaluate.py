"""
Evaluate toxicity detection: precision / recall / F1 / ROC-AUC, a threshold
sweep, per-language breakdown, and a keyword-blocklist baseline to compare
against. This is the "is the ML actually better than the obvious thing" check.

Data: CSV with a text column and a 0/1 label column (optional `lang` column).
The Jigsaw Multilingual validation set works directly:
    python evaluate.py --csv validation.csv --text-col comment_text --label-col toxic --lang-col lang
A tiny sample (sample_eval.csv) is included only to prove the script runs - it is
far too small to say anything about accuracy.

Scorers:
  detoxify  - run Detoxify('multilingual') in-process (needs torch + detoxify)
  service   - call a running ml-service  (--url http://localhost:8001 [--key SECRET])
  keyword   - naive blocklist baseline (no ML)

Outputs a console report and  eval_report.json  (threshold sweep etc.).
"""
import argparse
import json
import re
import sys

import numpy as np
import pandas as pd
from sklearn.metrics import precision_recall_fscore_support, roc_auc_score

BLOCKLIST = [
    "idiot", "stupid", "moron", "dumb", "trash", "loser", "shut up", "hate you",
    "kill yourself", "kys", "bastard", "bitch", "fuck", "shit", "asshole",
    "chutiya", "madarchod", "bhenchod", "gandu", "harami", "kutta", "saala",
]
_blocklist_re = re.compile("|".join(re.escape(w) for w in BLOCKLIST), re.IGNORECASE)


def score_keyword(texts):
    return np.array([1.0 if _blocklist_re.search(t) else 0.0 for t in texts])


def score_detoxify(texts, batch=32):
    from detoxify import Detoxify

    model = Detoxify("multilingual")
    out = []
    for i in range(0, len(texts), batch):
        out.extend(model.predict(texts[i : i + batch])["toxicity"])
    return np.array(out, dtype=float)


def score_service(texts, url, key, batch=32):
    import requests

    out = []
    for i in range(0, len(texts), batch):
        r = requests.post(
            url.rstrip("/") + "/score",
            json={"texts": texts[i : i + batch]},
            headers={"X-API-Key": key or ""},
            timeout=60,
        )
        r.raise_for_status()
        out.extend(s["toxicity"] for s in r.json()["scores"])
    return np.array(out, dtype=float)


def metrics_at(y, s, thr):
    pred = (s >= thr).astype(int)
    p, r, f, _ = precision_recall_fscore_support(y, pred, average="binary", zero_division=0)
    return {"threshold": round(float(thr), 3), "precision": round(float(p), 4),
            "recall": round(float(r), 4), "f1": round(float(f), 4),
            "flag_rate": round(float(pred.mean()), 4)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--text-col", default="text")
    ap.add_argument("--label-col", default="label")
    ap.add_argument("--lang-col", default=None)
    ap.add_argument("--scorer", choices=["detoxify", "service", "keyword"], default="detoxify")
    ap.add_argument("--url", default="http://localhost:8001")
    ap.add_argument("--key", default="")
    ap.add_argument("--min-precision", type=float, default=0.90,
                    help="pick the threshold with best recall subject to this precision")
    ap.add_argument("--limit", type=int, default=0, help="evaluate only the first N rows")
    ap.add_argument("--out", default="eval_report.json")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    if args.limit:
        df = df.head(args.limit)
    texts = df[args.text_col].astype(str).tolist()
    y = (df[args.label_col].astype(float) >= 0.5).astype(int).to_numpy()
    if y.min() == y.max():
        sys.exit("Labels contain a single class - can't compute precision/recall.")

    if args.scorer == "keyword":
        s = score_keyword(texts)
    elif args.scorer == "service":
        s = score_service(texts, args.url, args.key)
    else:
        s = score_detoxify(texts)

    # Model-vs-baseline context
    kw = score_keyword(texts)
    sweep = [metrics_at(y, s, t) for t in np.arange(0.1, 0.96, 0.05)]
    ok = [m for m in sweep if m["precision"] >= args.min_precision]
    chosen = max(ok, key=lambda m: m["recall"]) if ok else max(sweep, key=lambda m: m["f1"])

    report = {
        "n": int(len(y)),
        "positive_rate": round(float(y.mean()), 4),
        "scorer": args.scorer,
        "roc_auc": round(float(roc_auc_score(y, s)), 4) if args.scorer != "keyword" else None,
        "chosen_threshold": chosen,
        "keyword_baseline": metrics_at(y, kw, 0.5),
        "sweep": sweep,
    }

    if args.lang_col and args.lang_col in df.columns:
        per_lang = {}
        for lang, idx in df.groupby(args.lang_col).groups.items():
            pos = df.index.get_indexer(idx)
            yl = y[pos]
            if yl.min() == yl.max():
                continue
            per_lang[str(lang)] = {"n": int(len(pos)), **metrics_at(yl, s[pos], chosen["threshold"])}
        report["per_language_at_chosen_threshold"] = per_lang

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"n={report['n']}  toxic rate={report['positive_rate']:.1%}  scorer={args.scorer}")
    if report["roc_auc"] is not None:
        print(f"ROC-AUC: {report['roc_auc']}")
    print(f"Chosen threshold (precision >= {args.min_precision}): {chosen}")
    print(f"Keyword baseline:                 {report['keyword_baseline']}")
    print("\nthreshold  precision  recall  f1     flag_rate")
    for m in sweep:
        print(f"{m['threshold']:<10} {m['precision']:<10} {m['recall']:<7} {m['f1']:<6} {m['flag_rate']}")
    if "per_language_at_chosen_threshold" in report:
        print("\nPer language:")
        for lang, m in report["per_language_at_chosen_threshold"].items():
            print(f"  {lang}: {m}")
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
