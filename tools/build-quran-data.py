"""Builds data/quran-hafs.json (KFGQPC Madinah Mushaf layout, 604 pages / 15 lines)
and data/tanzil-uthmani.json (Tanzil Uthmani text) for the Rasfahi app.
Sources:  @quran.ws/text (CC-BY-4.0, KFGQPC UthmanicHafs v3 text + v2 layout)
          npm 'quran' package qurandb (Tanzil Uthmani text, tanzil.net terms)"""
import json, sqlite3, sys
hafs_src, tanzil_db, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(hafs_src))
words = list(d['words'])
types = d['mark_types']
# re-attach waqf / sajdah / rub marks exactly as the Madinah print shows them
after = {}; before = {}
for pos, t in d['marks']:
    mt = types[t]
    if mt['side'] == 'after': after.setdefault(pos, []).append(mt['sign'])
    else: before.setdefault(pos, []).append(mt['sign'])
for i in range(len(words)):
    w = words[i]
    if i in after: w = w + ''.join(after[i])
    if i in before: w = ''.join(before[i]) + ' ' + w
    words[i] = w
surahs = [{'n': s['number'], 'ar': s['name_ar'], 'en': s['name_en'], 'c': s['ayah_count'],
           'a': s['first_ayah'], 'b': 1 if s['has_basmalah'] else 0} for s in d['surahs']]
out = {'source': 'KFGQPC UthmanicHafs v3 text, v2 layout (via quran.ws, CC-BY-4.0)',
       'surahs': surahs, 'ayahStarts': d['ayah_starts'], 'pageStarts': d['page_starts'],
       'lineStarts': d['line_starts'], 'juzStarts': d['juz_starts'], 'surahStarts': d['surah_starts'],
       'words': words, 'imlai': d['rasm_imlai']}
json.dump(out, open(out_dir + '/quran-hafs.json', 'w'), ensure_ascii=False, separators=(',', ':'))
c = sqlite3.connect(tanzil_db)
rows = c.execute('select chapter, verse, ar from ar order by chapter, verse').fetchall()
assert len(rows) == 6236
cnt = {}
for ch, v, t in rows: cnt[ch] = cnt.get(ch, 0) + 1
for s in surahs: assert cnt[s['n']] == s['c'], s
json.dump({'source': 'Tanzil Quran Text (Uthmani) - tanzil.net', 'ayahs': [r[2] for r in rows]},
          open(out_dir + '/tanzil-uthmani.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(words), 'words;', len(rows), 'tanzil ayahs')
