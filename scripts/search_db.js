import { readFileSync } from 'fs'
const data = JSON.parse(readFileSync('src/database/medicines_mini_index.json', 'utf8'))

// Check what Fuse.js would match for PENTAB-40
// First, let's see all entries whose brand name contains 'pan' or 'pent'
const pentabLike = data.filter(m => {
  if (!m.b) return false
  return m.b.toLowerCase().includes('pent') || m.b.toLowerCase().includes('pan ')
    || m.b.toLowerCase() === 'pan' || m.b.toLowerCase().startsWith('pan-')
    || m.b.toLowerCase().startsWith('pan ')
})
console.log('=== Entries with "pent" or "pan" in brand name ===')
console.log(JSON.stringify(pentabLike.slice(0, 15), null, 2))

// Also look for "panam"
const panam = data.find(m => m.b && m.b.toLowerCase().includes('panam'))
console.log('\n=== panam entry ===', JSON.stringify(panam, null, 2))

// What does the generic field "g" contain that includes "pan pharmaceuticals"?
const panPharma = data.filter(m => m.m && m.m.toLowerCase().includes('pan pharma'))
console.log('\n=== Pan Pharmaceuticals entries ===')
console.log(JSON.stringify(panPharma.slice(0, 5), null, 2))

// Find what exactly Fuse.js matches PENTAB-40 to (check for sulfamethoxazole / trimethoprim)
const sulfas = data.filter(m => m.g && m.g.toLowerCase().includes('sulfamethoxazole'))
console.log('\n=== Sulfamethoxazole entries ===')
console.log(JSON.stringify(sulfas.slice(0, 5), null, 2))
