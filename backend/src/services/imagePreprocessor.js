const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PREPROCESSING_CONFIG = {
    maxWidth: 2000,
    maxHeight: 2000,
    targetWidth: 1800,
    grayscale: true,
    contrast: 1.4,
    brightness: 1.1,
    sharpen: 0.3,
    threshold: 0.5,
};

class ImagePreprocessor {
    constructor(config = {}) {
        this.config = { ...PREPROCESSING_CONFIG, ...config };
    }

    async preprocess(inputBuffer) {
        try {
            let pipeline = sharp(inputBuffer);
            
            const metadata = await pipeline.metadata();
            if (metadata.width > this.config.maxWidth || metadata.height > this.config.maxHeight) {
                pipeline = pipeline.resize(this.config.targetWidth, null, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }
            
            if (this.config.grayscale) {
                pipeline = pipeline.grayscale();
            }
            
            pipeline = pipeline.modulate({
                brightness: this.config.brightness,
            }).linear(this.config.contrast, -(128 * (this.config.contrast - 1)));
            
            if (this.config.sharpen > 0) {
                pipeline = pipeline.sharpen(this.config.sharpen * 2, this.config.sharpen);
            }
            
            pipeline = pipeline.normalize();
            
            const outputBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
            
            return outputBuffer;
        } catch (error) {
            console.error('Preprocessing error:', error);
            throw error;
        }
    }

    async resize(pipeline) {
        const metadata = await pipeline.metadata();
        
        if (metadata.width > this.config.maxWidth || metadata.height > this.config.maxHeight) {
            pipeline = pipeline.resize(this.config.targetWidth, null, {
                fit: 'inside',
                withoutEnlargement: true
            });
        }
        
        return pipeline;
    }

    async grayscale(pipeline) {
        if (this.config.grayscale) {
            pipeline = pipeline.grayscale();
        }
        return pipeline;
    }

    async enhance(pipeline) {
        pipeline = pipeline
            .modulate({
                brightness: this.config.brightness,
            })
            .linear(this.config.contrast, -(128 * (this.config.contrast - 1)));
        
        return pipeline;
    }

    async sharpen(pipeline) {
        if (this.config.sharpen > 0) {
            const sigma = this.config.sharpen * 2;
            pipeline = pipeline.sharpen(sigma, this.config.sharpen, 1, this.config.sharpen);
        }
        return pipeline;
    }

    async normalize(pipeline) {
        const normalizedBuffer = await pipeline
            .normalize()
            .toBuffer();
        
        return sharp(normalizedBuffer);
    }

    async autoDeskew(inputBuffer) {
        const grayscaleBuffer = await sharp(inputBuffer)
            .grayscale()
            .toBuffer();
        
        return grayscaleBuffer;
    }

    async cropLabelRegion(inputBuffer) {
        return inputBuffer;
    }

    async getImageStats(inputBuffer) {
        const metadata = await sharp(inputBuffer).metadata();
        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: inputBuffer.length
        };
    }
}

module.exports = ImagePreprocessor;