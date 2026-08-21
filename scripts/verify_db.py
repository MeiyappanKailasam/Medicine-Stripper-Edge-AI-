import json
from pathlib import Path

DB_DIR = Path("src/database")
with open(DB_DIR / "db_meta.json", encoding="utf-8") as f:
    meta = json.load(f)

print("=== DATABASE BUILD SUMMARY ===")
print(f"Built at      : {meta['builtAt']}")
print(f"Total entries : {meta['totalEntries']:,}")
print(f"Chunks        : {meta['numChunks']} x {meta['chunkSize']}")
print("")

files = [
    ("src/database/db_meta.json",              "Chunk manifest + stats"),
    ("src/database/medicines_mini_index.json", "Instant offline top-5000"),
    ("src/database/medicines_slim_index.json", "Full slim index (server-side only)"),
]
for fpath, desc in files:
    p = Path(fpath)
    if p.exists():
        sz = p.stat().st_size
        print(f"  {p.name:<40} {sz/1024:>8.1f} KB   {desc}")

bucket_dir = DB_DIR / "index_buckets"
b_files = list(bucket_dir.glob("*.json"))
total_bucket = sum(f.stat().st_size for f in b_files)
print(f"  index_buckets/ ({len(b_files)} files)               {total_bucket/1024/1024:>5.1f} MB   Lazy per first letter")

chunk_dir = DB_DIR / "chunks"
c_files = list(chunk_dir.glob("*.json"))
total_chunks = sum(f.stat().st_size for f in c_files)
print(f"  chunks/ ({len(c_files)} files)                     {total_chunks/1024/1024:>5.1f} MB   On-demand detail")

print("")
print("=== LOADING STRATEGY ===")
print("  1. App startup  -> mini_index.json (1.1 MB) seeded into IndexedDB")
print("  2. User types   -> matching bucket loaded (avg 2 MB, max 5.2 MB)")
print("  3. Match found  -> chunk_NNNN.json (avg 710 KB) fetched for full details")
print("  4. Online fetch -> stored in IndexedDB for future offline use")

with open(DB_DIR / "medicines_mini_index.json", encoding="utf-8") as f:
    mini = json.load(f)
print("")
print("=== SAMPLE ENTRIES (mini index) ===")
for e in mini[:5]:
    print(f"  {e['b']:<40} generic: {e['g'][:30]:<30}  chunk: {e['ci']}")

print("")
print("=== DATABASE READY ===")
