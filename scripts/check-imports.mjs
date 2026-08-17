#!/usr/bin/env node
/*
  KIRIK IMPORT KONTROLÜ — R2

  Bir dosya `lib/`ten bir fonksiyon çağırıyor ama import etmiyorsa
  yakalar.

  NEDEN GEREKLİ: Next.js build'i bunu YAKALAMIYOR. Sprint-6'da
  dosya bölerken 13 kırık import oluştu ve hepsi "Compiled
  successfully" aldı; kullanıcıda çalışma anında çöktüler.

  Kullanım:  node scripts/check-imports.mjs
  Çıkış kodu: 0 temiz, 1 sorun var (CI'da kullanılabilir)
*/
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

function walk(d, out = []) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(f)) walk(p, out);
    } else if (/\.jsx?$/.test(f)) out.push(p);
  }
  return out;
}

/*
  lib/ altındaki tüm export'lar: ad → dosya(lar).

  ÇOKLU TANIM: aynı ad birden çok dosyada export edilebiliyor
  (örn. STATES hem state.js hem workstate.js'te). Hepsini
  tutuyoruz ki rapor doğru dosyayı gösterebilsin.
*/
const exported = new Map();
for (const f of walk('lib')) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)) {
    if (!exported.has(m[1])) exported.set(m[1], []);
    exported.get(m[1]).push(f);
  }
}

const problems = [];
for (const file of [...walk('app'), ...walk('lib')]) {
  const raw = readFileSync(file, 'utf8');

  /*
    YORUMLARI ÇIKAR.

    `/* ---------- PLAN (ücretsiz) ---------- *\/` gibi yorumlar
    "PLAN(" olarak okunuyordu — üç yanlış alarm buradan geliyordu.
    Yanlış alarmlar gerçek hataları gizler.
  */
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  /* Bu dosyada neler erişilebilir */
  const known = new Set();
  for (const m of raw.matchAll(/import\s+\{([^}]+)\}/g))
    m[1].split(',').forEach(x => known.add(x.trim().split(' as ').pop().trim()));
  for (const m of raw.matchAll(/import\s+(\w+)\s+from/g)) known.add(m[1]);
  for (const m of src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) known.add(m[1]);
  for (const m of src.matchAll(/(?:export\s+)?const\s+(\w+)\s*=/g)) known.add(m[1]);

  /*
    İKİ KULLANIM BİÇİMİ:

      1. Fonksiyon çağrısı:  progressEvidence(...)
      2. SABİT erişimi:      STATES[st]  ·  FORMATS.map  ·  PLAN(

    İlk sürüm yalnızca fonksiyon çağrılarını arıyordu ve `STATES`
    eksikliğini KAÇIRDI — kullanıcıda çalışma anında çöktü.
  */
  const used = new Set();
  for (const m of src.matchAll(/(?<![.\w$])(\w+)\s*\(/g)) used.add(m[1]);
  /* Büyük harfli sabitler: STATES[x], FORMATS.map, TASKS[k] */
  for (const m of src.matchAll(/(?<![.\w$])([A-Z][A-Z0-9_]{2,})(?=[\[.\(])/g)) used.add(m[1]);

  for (const name of used) {
    if (known.has(name)) continue;
    const from = exported.get(name);
    if (!from) continue;
    const others = from.filter(f2 => f2 !== file);
    if (!others.length) continue;
    problems.push({ file, name, from: others.join(' veya ') });
  }
}

const uniq = [...new Map(problems.map(p => [p.file + p.name, p])).values()];

if (uniq.length === 0) {
  console.log('✓ Kırık import yok');
  process.exit(0);
}

console.log('✗ ' + uniq.length + ' kırık import:\n');
for (const p of uniq) {
  /* Sabitler için parantez yazmıyoruz — STATES() yanıltıcıydı */
  const shown = /^[A-Z][A-Z0-9_]{2,}$/.test(p.name) ? p.name : p.name + '()';
  console.log('  ' + p.file + '\n    ' + shown + '  →  ' + p.from + ' içinde tanımlı\n');
}
process.exit(1);
