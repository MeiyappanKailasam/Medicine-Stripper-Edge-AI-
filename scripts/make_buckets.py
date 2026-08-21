import json, re
from pathlib import Path
from collections import defaultdict

DB_DIR = Path("src/database")

print("Loading slim index...")
with open(DB_DIR / "medicines_slim_index.json", encoding="utf-8") as f:
    slim = json.load(f)
print(f"Loaded {len(slim):,} entries")

# Letter buckets: user types 'D' -> only load D-bucket (~2MB each)
buckets = defaultdict(list)
for e in slim:
    clean = re.sub(r"[^a-z]", "", e["b"].lower())
    first = clean[0] if clean else "0"
    buckets[first].append(e)

bucket_dir = DB_DIR / "index_buckets"
bucket_dir.mkdir(exist_ok=True)
manifest = {}
for letter, entries in sorted(buckets.items()):
    p = bucket_dir / f"bucket_{letter}.json"
    with open(p, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, separators=(",",":"))
    sz = p.stat().st_size / 1024
    manifest[letter] = {"file": f"index_buckets/bucket_{letter}.json", "count": len(entries), "sizeKB": round(sz, 1)}
    print(f"  bucket_{letter}.json  {len(entries):>6,} entries  {sz:>7.1f} KB")

# Update db_meta
with open(DB_DIR / "db_meta.json", encoding="utf-8") as f:
    meta = json.load(f)
meta["indexBuckets"] = manifest
meta["indexBucketDir"] = "index_buckets"
meta["loadingStrategy"] = "lazy-by-letter"
with open(DB_DIR / "db_meta.json", "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)

total_kb = sum(v["sizeKB"] for v in manifest.values())
best = max(manifest.items(), key=lambda x: x[1]["sizeKB"])
print("")
print(f"Letter buckets: {len(manifest)} files, {total_kb/1024:.1f} MB total")
print(f"Largest bucket: {best[0]} -> {best[1]['sizeKB']/1024:.1f} MB")
print(f"Average per letter: {total_kb/len(manifest):.0f} KB")
print("Done!")
