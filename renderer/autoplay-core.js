// Smart autoplay, the decisions (no network, no page): which of the songs a radio suggested should actually play next.
// What goes: other songs that merely share the seed's name, and other versions of it (remixes, slowed, karaoke).
// What comes first: songs in the seed's genre, then related genres. app.js fetches the songs and genres.
(function (root) {
  'use strict';

  const fold = (x) => String(x || '').normalize('NFKD').toLowerCase();
  const NOISE = /[([][^)\]]*[)\]]/g;
  const SMALL = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'my', 'me', 'you', 'your', 'i', 'it', 'is', 'for', 'la', 'el', 'de', 'feat', 'ft']);

  function words(title) {
    return fold(title).replace(NOISE, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }
  const meaningful = (list) => {
    const kept = list.filter((w) => !SMALL.has(w));
    return kept.length ? kept : list;
  };
  const sameArtist = (a, b) => {
    const x = fold(a).replace(/[^\p{L}\p{N}]/gu, '');
    const y = fold(b).replace(/[^\p{L}\p{N}]/gu, '');
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
  };

  // "Stay" / "Stay (Official Audio)" / "Stay With Me Tonight": a song found because it is called the same
  function isNameMatch(candidateTitle, seedTitle) {
    const a = meaningful(words(candidateTitle));
    const b = meaningful(words(seedTitle));
    if (!a.length || !b.length) return false;
    const setA = new Set(a);
    const setB = new Set(b);
    const shared = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...a, ...b]).size;
    if (shared / union >= 0.6) return true;
    // every word of the short title inside a slightly longer one
    const [short, long] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    return shared === short.size && long.size - short.size <= 2;
  }

  const VERSION = /\b(remix|sped[ -]?up|slowed|nightcore|reverb|8d|bass[ -]?boost(ed)?|cover|mashup|instrumental|karaoke|tribute|lo-?fi version|acapella|a cappella)\b/i;
  const isOtherVersion = (title, seedTitle) => VERSION.test(String(title || '')) && !VERSION.test(String(seedTitle || ''));

  const FAMILIES = [
    ['hiphop', /hip.?hop|rap\b|drill|trap|grime/i],
    ['rnb', /r&b|rnb|soul|funk|motown/i],
    ['metal', /metal|hardcore|screamo/i],
    ['rock', /rock|alternative|indie|punk|grunge|britpop|emo|new wave/i],
    ['electronic', /dance|electro|house|techno|trance|edm|dubstep|drum|garage|bass|ambient/i],
    ['country', /country|americana|bluegrass/i],
    ['latin', /latin|reggaeton|salsa|bachata|urbano|sertanejo|cumbia/i],
    ['reggae', /reggae|dancehall|ska|afro/i],
    ['jazz', /jazz|blues|swing/i],
    ['classical', /classical|opera|orchestral|soundtrack|score|instrumental/i],
    ['folk', /folk|singer|songwriter|acoustic/i],
    ['pop', /pop|k-?pop|j-?pop/i],
  ];
  const NEAR = {
    hiphop: ['rnb', 'reggae'], rnb: ['hiphop', 'pop', 'jazz'], metal: ['rock'], rock: ['metal', 'pop', 'folk'],
    electronic: ['pop'], country: ['folk', 'rock'], latin: ['pop', 'reggae'], reggae: ['hiphop', 'latin'], jazz: ['rnb', 'classical'],
    classical: ['jazz'], folk: ['rock', 'country', 'pop'], pop: ['rnb', 'rock', 'electronic', 'latin', 'folk'],
  };
  function family(genre) {
    const g = String(genre || '');
    if (!g) return '';
    const hit = FAMILIES.find(([, re]) => re.test(g));
    return hit ? hit[0] : '';
  }
  // 2 same family, 1 neighbouring or not known, 0 somewhere else
  function relation(genre, seedGenre) {
    const a = family(genre);
    const b = family(seedGenre);
    if (!a || !b) return 1;
    if (a === b) return 2;
    return (NEAR[b] || []).includes(a) ? 1 : 0;
  }

  // options: { seed, candidates, seedGenre, genreOf(track) -> genre or '', mode: 'similar' | 'genre', perArtist }
  function pick({ seed, candidates, seedGenre, genreOf, mode, perArtist = 2 }) {
    const seedTitle = seed && seed.title;
    const seedArtist = seed && seed.artist;
    const usable = (Array.isArray(candidates) ? candidates : []).filter((t) => t && t.title
      && !isOtherVersion(t.title, seedTitle)
      && !(isNameMatch(t.title, seedTitle))
    );
    const scored = usable.map((t, i) => ({ t, i, rel: relation(genreOf ? genreOf(t) : '', seedGenre) }));
    let chosen = scored;
    if (mode === 'genre' && family(seedGenre)) {
      const same = scored.filter((x) => x.rel === 2);
      if (same.length >= 3) chosen = same;
      else {
        const close = scored.filter((x) => x.rel >= 1);
        chosen = close.length >= 3 ? close : scored;
      }
    }
    // keeps the radio's own order inside each group: that order is its idea of what's most alike
    chosen = chosen.slice().sort((x, y) => (y.rel - x.rel) || (x.i - y.i));
    const perCount = new Map();
    const out = [];
    const spare = [];
    for (const x of chosen) {
      const key = fold(x.t.artist).replace(/[^\p{L}\p{N}]/gu, '');
      const n = perCount.get(key) || 0;
      // the seed's own artist counts as already played once
      const cap = sameArtist(x.t.artist, seedArtist) ? Math.max(1, perArtist - 1) : perArtist;
      if (n >= cap) { spare.push(x.t); continue; }
      perCount.set(key, n + 1);
      out.push(x.t);
    }
    return out.length >= 3 ? out : out.concat(spare).slice(0, 8);
  }

  root.MurielAutoplay = { isNameMatch, isOtherVersion, family, relation, pick };
})(typeof window !== 'undefined' ? window : globalThis);
