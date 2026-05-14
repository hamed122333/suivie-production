const Tesseract = require('tesseract.js');

const LANGUAGE_CONFIG = {
    default: 'eng',
    supported: ['eng', 'fra', 'spa', 'deu', 'ita', 'por'],
    industrial: 'eng+fra+spa'
};

class OCRService {
    constructor(options = {}) {
        this.options = {
            language: LANGUAGE_CONFIG.industrial,
            logger: options.logger || console.log,
            ...options
        };
        this.worker = null;
    }

    async initialize() {
        if (this.worker) {
            try {
                await this.worker.terminate();
            } catch (e) {
                console.log('Worker cleanup:', e.message);
            }
            this.worker = null;
        }
        
        this.worker = await Tesseract.createWorker(this.options.language, 1, {
            logger: this.options.logger
        });
        return this.worker;
    }

    async extractText(imageBuffer, options = {}) {
        const startTime = Date.now();
        
        try {
            await this.initialize();
            
            const result = await this.worker.recognize(imageBuffer);
            
            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                rawText: result.data.text,
                confidence: result.data.confidence,
                words: result.data.words || [],
                lines: result.data.lines || [],
                processingTime,
                language: this.options.language
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                rawText: '',
                confidence: 0,
                processingTime: Date.now() - startTime
            };
        }
    }

    async extractTextMultipleLanguages(imageBuffer, languages = LANGUAGE_CONFIG.supported) {
        const results = [];
        
        for (const lang of languages) {
            try {
                const worker = await Tesseract.createWorker(lang);
                const result = await worker.recognize(imageBuffer);
                await worker.terminate();
                
                results.push({
                    language: lang,
                    text: result.data.text,
                    confidence: result.data.confidence
                });
            } catch (e) {
                console.log(`Failed for language ${lang}:`, e.message);
            }
        }
        
        const bestResult = results.reduce((best, current) => 
            current.confidence > (best?.confidence || 0) ? current : best
        , null);
        
        return {
            success: !!bestResult,
            results,
            bestLanguage: bestResult?.language,
            rawText: bestResult?.text || '',
            confidence: bestResult?.confidence || 0
        };
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

module.exports = OCRService;