const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');

const PATTERNS = {
    lotCode: /[A-Z]{2,4}\d{2,4}[-]?\d{1,5}/gi,
    numericCode: /\d{6,12}/g,
    longBarcode: /\d{12,}/g,
    mixedCode: /[A-Z0-9]{6,20}/gi
};

const ocrService = {
    async processImage(imagePath) {
        const startTime = Date.now();
        
        try {
            const result = await Tesseract.recognize(imagePath, 'eng', {
                logger: () => {}
            });

            const text = result.data.text;
            const confidence = result.data.confidence / 100;
            
            const detectedCodes = this.extractCodes(text);
            
            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                codes: detectedCodes,
                rawText: text,
                confidence,
                processingTime,
                wordCount: result.data.words ? result.data.words.length : 0
            };
        } catch (error) {
            return {
                success: false,
                codes: [],
                error: error.message,
                processingTime: Date.now() - startTime
            };
        }
    },

    extractCodes(text) {
        const foundCodes = new Set();
        
        const extractPattern = (pattern) => {
            const matches = text.match(pattern) || [];
            matches.forEach(match => {
                const cleanCode = this.cleanCode(match);
                if (this.isValidCode(cleanCode)) {
                    foundCodes.add(cleanCode);
                }
            });
        };
        
        extractPattern(PATTERNS.lotCode);
        extractPattern(PATTERNS.numericCode);
        extractPattern(PATTERNS.longBarcode);
        extractPattern(PATTERNS.mixedCode);
        
        const codesArray = Array.from(foundCodes);
        
        return this.rankByConfidence(codesArray, text);
    },

    cleanCode(code) {
        return code
            .replace(/\s+/g, '')
            .replace(/[,;:\n\r]/g, '')
            .toUpperCase()
            .trim();
    },

    isValidCode(code) {
        if (!code || code.length < 5) return false;
        
        const commonNoise = ['THE', 'AND', 'FOR', 'TOP', 'LOT', 'MONDI', 'TELE', 'TEL', 'SLOVAKIA'];
        if (commonNoise.includes(code)) return false;
        
        const hasLetter = /[A-Z]/.test(code);
        const hasNumber = /\d/.test(code);
        
        return hasLetter || hasNumber;
    },

    rankByConfidence(codes, text) {
        const ranked = codes.map(code => {
            const occurrences = (text.match(new RegExp(code, 'gi')) || []).length;
            const lengthScore = Math.min(code.length / 15, 1);
            const occurrenceScore = Math.min(occurrences / 3, 1);
            const confidence = (lengthScore * 0.5) + (occurrenceScore * 0.5);
            
            return {
                code,
                confidence: Math.round(confidence * 100) / 100,
                occurrences
            };
        });
        
        ranked.sort((a, b) => b.confidence - a.confidence);
        
        return ranked.map(item => ({
            code: item.code,
            confidence: item.confidence,
            occurrences: item.occurrences
        }));
    },

    async preprocessImage(imagePath) {
        return imagePath;
    }
};

module.exports = ocrService;