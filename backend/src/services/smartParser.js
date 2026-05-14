const SUPPLIER_PATTERNS = {
    saica: [/\b(SAICA)\b/i, /HIDROSAICA/i, /SAICA\s/i],
    smurfit: [/\b(SMURFIT|KAPPA)\b/i, /SMURFIT/i, /kappa/i],
    papresa: [/\b(PAPRESA)\b/i, /PAPRESA/i],
    sca: [/\b(SCA)\b/i, /\sSCA\s/i],
    dsSmith: [/\b(DS\s*Smith)\b/i, /DS\s*Smith/i],
    greenliner: [/\b(GREENLINER)\b/i, /GREENLINER/i],
    modernKarton: [/\b(MODERN\s*KARTON)\b/i, /MODERN\s*KARTON/i],
    batiKipas: [/\b(BATI\s*KIPAS)\b/i, /BATI\s*KIPAS/i],
    intepac: [/\b(INTEPAC)\b/i, /INTEPAC/i],
    renova: [/\b(RENOVA)\b/i, /RENOVA/i],
    lwarbee: [/\b(LWARBEE)\b/i, /LWARBEE/i]
};

const SUPPLIER_NAMES = {
    saica: 'SAICA',
    smurfit: 'Smurfit',
    papresa: 'PAPRESA',
    sca: 'SCA',
    dsSmith: 'DS Smith',
    greenliner: 'GREENLINER',
    modernKarton: 'MODERN KARTON',
    batiKipas: 'BATI KIPAS',
    intepac: 'INTEPAC',
    renova: 'RENOVA',
    lwarbee: 'LWARBEE'
};

const WIDTH_PATTERNS = [
    /\b(\d{3,4})\s*(?:mm|MM|Mm)?\b/,
    /(?:Larg|larg|LARG|Largeur)[:\s]*(\d{3,4})/i,
    /\b(\d{3,4})\s*(?:cm|CM)\b/,
    /(?:WIDTH|width|Width)[:\s]*(\d{3,4})/i,
    /\b(\d{4})\b/
];

const WEIGHT_PATTERNS = [
    /\b(\d{3,4})\s*(?:kg|KG|Kg)\b/,
    /(?:Poid|poid|POID)[:\s]*(\d{3,4})/i,
    /(?:WEIGHT|Weight)[:\s]*(\d{3,4})/i,
    /\b(\d{3,4})\s*(?:Kg)\b/
];

const REEL_PATTERNS = [
    /\b(\d{10,15})\b/,
    /\b(46\d{10})\b/,
    /\b(25\d{9})\b/,
    /\b(66\d{12})\b/,
    /(?:Rouleau|bobina|roll|reel)[#:\s]*(\S+)/gi,
    /(?:Serial|SERIAL|serial)[:\s]*(\S+)/gi
];

const COMMON_NOISE_PATTERNS = [
    'TEL', 'FAX', 'PHONE', 'EMAIL', 'WWW', 'HTTP',
    'DATE', 'TIME', 'ORDER', 'PO', 'QUANTITY'
];

class SmartParser {
    constructor() {
        this.suppliers = SUPPLIER_NAMES;
    }

    parseAll(rawText, options = {}) {
        const normalizedText = this.normalizeText(rawText);
        
        return {
            supplier: this.extractSupplier(normalizedText),
            width: this.extractWidth(normalizedText),
            weight: this.extractWeight(normalizedText),
            reel_serial_number: this.extractReelNumber(normalizedText)
        };
    }

    normalizeText(text) {
        let normalized = text
            .replace(/[oO](?=[\d]{3})/g, '0')
            .replace(/\b2OOO\b/g, '2000')
            .replace(/\bO\d{3}\b/g, (match) => match.replace(/O/g, '0'))
            .replace(/[|]/g, 'I')
            .replace(/\bSAICA\b/gi, 'SAICA')
            .replace(/\bSMURFIT\b/gi, 'SMURFIT')
            .replace(/\s+/g, ' ')
            .trim();
        
        return normalized;
    }

    extractSupplier(text) {
        let bestMatch = { value: null, confidence: 0, type: null };
        
        for (const [key, patterns] of Object.entries(SUPPLIER_PATTERNS)) {
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    const confidence = 0.9;
                    if (confidence > bestMatch.confidence) {
                        bestMatch = {
                            value: SUPPLIER_NAMES[key],
                            confidence,
                            type: key
                        };
                    }
                    break;
                }
            }
        }
        
        if (!bestMatch.value) {
            const fuzzyMatch = this.fuzzyMatchSupplier(text);
            if (fuzzyMatch) {
                bestMatch = fuzzyMatch;
            }
        }
        
        return bestMatch;
    }

    fuzzyMatchSupplier(text) {
        const upperText = text.toUpperCase();
        
        for (const [key, name] of Object.entries(SUPPLIER_NAMES)) {
            const nameUpper = name.toUpperCase();
            
            if (this.calculateSimilarity(upperText, nameUpper) > 0.7) {
                return { value: name, confidence: 0.6, type: key };
            }
            
            const levenshteinSimilarity = this.levenshteinSimilarity(upperText, nameUpper);
            if (levenshteinSimilarity > 0.8) {
                return { value: name, confidence: 0.7, type: key };
            }
        }
        
        return null;
    }

    calculateSimilarity(text1, text2) {
        const longer = text1.length > text2.length ? text1 : text2;
        const shorter = text1.length > text2.length ? text2 : text1;
        
        if (longer.length === 0) return 1.0;
        
        const matches = [...longer].filter((char, i) => char === shorter[i]).length;
        return matches / longer.length;
    }

    levenshteinSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return 1 - editDistance / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2[i - 1] === str1[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    extractWidth(text) {
        const widths = [];
        
        for (const pattern of WIDTH_PATTERNS) {
            const matches = text.match(new RegExp(pattern, 'gi'));
            if (matches) {
                for (const match of matches) {
                    const value = parseInt(match.replace(/\D/g, ''), 10);
                    if (this.isValidWidth(value)) {
                        widths.push({
                            value: value.toString(),
                            confidence: this.calculateWidthConfidence(value, text),
                            raw: match
                        });
                    }
                }
            }
        }
        
        widths.sort((a, b) => b.confidence - a.confidence);
        
        return widths[0] || { value: null, confidence: 0 };
    }

    isValidWidth(value) {
        return value >= 800 && value <= 5000;
    }

    calculateWidthConfidence(value, text) {
        let confidence = 0.5;
        
        if (this.isValidWidth(value)) {
            confidence += 0.3;
        }
        
        if (text.toLowerCase().includes('width') || text.toLowerCase().includes('larg')) {
            confidence += 0.2;
        }
        
        return Math.min(0.95, confidence);
    }

    extractWeight(text) {
        const weights = [];
        
        for (const pattern of WEIGHT_PATTERNS) {
            const matches = text.match(new RegExp(pattern, 'gi'));
            if (matches) {
                for (const match of matches) {
                    const value = parseInt(match.replace(/\D/g, ''), 10);
                    if (this.isValidWeight(value)) {
                        weights.push({
                            value: value.toString(),
                            confidence: this.calculateWeightConfidence(value, text),
                            raw: match
                        });
                    }
                }
            }
        }
        
        weights.sort((a, b) => b.confidence - a.confidence);
        
        return weights[0] || { value: null, confidence: 0 };
    }

    isValidWeight(value) {
        return value >= 500 && value <= 10000;
    }

    calculateWeightConfidence(value, text) {
        let confidence = 0.5;
        
        if (this.isValidWeight(value)) {
            confidence += 0.3;
        }
        
        if (text.toLowerCase().includes('weight') || text.toLowerCase().includes('poid')) {
            confidence += 0.2;
        }
        
        return Math.min(0.95, confidence);
    }

    extractReelNumber(text) {
        const candidates = [];
        
        const longNumbers = text.match(/\b\d{10,15}\b/g);
        if (longNumbers) {
            for (const num of longNumbers) {
                if (this.isLikelyReelNumber(num)) {
                    candidates.push({
                        value: num,
                        confidence: 0.85,
                        raw: num
                    });
                }
            }
        }
        
        const specificPatterns = [
            /\b(46\d{8,12})\b/,
            /\b(25\d{7,10})\b/,
            /\b(66\d{10,14})\b/
        ];
        
        for (const pattern of specificPatterns) {
            const matches = text.match(new RegExp(pattern, 'gi'));
            if (matches) {
                for (const match of matches) {
                    candidates.push({
                        value: match,
                        confidence: 0.92,
                        raw: match
                    });
                }
            }
        }
        
        for (const pattern of REEL_PATTERNS) {
            const regex = new RegExp(pattern, 'gi');
            let match;
            while ((match = regex.exec(text)) !== null) {
                const extracted = match[1]?.replace(/\D/g, '') || match[0];
                if (extracted && extracted.length >= 8) {
                    candidates.push({
                        value: extracted,
                        confidence: 0.75,
                        raw: match[0]
                    });
                }
            }
        }
        
        candidates.sort((a, b) => b.confidence - a.confidence);
        
        const seen = new Set();
        return candidates.find(c => {
            if (seen.has(c.value)) return false;
            seen.add(c.value);
            return true;
        }) || { value: null, confidence: 0 };
    }

    isLikelyReelNumber(number) {
        const firstDigit = number[0];
        const length = number.length;
        
        if (firstDigit === '4' || firstDigit === '2' || firstDigit === '6') {
            return true;
        }
        
        if (length >= 12) {
            return true;
        }
        
        return false;
    }

    getSupportedSuppliers() {
        return Object.entries(SUPPLIER_NAMES).map(([key, name]) => ({
            key,
            name,
            pattern: SUPPLIER_PATTERNS[key]?.source
        }));
    }
}

module.exports = SmartParser;