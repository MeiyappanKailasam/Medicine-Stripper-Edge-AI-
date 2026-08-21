"""
Medicine Database Builder
=========================
Downloads two Kaggle datasets, merges them on medicine name,
normalizes to the app MedicineEntry schema, and exports as:

  src/database/medicines_index.json  -- lightweight search index (~5MB)
  src/database/chunks/chunk_*.json   -- full detail chunks (500 entries each)
  src/database/db_meta.json          -- chunk manifest + stats

Datasets (CC BY-SA 4.0):
  1. shudhanshusingh/az-medicine-dataset-of-india
  2. shudhanshusingh/250k-medicines-usage-side-effects-and-substitutes

Usage:
  python scripts/build_medicine_db.py
"""

import os, re, json, math, hashlib, unicodedata
from pathlib import Path
from datetime import datetime

import pandas as pd
from tqdm import tqdm

# Paths
ROOT       = Path(__file__).parent.parent
RAW_DIR    = ROOT / "scripts" / "raw_data"
DB_DIR     = ROOT / "src" / "database"
CHUNKS_DIR = DB_DIR / "chunks"

for d in [RAW_DIR, DB_DIR, CHUNKS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

CHUNK_SIZE = 500
DATASET_1  = "shudhanshusingh/az-medicine-dataset-of-india"
DATASET_2  = "shudhanshusingh/250k-medicines-usage-side-effects-and-substitutes"

# Helpers
def normalize_name(name):
    if not isinstance(name, str): return ""
    name = unicodedata.normalize("NFKD", name).lower().strip()
    name = re.sub(r"[^a-z0-9\s]", " ", name)
    return re.sub(r"\s+", " ", name).strip()

def clean_str(val, default=""):
    if val is None or (isinstance(val, float) and math.isnan(val)): return default
    return str(val).strip()

def split_composition(s):
    if not s: return []
    return [p.strip() for p in re.split(r"[\+\|,;]+", s) if p.strip()]

def parse_cols(row, prefix, max_n):
    out = []
    for i in range(max_n):
        v = clean_str(row.get(f"{prefix}{i}", ""))
        if v and v.lower() not in ("nan","none",""): out.append(v)
    return out

def make_id(name):
    slug = re.sub(r"[^a-z0-9]+", "-", normalize_name(name)).strip("-")[:60]
    h = hashlib.md5(name.encode()).hexdigest()[:6]
    return f"{slug}-{h}"

def infer_rx(tc, ac):
    rx = {"antibiotic","antipsychotic","antidepressant","narcotic","opioid",
          "benzodiazepine","antiviral","antifungal","immunosuppressant",
          "chemotherapy","anticoagulant","antihypertensive","antidiabetic"}
    return any(c in f"{tc} {ac}".lower() for c in rx)

def safe_float(v):
    try: return round(float(v), 1)
    except: return None

# Step 1: Download
def download_datasets():
    print("\n Downloading Kaggle datasets...")
    for ds in [DATASET_1, DATASET_2]:
        name = ds.split("/")[1]
        target = RAW_DIR / name
        target.mkdir(exist_ok=True)
        if any(target.iterdir()):
            print(f"  Already downloaded: {name}")
            continue
        print(f"  Downloading: {ds}")
        os.system(f'kaggle datasets download -d "{ds}" -p "{target}" --unzip')
        print(f"  Done: {name}")

# Step 2: Load A-Z dataset
def load_az():
    d = RAW_DIR / "az-medicine-dataset-of-india"
    csvs = list(d.glob("*.csv"))
    if not csvs: raise FileNotFoundError(f"No CSV in {d}")
    print(f"\n Loading AZ: {csvs[0].name}")
    df = pd.read_csv(csvs[0], encoding="utf-8", on_bad_lines="skip")
    print(f"  {len(df):,} rows | cols: {list(df.columns)}")

    # Normalise col names
    cm = {}
    for c in df.columns:
        lc = c.lower()
        if "name" in lc and "manufacturer" not in lc: cm[c] = "name"
        elif "manufacturer" in lc: cm[c] = "manufacturer_name"
        elif any(x in lc for x in ["composition","ingredient","salt"]): cm[c] = "composition"
        elif any(x in lc for x in ["price","mrp"]): cm[c] = "price"
        elif "discontinu" in lc: cm[c] = "is_discontinued"
        elif any(x in lc for x in ["type","form","pack"]): cm[c] = "pack_type"
    df.rename(columns=cm, inplace=True)

    keep = [c for c in ["name","manufacturer_name","composition","price","is_discontinued","pack_type"] if c in df.columns]
    df = df[keep].copy()
    df["name_normalized"] = df["name"].apply(normalize_name)
    df.drop_duplicates("name_normalized", inplace=True)
    df.dropna(subset=["name"], inplace=True)
    print(f"  After dedup: {len(df):,}")
    return df

# Step 3: Load usage dataset
def load_usage():
    d = RAW_DIR / "250k-medicines-usage-side-effects-and-substitutes"
    csvs = list(d.glob("*.csv"))
    if not csvs: raise FileNotFoundError(f"No CSV in {d}")
    print(f"\n Loading usage: {csvs[0].name}")
    df = pd.read_csv(csvs[0], encoding="utf-8", on_bad_lines="skip")
    print(f"  {len(df):,} rows")
    nc = next((c for c in df.columns if "name" in c.lower()), None)
    if nc and nc != "name": df.rename(columns={nc: "name"}, inplace=True)
    df["name_normalized"] = df["name"].apply(normalize_name)
    df.drop_duplicates("name_normalized", inplace=True)
    df.dropna(subset=["name"], inplace=True)
    print(f"  After dedup: {len(df):,}")
    return df

# Step 4: Merge
def merge(az, usage):
    print("\n Merging datasets...")
    m = pd.merge(az, usage, on="name_normalized", how="outer", suffixes=("_az","_usage"))
    for col in ["name_az","name_usage"]:
        if col in m.columns:
            other = "name_usage" if col == "name_az" else "name_az"
            m["name"] = m[col].fillna(m.get(other, ""))
    for col in ["name_az","name_usage"]:
        if col in m.columns: m.drop(columns=[col], inplace=True)
    if "name" not in m.columns:
        m["name"] = m.get("name_normalized", "")
    print(f"  Merged: {len(m):,} entries")
    return m

# Step 5: Transform
def transform(merged):
    print("\n Transforming to app schema...")
    entries = []
    for _, row in tqdm(merged.iterrows(), total=len(merged), unit="med"):
        name = clean_str(row.get("name"))
        if not name or len(name) < 2: continue

        comp_raw = (clean_str(row.get("Composition")) or
                    clean_str(row.get("composition")) or
                    " + ".join(filter(None, [
                        clean_str(row.get("short_composition1","")),
                        clean_str(row.get("short_composition2",""))
                    ])))
        comp_list = split_composition(comp_raw)

        side_effects = parse_cols(row, "sideEffect", 41)
        if not side_effects:
            se = clean_str(row.get("Side_effects",""))
            side_effects = [s.strip() for s in re.split(r",|;|\|", se) if s.strip()][:20]

        uses = parse_cols(row, "use", 5)
        if not uses:
            u = clean_str(row.get("Uses",""))
            uses = [s.strip() for s in re.split(r",|;|\n", u) if s.strip()][:10]

        substitutes = parse_cols(row, "substitute", 5)
        tc = clean_str(row.get("therapeutic_class",""))
        ac = clean_str(row.get("action_class",""))
        cc = clean_str(row.get("chemical_class",""))
        hf = str(row.get("habit_forming","No")).strip().upper() == "YES"
        mfr = clean_str(row.get("manufacturer_name")) or clean_str(row.get("Manufacturer",""))

        try:    price = f"INR {float(row.get('price', row.get('Price[INR]', ''))):.2f}"
        except: price = ""

        disc = str(row.get("is_discontinued","FALSE")).strip().upper() in ("TRUE","1","YES")

        entry = {
            "id": make_id(name),
            "brandName": name,
            "genericName": comp_list[0] if comp_list else "",
            "composition": comp_raw,
            "compositionList": comp_list,
            "manufacturer": mfr,
            "price": price,
            "packType": clean_str(row.get("pack_type", row.get("type",""))),
            "isDiscontinued": disc,
            "uses": uses,
            "sideEffects": side_effects[:20],
            "substitutes": substitutes,
            "therapeuticClass": tc,
            "actionClass": ac,
            "chemicalClass": cc,
            "habitForming": hf,
            "rxRequired": infer_rx(tc, ac),
            "reviewExcellent": safe_float(row.get("Excellent Review %")),
            "reviewAverage":   safe_float(row.get("Average Review %")),
            "reviewPoor":      safe_float(row.get("Poor Review %")),
            "dosage": "",
            "contraindications": [],
            "storage": "Store in a cool, dry place below 25 degrees C.",
            "precautions": [],
            "interactions": [],
            "genericAlternatives": substitutes,
            "dosageSchedule": None,
            "clinicalNotes": None,
            "_searchTokens": list(set(
                normalize_name(name).split() +
                normalize_name(comp_raw).split() +
                [normalize_name(mfr)]
            )),
        }
        entries.append(entry)
    print(f"  Built {len(entries):,} entries")
    return entries

# Step 6: Write output
def write_output(entries):
    entries.sort(key=lambda e: e["brandName"].lower())
    print(f"\n Writing {len(entries):,} entries to {DB_DIR}...")

    # Search index (lightweight)
    index = [{
        "id":           e["id"],
        "brandName":    e["brandName"],
        "genericName":  e["genericName"],
        "manufacturer": e["manufacturer"],
        "composition":  e["composition"],
        "therapeuticClass": e["therapeuticClass"],
        "isDiscontinued": e["isDiscontinued"],
        "chunkIndex":   i // CHUNK_SIZE,
    } for i, e in enumerate(entries)]

    idx_path = DB_DIR / "medicines_index.json"
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",",":"))
    print(f"  medicines_index.json  ({idx_path.stat().st_size/1024:.0f} KB)")

    # Chunks
    num_chunks = math.ceil(len(entries) / CHUNK_SIZE)
    manifest = []
    for i in range(num_chunks):
        chunk = entries[i*CHUNK_SIZE:(i+1)*CHUNK_SIZE]
        p = CHUNKS_DIR / f"chunk_{i:04d}.json"
        with open(p, "w", encoding="utf-8") as f:
            json.dump(chunk, f, ensure_ascii=False, separators=(",",":"))
        manifest.append({"index":i,"file":f"chunks/chunk_{i:04d}.json",
                         "count":len(chunk),"sizeBytes":p.stat().st_size})

    meta = {
        "version": 1,
        "builtAt": datetime.utcnow().isoformat()+"Z",
        "totalEntries": len(entries),
        "chunkSize": CHUNK_SIZE,
        "numChunks": num_chunks,
        "sources": [
            {"dataset": DATASET_1, "license": "CC BY-SA 4.0"},
            {"dataset": DATASET_2, "license": "CC BY-SA 4.0"},
        ],
        "chunks": manifest,
    }
    with open(DB_DIR / "db_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    total_mb = sum(c["sizeBytes"] for c in manifest) / 1024**2
    print(f"  {num_chunks} chunk files  ({total_mb:.1f} MB)")
    print(f"  db_meta.json written")
    print(f"\nDatabase build complete!")
    print(f"  Total medicines : {len(entries):,}")
    print(f"  Chunks          : {num_chunks} x {CHUNK_SIZE}")
    print(f"  Total DB size   : {total_mb:.1f} MB")

# Main
if __name__ == "__main__":
    print("=" * 60)
    print("  Medicine Database Builder")
    print("=" * 60)
    download_datasets()
    df_az    = load_az()
    df_usage = load_usage()
    merged   = merge(df_az, df_usage)
    entries  = transform(merged)
    write_output(entries)
