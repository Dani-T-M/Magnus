/* Magnus – Hexenmeister: Gesicht, Stimmungen und Sprüche (keine KI, nur feste Texte) */
const Magnus = (() => {
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ---------- Gesicht: Hexenmeister mit Kapuze (SVG)
  // Stimmungen: happy, neutral, proud, alert, sleepy, think
  const EYE = { happy: '#5eead4', neutral: '#5eead4', proud: '#f6c453', alert: '#ff7a45', sleepy: '#3c6e68', think: '#a78bfa' };
  const AURA = { alert: '#ff7a45', proud: '#f6c453' };
  function face(mood = 'neutral', size = 48) {
    const eye = EYE[mood] || EYE.neutral, aura = AURA[mood] || '#7c5cff';
    const brows = {
      alert: 'M37 40 L47 44 M63 40 L53 44',
      happy: 'M37 42 L47 41.5 M63 41 L53 42',
      proud: 'M37 41 L47 41 M63 41 L53 41',
      sleepy: 'M37 43 L47 43.5 M63 43 L53 43.5',
      think: 'M37 40 L47 41 M63 42.5 L53 43.5',
    }[mood] || 'M37 42 L47 43.5 M63 42 L53 43.5';
    const mouth = mood === 'happy' || mood === 'proud' ? 'M45 65.5 q5 2.5 10 -1.5'
      : mood === 'alert' ? 'M46 65.5 h8' : mood === 'think' ? 'M46 65.5 q4 -1.5 8 0.5' : 'M46 65.5 h8';
    const eyes = mood === 'sleepy'
      ? `<path d="M39.5 48 h7 M53.5 48 h7" stroke="${eye}" stroke-width="2" stroke-linecap="round"/>`
      : [[43, 47.5], [57, 47.5]].map(([x, y], k) => {
          const big = mood === 'think' && k === 0 ? 2.3 : 1.8;
          return `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="2.4" fill="#0b0b10"/>
            <circle class="mg-glow" cx="${x}" cy="${y}" r="4.5" fill="${eye}" opacity=".28"/>
            <circle cx="${x}" cy="${y}" r="${big}" fill="${eye}"/>`;
        }).join('');
    const extra = mood === 'proud'
      ? `<path d="M83 18 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="${aura}"/><path d="M14 30 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" fill="${aura}"/>` : '';
    const vb = size < 44 ? '14 10 72 76' : '0 0 100 100';   // klein: näher ans Gesicht
    return `<svg class="magnus-face mood-${mood}" width="${size}" height="${size}" viewBox="${vb}" aria-label="Magnus">
      <circle cx="50" cy="52" r="47" fill="${aura}" opacity=".13"/>
      <circle class="mg-ring" cx="50" cy="52" r="44" fill="none" stroke="${aura}" stroke-width="1.6" stroke-dasharray="3 6 12 6" opacity=".8"/>
      <path d="M8 100 C12 80 28 72 50 70 C72 72 88 80 92 100 Z" fill="#1c1530"/>
      <path d="M50 3 C26 9 15 34 17 56 C18 70 23 80 30 87 L70 87 C77 80 82 70 83 56 C85 34 74 9 50 3 Z" fill="#2a1f47" stroke="#3d2d66" stroke-width="1.5"/>
      <path d="M50 12 C33 16 25 36 26 54 C27 67 33 77 40 84 L60 84 C67 77 73 67 74 54 C75 36 67 16 50 12 Z" fill="#0d0a16"/>
      <path d="M36 44 C36 30 42 23 50 23 C58 23 64 30 64 44 L63 58 C62 67 56 74 50 76 C44 74 38 67 37 58 Z" fill="#b98b6b"/>
      <path d="M57 27 C62 32 64 38 64 44 L63 58 C62 67 56 74 50 76 C55 70 58 62 58 52 C58 42 58 34 57 27 Z" fill="#000" opacity=".18"/>
      <path d="M35 42 C33.5 27 41 19 50 19 C59 19 66.5 27 65 42 C63.5 36 61 32.5 57.5 31.5 C53.5 30 46.5 30 42.5 31.5 C39 32.5 36.5 36 35 42 Z" fill="#1b1419"/>
      <path d="M41 24.5 q4 3 6.5 6 M49 21.5 q3.5 3.5 4 8.5 M58 24 q-1.5 3.5 -2.5 6.5 M37.5 33 q1.5 -4 4.5 -6" stroke="#3a2d3c" stroke-width="1" fill="none" stroke-linecap="round"/>
      <path d="M34 34 C38 17 62 17 66 34 C60 22 40 22 34 34 Z" fill="#0d0a16" opacity=".75"/>
      <path d="M37.5 58 C39 69 44 76 50 77.5 C56 76 61 69 62.5 58 C59 64 55 67 50 67 C45 67 41 64 37.5 58 Z" fill="#241c2e"/>
      <path d="M43.5 62.5 q6.5 -3.5 13 0 q-6.5 1.2 -13 0" fill="#241c2e"/>
      <path d="${brows}" stroke="#1a1420" stroke-width="2.6" stroke-linecap="round"/>
      ${eyes}
      <path d="${mouth}" stroke="#4a2f2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M50 86 l4 5 -4 5 -4 -5z" fill="${eye}"/>
      ${extra}</svg>`;
  }

  // ---------- Sprüche (trocken, cool, trotzdem auf deiner Seite)
  const T = {
    greet: {
      night: ['Noch wach{n}? Die Nacht gehört den Magiern – aber auch du brauchst Schlaf.', 'Späte Stunde{n}. Ich halte Wache.'],
      morning: ['Guten Morgen{n}. Der Tag liegt vor dir – ich halte die Fäden.', 'Morgen{n}. Erst Wasser, dann die Welt.', 'Guten Morgen{n}. Lass uns Ordnung ins Chaos bringen.'],
      day: ['Da bist du{n}. Ich hab alles im Blick.', 'Willkommen zurück{n}. Nichts ist mir entgangen.', 'Hey{n}. Lass uns weitermachen.'],
      evening: ['Guten Abend{n}. Das Tagwerk ist fast getan.', 'Abend{n}. Zeit, die Fäden zu bündeln.', 'Guten Abend{n}. Bald ist Ruhe.'],
    },
    saved: ['Notiert. Du kannst es vergessen – ich nicht.', 'Festgehalten.', 'Ist in meinem Buch.', 'Gebannt. Kopf frei.', 'Gespeichert. Weiter.'],
    done: ['Erledigt. Gut so.', 'Sauber{n}.', 'Eins weniger. Weiter.', 'Das war stark{n}.', 'Haken dran. So läuft das.', 'Gut gemacht{n}. Ich hab\'s gesehen.', 'Erledigt – wie es sich gehört.'],
    snooze: ['Gut. Ich komme wieder.', 'Aufgeschoben – nicht aufgehoben. Ich melde mich.', 'In Ordnung. Ich vergesse nichts.'],
    postpone: ['Nicht jetzt? Dann eben was anderes.', 'Verstanden. Es läuft nicht weg.', 'Gut. Ich behalte es im Auge.'],
    skip: ['Dann vielleicht das hier.', 'Nächster Vorschlag:', 'Wie wär\'s damit?'],
    suggest: ['Das hier. Jetzt.', 'Mein Rat: fang hiermit an.', 'Das passt gerade. Los.', 'Eine Sache. Diese hier.'],
    nothing: ['Nichts, was jetzt drängt. Gönn dir die Pause.', 'Alles erledigt, was jetzt passt. Durchatmen.'],
    focusStart: ['Fokus. Ich halte dir den Rücken frei.', 'Eine Sache. Volle Kraft. Los.', 'Der Bann ist gesprochen – Handy weg.'],
    focusHalf: ['Halbzeit. Du bist voll drin.', 'Die Hälfte ist geschafft. Nicht nachlassen.'],
    focusEnd: ['Geschafft. Jetzt kurz bewegen.', 'Fokuszeit vorbei. Respekt.'],
    split: ['Kleine Schritte – so bricht man jeden Berg.', 'Zerlegt. Jetzt ist es machbar.'],
    review: ['Danke. Ich sag dir morgen früh, was du mir aufgetragen hast.', 'Festgehalten. Schlaf gut{n}.'],
    star: ['Gute Wahl für heute.', 'Gesetzt. Das zählt heute.'],
    tooMany: ['Drei sind genug. Mehr verwässert den Tag.'],
    deleted: ['Weg damit.', 'Gelöscht. Auch Loslassen ist eine Entscheidung.'],
    sorted: ['Einsortiert.', 'An seinem Platz.'],
    saved_generic: ['Gespeichert.', 'Erledigt.'],
    error: ['Da ist etwas schiefgelaufen.'],
  };

  const TIPS = [
    'Die 2-Minuten-Regel: Was unter 2 Minuten dauert, gleich erledigen.',
    'Der erste Schritt darf lächerlich klein sein. „Laptop aufklappen“ zählt!',
    'Schlüssel, Geldbeutel, Handy: immer derselbe Platz – spart jeden Tag Suchzeit.',
    'Stell dir einen Timer, auch für Pausen. Zeit fühlt sich sonst anders an, als sie ist.',
    'Leg dir am Abend die Sachen für morgen bereit. Morgen-Du sagt danke.',
    'Was du sehen kannst, vergisst du seltener. Wichtige Dinge sichtbar hinlegen.',
    'Wenn-Dann-Pläne helfen: „Wenn ich Kaffee mache, dann räume ich die Spülmaschine aus.“',
    'Musik ohne Text kann beim Fokussieren helfen.',
    'Plan nur 3 wichtige Dinge pro Tag. Alles andere ist Bonus.',
    'Feier auch kleine Erfolge – dein Gehirn lernt so, dass sich Anfangen lohnt.',
    'Beim Fokus: Handy in einen anderen Raum. Aus den Augen, aus dem Sinn.',
    'Langeweile-Aufgabe? Mach sie zusammen mit etwas Angenehmem (Podcast, Musik).',
    'Essen und Trinken nicht vergessen – leerer Tank = weniger Konzentration.',
    'Wenn alles zu viel ist: Nur die nächste kleine Sache. Nicht der ganze Berg.',
    'Kopf voll? Alles in die Inbox schreiben. Sortieren kommt später.',
    'Gleiche Aufgaben bündeln: alle Anrufe auf einmal, alle Mails auf einmal.',
  ];

  function say(key, name = '') {
    const pool = T[key] || T.saved_generic;
    return pick(pool).replace(/\{n\}/g, name ? ', ' + name : '');
  }
  function greet(name) {
    const h = new Date().getHours();
    const part = h < 5 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 23 ? 'evening' : 'night';
    return pick(T.greet[part]).replace(/\{n\}/g, name ? ', ' + name : '');
  }
  function tipOfDay() {
    const d = new Date(); const k = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
    return TIPS[k % TIPS.length];
  }

  // Lagebericht für die Heute-Seite: { mood, lines: [..], action: {label, act, v} }
  function briefing(c) {
    const h = new Date().getHours();
    const lines = []; let mood = 'happy'; let action = null;
    if (c.overdue > 0) {
      lines.push(`Du hast ${c.overdue} überfällige Sache${c.overdue > 1 ? 'n' : ''}. Kein Drama – wir nehmen uns die kleinste zuerst vor.`);
      mood = 'alert'; action = { label: 'Zeig mir was', act: 'wn-open' };
    }
    if (c.lastNote && h < 14) lines.push(`Gestern Abend hast du mir gesagt: „${c.lastNote}“`);
    if (c.top === 0 && h < 15) lines.push('Such dir bis zu 3 Dinge für heute aus (☆). Mehr braucht\'s nicht.');
    if (c.dueToday > 0 && !c.overdue) lines.push(`Heute steht${c.dueToday > 1 ? 'en' : ''} ${c.dueToday} Termin${c.dueToday > 1 ? 'e' : ''} an – ich erinnere dich rechtzeitig.`);
    if (c.inbox >= 5) { lines.push(`In deiner Inbox liegen ${c.inbox} Notizen. 2 Minuten sortieren, dann ist der Kopf freier.`); action = action || { label: 'Inbox sortieren', act: 'go', v: 'inbox' }; }
    if (c.doneToday >= 5) { lines.push(`Schon ${c.doneToday} Sachen erledigt heute. Respekt.`); if (mood !== 'alert') mood = 'proud'; }
    else if (c.doneToday > 0) lines.push(`${c.doneToday} erledigt heute – der Anfang ist gemacht.`);
    if (h >= 19 && !c.reviewed) { lines.push('Zeit für den Rückblick. Zwei Minuten, mehr nicht.'); action = action || { label: 'Zum Rückblick', act: 'go', v: 'rueckblick' }; }
    if (h >= 23 || h < 5) mood = mood === 'alert' ? mood : 'sleepy';
    if (!lines.length) lines.push('Alles ruhig. Fällt dir was ein – oben rein damit, ich kümmere mich.');
    return { mood, lines, action };
  }

  return { face, say, greet, tipOfDay, briefing };
})();
