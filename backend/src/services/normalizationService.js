const NORMALIZATION_RULES = {
    supplier: {
        corrections: {
            'SAlCA': 'SAICA',
            'SA1CA': 'SAICA',
            'SA ICA': 'SAICA',
            'SMURF1T': 'SMURFIT',
            'SMURFIT KAPPA': 'SMURFIT',
            'DS SMITH': 'DS Smith',
            'DS $MITH': 'DS Smith'
        },
        caseNormalize: true,
        trimWhitespace: true
    },
    
    width: {
        removeNonNumeric: true,
        minLength: 3,
        maxLength: 4,
        validRange: [800, 5000]
    },
    
    weight: {
        removeNonNumeric: true,
        minLength: 3,
        maxLength: 5,
        validRange: [500, 10000]
    },
    
    reel_serial_number: {
        removeNonNumeric: true,
        minLength: 10,
        maxLength: 15,
        allowedPrefixes: ['46', '25', '66', '4', '2', '6']
    }
};

const COMMON_OCR_ERRORS = {
    '0': ['O', 'o', 'Q', 'D'],
    '1': ['l', 'I', '|', '!', 'i'],
    '2': ['Z', 'z'],
    '3': ['B'],
    '4': ['A', 'h'],
    '5': ['S'],
    '6': ['G', 'b'],
    '7': ['T', 'L'],
    '8': ['B', '3'],
    '9': ['g', 'q'],
    'A': ['4'],
    'B': ['8', '3'],
    'D': ['0', 'O'],
    'I': ['1', 'l', '|'],
    'O': ['0', 'Q'],
    'S': ['5'],
    'T': ['7'],
    'Z': ['2']
};

class NormalizationService {
    constructor() {
        this.rules = NORMALIZATION_RULES;
    }

    normalize(fieldName, value) {
        if (!value) return value;
        
        let normalized = value;
        
        if (this.rules[fieldName]) {
            normalized = this.applyRules(fieldName, normalized);
        }
        
        normalized = this.correctCommonOCRErrors(normalized);
        
        return normalized;
    }

    applyRules(fieldName, value) {
        const rules = this.rules[fieldName];
        let result = value;
        
        if (rules.corrections) {
            for (const [wrong, correct] of Object.entries(rules.corrections)) {
                const regex = new RegExp(this.escapeRegex(wrong), 'gi');
                result = result.replace(regex, correct);
            }
        }
        
        if (rules.caseNormalize) {
            result = result.trim();
        }
        
        if (rules.trimWhitespace) {
            result = result.replace(/\s+/g, ' ').trim();
        }
        
        if (rules.removeNonNumeric) {
            result = result.replace(/\D/g, '');
        }
        
        return result;
    }

    correctCommonOCRErrors(value) {
        if (!value || typeof value !== 'string') return value;
        
        let corrected = value;
        
        if (/^\d+$/.test(value)) {
            corrected = this.correctNumericString(corrected);
        }
        
        return corrected;
    }

    correctNumericString(value) {
        let corrected = value;
        
        if (value.match(/^2OO[0O]$/i)) {
            corrected = value.replace(/O/gi, '0');
        }
        
        if (value.match(/^1[liI|!]+[0-9]{3}$/i)) {
            corrected = corrected.replace(/[liI|!]/g, '1');
        }
        
        if (value.match(/^[0-9]+$/)) {
            let lastChar = corrected[corrected.length - 1];
            if (['l', 'I', '|'].includes(lastChar)) {
                corrected = corrected.slice(0, -1) + '1';
            }
        }
        
        return corrected;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    isInValidRange(fieldName, value) {
        const rules = this.rules[fieldName];
        if (!rules || !rules.validRange) return true;
        
        const numericValue = parseInt(value, 10);
        if (isNaN(numericValue)) return false;
        
        return numericValue >= rules.validRange[0] && numericValue <= rules.validRange[1];
    }

    normalizeAllFields(fields) {
        const normalized = {};
        
        for (const [fieldName, fieldData] of Object.entries(fields)) {
            if (fieldData.value) {
                normalized[fieldName] = {
                    ...fieldData,
                    originalValue: fieldData.value,
                    normalizedValue: this.normalize(fieldName, fieldData.value)
                };
                
                normalized[fieldName].value = normalized[fieldName].normalizedValue;
            } else {
                normalized[fieldName] = fieldData;
            }
        }
        
        return normalized;
    }
}

module.exports = NormalizationService;