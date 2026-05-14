const NormalizationService = require('./normalizationService');
const ConfidenceScorer = require('./confidenceScorer');

class SmartParser {
  constructor() {
    this.threshold = 0.5;
    this.fieldConfig = {
      supplier: { keywords: ['SCA', 'SAICA', 'DS SMITH', 'SOTIPAPIER', 'MODERN KARTON', 'HAMBURGER', 'ARLANDUO', 'PRINZHORN', 'EUROKRAFT', 'LINERPAC'] },
      reel_serial_number: { keywords: ['REEL', 'BOBINA', 'BOBINE', 'ROLL', 'SERIAL', 'N°', 'NO', 'CODE', 'PRODUCT'] },
      weight_kg: { keywords: ['KG', 'KGS', 'PESO', 'WEIGHT', 'POIDS'] },
      width_mm: { keywords: ['MM', 'CM', 'WIDTH', 'ANCHURA', 'ANCHO', 'LAIZE', 'LARGEUR', 'ENI'] },
      grammage: { keywords: ['G/M²', 'G/M2', 'GRAMMAGE', 'SUBSTANCE', 'BASIS WEIGHT', 'GRAMAJE'] },
    };
  }

  parse(payload = {}) {
    // Compatibilité ascendante : accepter un appel avec une chaîne brute.
    // Normalement, un objet {rawText, normalizedText, words} doit être fourni
    // (voir ocrService.js) — une chaîne donnera des résultats vides car les
    // propriétés .rawText/.normalizedText/.words seraient indéfinies.
    if (typeof payload === 'string') {
      payload = { rawText: payload };
    }

    const rawText = payload.rawText || '';
    const normalizedText = payload.normalizedText || NormalizationService.normalizeText(rawText);
    const words = Array.isArray(payload.words) ? payload.words : [];
    const lines = Array.isArray(payload.lines) ? payload.lines : this.buildLinesFromWords(words, normalizedText);

    const debug = { normalizationApplied: true, linesCount: lines.length, fieldDebug: {} };

    let supplier = this._parseSupplier(normalizedText, lines, debug);
    let reel = this._parseSerial(normalizedText, lines, debug);
    let weight = this._parseNumericContext(normalizedText, lines, 'weight_kg', debug);
    let width = this._parseNumericContext(normalizedText, lines, 'width_mm', debug);
    let grammage = this._parseNumericContext(normalizedText, lines, 'grammage', debug);

    // Fallback label-centric parsing for real photos where OCR misses unit tokens
    // on first pass (e.g. "g/m²", "mm", "kg" partially fragmented).
    const fallback = this._parseLabelStyleFallback(normalizedText);
    if (!supplier.value && fallback.supplier) supplier = fallback.supplier;
    if (!reel.value && fallback.reel_serial_number) reel = fallback.reel_serial_number;
    if (!weight.value && fallback.weight_kg) weight = fallback.weight_kg;
    if (!width.value && fallback.width_mm) width = fallback.width_mm;
    if (!grammage.value && fallback.grammage) grammage = fallback.grammage;

    return {
      supplier,
      reel_serial_number: reel,
      weight_kg: weight,
      width_mm: width,
      grammage,
      bobine_place: { value: '', confidence: 0, source: 'manual', reason: 'requires user input' },
      debug,
    };
  }

  _parseSupplier(normalizedText, lines, debug) {
    const candidates = [];
    const U = (normalizedText || '').toUpperCase();

    for (const s of this.fieldConfig.supplier.keywords) {
      if (U.includes(s)) {
        candidates.push({ value: s, confidence: 0.95, source: 'full-text', reason: 'keyword in full text' });
      }
    }

    if (!candidates.length) {
      for (const l of lines) {
        const t = (l.text || '').toUpperCase();
        for (const s of this.fieldConfig.supplier.keywords) {
          if (t.includes(s)) {
            candidates.push({ value: s, confidence: 0.92, source: `line:${l.index}`, reason: 'keyword in line', bbox: l.bbox || null });
          }
        }
      }
    }

    // Fuzzy supplier normalization (SAICA often OCR'd with 5/1/l confusion).
    if (!candidates.length && /\b(?:HIDROSAICA|S[5S][A4][I1L]CA|SA[1IL]CA)\b/i.test(U)) {
      candidates.push({ value: 'SAICA', confidence: 0.9, source: 'fuzzy', reason: 'fuzzy supplier match' });
    }

    return this._selectBest('supplier', candidates, debug);
  }

  _parseSerial(normalizedText, lines, debug) {
    const candidates = [];
    const serialRegex = /\b\d{6,14}\b/g;

    for (let i = 0; i < lines.length; i++) {
      const context = this._getContextLines(lines, i, 1);
      for (const c of context) {
        const txt = c.text || '';
        const matches = txt.match(serialRegex) || [];
        for (const m of matches) {
          const score = this._score({ value: m, type: 'reel_serial_number', text: txt, line: c });
          candidates.push({ value: m, confidence: score, source: `line:${c.index}`, reason: 'numeric match', bbox: c.bbox || null });
        }
      }
    }

    const matches = (normalizedText || '').match(serialRegex) || [];
    for (const m of matches) {
      const s = this._score({ value: m, type: 'reel_serial_number', text: normalizedText, line: null });
      candidates.push({ value: m, confidence: s, source: 'fullText', reason: 'numeric match full text', bbox: null });
    }

    // Handle split serials like "25 16091328" -> "2516091328".
    const grouped = [
      ...((normalizedText || '').match(/\b(?:\d{1,4}[\s-]){1,4}\d{4,10}\b/g) || []),
      ...((normalizedText || '').match(/(?:\d[\s-]?){8,14}/g) || []),
    ];
    for (const g of grouped) {
      const digits = String(g).replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 14) continue;
      const s = this._score({ value: digits, type: 'reel_serial_number', text: normalizedText, line: null });
      const lenBoost = (digits.length >= 9 && digits.length <= 12) ? 0.16 : 0.08;
      candidates.push({ value: digits, confidence: Math.min(1, s + lenBoost), source: 'groupedDigits', reason: 'grouped digits normalized', bbox: null });
    }

    return this._selectBest('reel_serial_number', candidates, debug);
  }

  _parseNumericContext(normalizedText, lines, field, debug) {
    const candidates = [];

    for (let i = 0; i < lines.length; i++) {
      const context = this._getContextLines(lines, i, 1);
      const cands = this._extractNumericByPatterns(context, field);
      candidates.push(...cands);
    }

    candidates.push(...this._extractNumericByPatterns([{ text: normalizedText, bbox: null, index: 0 }], field));

    let best = this._selectBest(field, candidates, debug);

    if (!best || !best.value || best.confidence < this.threshold) {
      debug.fieldDebug[field] = debug.fieldDebug[field] || {};
      debug.fieldDebug[field].manualRequired = true;
      return { value: '', confidence: 0, source: null, reason: 'low confidence', candidates: candidates.slice(0, 10) };
    }

    if (field === 'width_mm') {
      let v = this._toNumber(best.value);
      const sourceText = (best.source || '').toLowerCase();
      if (v !== null) {
        if (v < 400 && sourceText.includes('cm')) v = v * 10;
        if (v < 400 && !sourceText.includes('mm') && !sourceText.includes('cm')) v = v * 10;
        best.value = String(Math.round(v));
      }
    }

    return best;
  }

  _extractNumericByPatterns(lines, field) {
    const patterns = this._getPatterns(field);
    const candidates = [];

    for (const l of lines) {
      const txt = l.text || '';
      for (const p of patterns) {
        const m = txt.match(p);
        if (!m) continue;
        const value = m[1] || m[0];
        const score = this._score({ value, type: field, text: txt, line: l });
        candidates.push({ value, confidence: score, source: `line:${l.index}`, reason: 'pattern match', bbox: l.bbox || null });
      }
    }
    return candidates;
  }

  _getPatterns(field) {
    switch (field) {
      case 'weight_kg':
        return [
          /(\d{3,5})\s*(?:k\s*g|kg|kgs|ko|peso|weight|poids|\[kg\])/i,
          /(?:k\s*g|kg|kgs|ko|peso|weight|poids|\[kg\])\s*[:\s]*([0-9][0-9.,]{2,6})/i,
        ];
      case 'width_mm':
        return [
          /(\d{3,5}(?:[.,]\d+)?)\s*(?:m\s*m|mm|cm|width|ancho|laize|largeur|eni|\[mm\]|\[cm\])/i,
          /(?:m\s*m|mm|cm|width|ancho|laize|largeur|eni|\[mm\]|\[cm\])\s*[:\s]*([0-9][0-9.,]{2,6})/i,
        ];
      case 'grammage':
        return [
          /(\d{2,4})\s*(?:g\s*\/\s*m[²2]?|g\s*\/\s*rn2|gsm|grammage|substance|basis weight|gr)\b/i,
          /(?:g\s*\/\s*m[²2]?|g\s*\/\s*rn2|gsm|grammage|substance|basis weight|gr)\s*[:\s]*([0-9]{2,4})/i,
        ];
      default:
        return [];
    }
  }

  _score({ value, type, text, line }) {
    let score = 0.35;
    const normText = (text || '').toUpperCase();

    const keywords = (this.fieldConfig[type] && this.fieldConfig[type].keywords) || [];
    score += this._nearKeywordBoost(normText, String(value), keywords);

    if (line && line.bbox) score += this._bboxBoost(line.bbox, type, normText);

    score += this._numericPlausibilityBoost(value, type);

    score += this._contextBoost(normText, type);

    try {
      score += parseFloat(ConfidenceScorer.calculate(String(value), type, normText) || 0);
    } catch (e) {
      // ignore
    }

    score = Math.min(score, 1);
    return Number(score.toFixed(2));
  }

  _nearKeywordBoost(text, value, keywords) {
    if (!value) return 0;
    let boost = 0;
    const vIdx = text.indexOf(String(value).toUpperCase());
    keywords.forEach((k) => {
      const kIdx = text.indexOf(k.toUpperCase());
      if (kIdx >= 0 && vIdx >= 0) {
        const d = Math.abs(kIdx - vIdx);
        if (d <= 12) boost += 0.22;
        else if (d <= 30) boost += 0.12;
        else if (d <= 60) boost += 0.05;
      }
    });
    return Math.min(boost, 0.28);
  }

  _bboxBoost(bbox, type, text) {
    if (!bbox) return 0;
    let b = 0;
    const w = bbox.width || 0;
    const h = bbox.height || 0;
    if (type === 'reel_serial_number') {
      if (w >= 80 && h <= 45) b += 0.12;
      if (w >= 140) b += 0.08;
    } else {
      if (h <= 50) b += 0.08;
      if (w >= 40) b += 0.05;
    }
    if (/[A-Z]/i.test(text) && /[0-9]/.test(text)) b += 0.05;
    return Math.min(b, 0.2);
  }

  _numericPlausibilityBoost(value, type) {
    const digits = String(value).replace(/\D/g, '').length;
    let b = 0;
    if (type === 'reel_serial_number' && digits >= 6) b += 0.12;
    if (type === 'reel_serial_number' && digits >= 9 && digits <= 12) b += 0.22;
    if (type === 'weight_kg' && digits >= 3) b += 0.08;
    if (type === 'width_mm' && digits >= 3) b += 0.08;
    if (type === 'grammage' && digits <= 4) b += 0.06;
    return type === 'reel_serial_number' ? Math.min(b, 0.34) : Math.min(b, 0.2);
  }

  _contextBoost(text, type) {
    let b = 0;
    const t = (text || '').toLowerCase();
    if (type === 'reel_serial_number' && t.match(/reel|bobin|bobine|roll|serial|n°|no|code|product/)) b += 0.16;
    if (type === 'weight_kg' && t.match(/kg|k g|peso|weight|poids|ko/)) b += 0.16;
    if (type === 'width_mm' && t.match(/mm|m m|cm|width|ancho|laize|largeur|eni/)) b += 0.16;
    if (type === 'grammage' && t.match(/g\/m|g\s*\/\s*m|gsm|grammage|substance|basis weight|gr/)) b += 0.16;
    return Math.min(b, 0.18);
  }

  _selectBest(field, candidates, debug) {
    let sorted = (candidates || []).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    // If reel serials, prefer plausible substrings (avoid accidental leading digits)
    if (field === 'reel_serial_number' && sorted.length > 1) {
      const normalizeDigits = (v) => (String(v || '').replace(/\D/g, ''));
      // build map of digits -> candidate
      const map = sorted.map((c) => ({ c, d: normalizeDigits(c.value) }));
      for (let i = 0; i < map.length; i++) {
        for (let j = i + 1; j < map.length; j++) {
          const a = map[i];
          const b = map[j];
          if (!a.d || !b.d) continue;
          // if one is substring of the other
          if (a.d.includes(b.d) || b.d.includes(a.d)) {
            // prefer shorter reasonable ID if confidences are close
            const aConf = parseFloat(a.c.confidence || 0);
            const bConf = parseFloat(b.c.confidence || 0);
            if (a.d.length > b.d.length && (bConf + 0.12) >= aConf) {
              // move b ahead of a
              sorted = sorted.filter(x => x !== a.c);
              sorted.unshift(b.c);
            } else if (b.d.length > a.d.length && (aConf + 0.12) >= bConf) {
              sorted = sorted.filter(x => x !== b.c);
              sorted.unshift(a.c);
            }
          }
        }
      }
    }

    const best = sorted[0];
    let chosen = best && best.confidence >= this.threshold ? best : null;

    // Post-process reel serial numbers: if OCR produced a long number starting with '1',
    // see if removing a leading '1' yields a more plausible serial (common OCR noise).
    if (field === 'reel_serial_number' && chosen && typeof chosen.value === 'string') {
      const digits = String(chosen.value).replace(/\D/g, '');
      if (digits.length > 10 && digits.startsWith('1')) {
        const altDigits = digits.slice(1);
        // build a context text from candidates or source
        const contextText = (chosen.source || '') + ' ' + (sorted[1]?.source || '');
        const altConfidence = parseFloat(ConfidenceScorer.calculate(altDigits, 'reel_serial_number', contextText) || 0);
        // prefer alt if its domain score is close enough or above threshold
        if ((altConfidence + 0.12) >= (parseFloat(chosen.confidence || 0)) || altConfidence >= this.threshold) {
          chosen = Object.assign({}, chosen, { value: altDigits, confidence: Math.max(altConfidence, chosen.confidence - 0.05) });
        }
      }
    }

    debug.fieldDebug[field] = {
      chosen: chosen || null,
      candidates: sorted.slice(0, 10),
      threshold: this.threshold,
      status: chosen ? 'selected' : 'manual_required',
    };

    if (!chosen) {
      return { value: '', confidence: 0, source: null, reason: 'manual_required', candidates: sorted.slice(0, 10) };
    }

    return {
      value: String(chosen.value).trim(),
      confidence: chosen.confidence,
      source: chosen.source || null,
      reason: chosen.reason || null,
      candidates: sorted.slice(0, 5),
    };
  }

  _getContextLines(lines, i, radius = 1) {
    const idx = i || 0;
    return lines.filter((l) => Math.abs((l.index || 0) - idx) <= radius);
  }

  buildLinesFromWords(words = [], normalizedText = '') {
    const wordsWithBoxes = (words || []).filter((w) => w && w.bbox);
    if (!wordsWithBoxes.length) {
      return (normalizedText || '').split(/\r?\n/).map((t, idx) => ({ index: idx, text: (t || '').trim(), bbox: null, words: [] })).filter(l => l.text);
    }

    const rows = [];
    for (const w of wordsWithBoxes) {
      const centerY = ((w.bbox.top || 0) + (w.bbox.bottom || 0)) / 2;
      let g = rows.find(r => Math.abs(r.centerY - centerY) <= 18);
      if (!g) {
        g = { centerY, words: [], bbox: { left: w.bbox.left, top: w.bbox.top, right: w.bbox.right, bottom: w.bbox.bottom } };
        rows.push(g);
      }
      g.words.push(w);
      g.bbox.left = Math.min(g.bbox.left, w.bbox.left);
      g.bbox.top = Math.min(g.bbox.top, w.bbox.top);
      g.bbox.right = Math.max(g.bbox.right, w.bbox.right);
      g.bbox.bottom = Math.max(g.bbox.bottom, w.bbox.bottom);
    }

    return rows.map((r, idx) => {
      const sortedWords = r.words.sort((a, b) => (a.bbox.left || 0) - (b.bbox.left || 0));
      return { index: idx, text: sortedWords.map(w => w.text).join(' ').trim(), words: sortedWords, bbox: r.bbox };
    }).sort((a, b) => (a.bbox.top || 0) - (b.bbox.top || 0));
  }

  _toNumber(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  _candidate(value, confidence, source, reason) {
    return {
      value: String(value || '').trim(),
      confidence: Number(confidence || 0),
      source,
      reason,
      candidates: [],
    };
  }

  _parseLabelStyleFallback(normalizedText = '') {
    const text = String(normalizedText || '');
    const upper = text.toUpperCase();
    const out = {};

    if (/\b(?:SAICA|HIDROSAICA|S[5S][A4][I1L]CA)\b/i.test(upper)) {
      out.supplier = this._candidate('SAICA', 0.9, 'fallback', 'supplier fallback pattern');
    }

    // Grammage: e.g. "105 g/m²"
    const grammageMatch = upper.match(/\b([7-9]\d|[1-3]\d{2})\s*(?:G\s*\/\s*(?:M[²2]|RN2)|GSM)\b/i);
    if (grammageMatch) {
      out.grammage = this._candidate(grammageMatch[1], 0.86, 'fallback', 'grammage fallback pattern');
    }

    // Width in mm: e.g. "1920 mm"
    const widthMatch = upper.match(/\b([5-9]\d{2}|[1-2]\d{3})\s*(?:M\s*M|MM)\b/i);
    if (widthMatch) {
      out.width_mm = this._candidate(widthMatch[1], 0.86, 'fallback', 'width fallback pattern');
    }

    // Weight in kg: e.g. "2200 kg"
    const weightMatch = upper.match(/\b([5-9]\d{2}|[1-4]\d{3}|5000)\s*(?:K\s*G|KG|KGS)\b/i);
    if (weightMatch) {
      out.weight_kg = this._candidate(weightMatch[1], 0.86, 'fallback', 'weight fallback pattern');
    }

    // Serial: choose longest plausible id (9-12 digits) not equal to known dimensions.
    const serialCands = [
      ...(upper.match(/\b\d{8,14}\b/g) || []),
      ...(upper.match(/\b(?:\d{1,4}[\s-]){1,4}\d{4,10}\b/g) || []),
    ]
      .map((v) => String(v).replace(/\D/g, ''))
      .filter((v) => v.length >= 9 && v.length <= 12);
    if (serialCands.length) {
      serialCands.sort((a, b) => b.length - a.length);
      out.reel_serial_number = this._candidate(serialCands[0], 0.85, 'fallback', 'serial fallback longest plausible id');
    }

    return out;
  }
}

module.exports = new SmartParser();

