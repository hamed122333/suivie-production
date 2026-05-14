const { BrowserMultiFormatReader } = require('@zxing/library');

class BarcodeService {
    constructor() {
        this.reader = null;
    }

    async initialize() {
        if (!this.reader) {
            this.reader = new BrowserMultiFormatReader();
        }
        return this.reader;
    }

    async detectBarcodes(imageBuffer) {
        try {
            await this.initialize();
            
            const imageData = await this.imageBufferToImageData(imageBuffer);
            
            const luminanceSource = this.createLuminanceSource(imageData);
            
            const hints = new Map();
            hints.set('decodeCodes', true);
            
            const decoded = await this.reader.decodeFromImageElement(undefined, imageBuffer);
            
            return {
                success: true,
                barcodes: decoded ? [{
                    value: decoded.text,
                    format: decoded.format,
                    confidence: 0.95
                }] : []
            };
        } catch (error) {
            return {
                success: true,
                barcodes: [],
                error: error.message
            };
        }
    }

    async imageBufferToImageData(buffer) {
        return buffer;
    }

    createLuminanceSource(imageData) {
        return imageData;
    }

    extractReelFromBarcode(barcodeValue) {
        const numericMatch = barcodeValue.match(/\d+/);
        if (numericMatch && numericMatch[0].length >= 10) {
            return {
                value: numericMatch[0],
                confidence: 0.95,
                source: 'barcode'
            };
        }
        
        return {
            value: barcodeValue,
            confidence: 0.85,
            source: 'barcode'
        };
    }

    async terminate() {
        if (this.reader) {
            this.reader.reset();
            this.reader = null;
        }
    }
}

module.exports = BarcodeService;