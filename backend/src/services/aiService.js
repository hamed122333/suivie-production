const fs = require('fs');
const path = require('path');
const http = require('http');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = process.env.OLLAMA_PORT || 11434;
const MODEL_NAME = process.env.OLLAMA_MODEL || 'llava:latest';

let learnedCodes = [];
let learningMode = false;

const aiService = {
    setLearnedCodes(codes) {
        if (codes && codes.length > 0) {
            learnedCodes = codes.map(c => c.code);
            learningMode = true;
            console.log('AI learned codes:', learnedCodes);
        }
    },

    getLearnedCodes() {
        return learnedCodes;
    },

    clearLearnedCodes() {
        learnedCodes = [];
        learningMode = false;
        console.log('Learned codes cleared');
    },

    getPrompt() {
        let basePrompt = `You are an expert at reading labels on paper rolls/bobines in industrial factories.

Your task is to extract ALL numbers and codes you see in this image.

CRITICAL INSTRUCTIONS:
1. Look carefully at EVERY number on the label
2. Numbers can be: 6-12 digits long (like 426856004)
3. Codes can have letters: like GA25-1462, LOT 2
4. Barcodes are 12+ digits: like 911152050267411096
5. Ignore common text like "MONDI", "TOP", "PLY", addresses, phone numbers

Extract ONLY the codes/numbers. Format your response like this (one per line):
CODE|TYPE|CONFIDENCE

Example valid outputs:
426856004|Bobine Code|95
GA25-1462|Lot Code|90
911152050267411096|Barcode|85
925071950503|Lot Code|85
7.5|Weight|80
205.0|Dimension|75
2,674|Area|70

Look at the image and extract ALL numbers you find:`;

        if (learningMode && learnedCodes.length > 0) {
            basePrompt += `\n\nIMPORTANT: The following codes are known to appear on similar labels. Look especially for these patterns:
${learnedCodes.map(code => `- ${code}`).join('\n')}`;
        }

        return basePrompt;
    },

    async analyzeImage(imagePath) {
        const startTime = Date.now();
        
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            const imageBase64 = imageBuffer.toString('base64');
            
            const ext = path.extname(imagePath).toLowerCase();
            let mimeType = 'image/jpeg';
            if (ext === '.png') mimeType = 'image/png';
            if (ext === '.webp') mimeType = 'image/webp';
            if (ext === '.gif') mimeType = 'image/gif';
            
            const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;
            
            const result = await this.callOllamaVision(imageDataUrl);
            
            console.log('AI Raw Response:', result);
            
            const codes = this.parseResponse(result);
            
            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                codes,
                rawResponse: result,
                processingTime,
                method: 'ollama_vision',
                learningMode
            };
        } catch (error) {
            console.error('Ollama AI error:', error.message);
            
            return {
                success: false,
                codes: [],
                error: error.message,
                processingTime: Date.now() - startTime,
                method: 'ollama_vision'
            };
        }
    },

    async callOllamaVision(imageDataUrl) {
        return new Promise((resolve, reject) => {
            const prompt = this.getPrompt();
            
            const postData = JSON.stringify({
                model: MODEL_NAME,
                prompt: prompt,
                images: [imageDataUrl],
                stream: false,
                options: {
                    temperature: 0.1,
                    top_p: 0.9,
                    num_predict: 512
                }
            });

            const options = {
                hostname: OLLAMA_HOST,
                port: OLLAMA_PORT,
                path: '/api/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 180000
            };

            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response.response || '');
                    } catch (e) {
                        console.error('Parse error:', e.message);
                        resolve('');
                    }
                });
            });

            req.on('error', (e) => {
                reject(new Error(`Ollama connection failed: ${e.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Ollama request timeout (180s)'));
            });

            req.write(postData);
            req.end();
        });
    },

    parseResponse(text) {
        const codes = [];
        
        if (!text || text.trim().length === 0) {
            console.log('Empty response from AI');
            return codes;
        }
        
        const lines = text.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            const parts = line.split('|').map(p => p.trim()).filter(p => p);
            
            if (parts.length >= 1) {
                const codeValue = parts[0].replace(/[^A-Z0-9.,-]/gi, '');
                const codeType = parts[1] || 'Unknown';
                const confidence = parts[2] ? parseInt(parts[2].replace(/[^0-9]/g, '')) : 80;
                
                if (this.isValidCode(codeValue)) {
                    codes.push({
                        code: codeValue.toUpperCase(),
                        type: codeType,
                        confidence: Math.min(100, Math.max(50, confidence || 80))
                    });
                }
            }
        }
        
        if (codes.length === 0 && text.trim()) {
            console.log('No codes parsed, trying numeric extraction...');
            const numericMatches = text.match(/\d{5,}/g);
            if (numericMatches) {
                numericMatches.forEach(match => {
                    const cleanMatch = match.replace(/[,.]/g, '');
                    if (cleanMatch.length >= 6 && this.isValidCode(cleanMatch)) {
                        codes.push({
                            code: cleanMatch,
                            type: 'Numeric Code',
                            confidence: 75
                        });
                    }
                });
            }
        }
        
        const seen = new Set();
        const uniqueCodes = codes.filter(c => {
            if (seen.has(c.code)) return false;
            seen.add(c.code);
            return true;
        });
        
        return uniqueCodes;
    },

    isValidCode(code) {
        if (!code || code.length < 5) return false;
        
        const noise = ['THE', 'AND', 'FOR', 'TOP', 'LOT', 'MONDI', 'TELE', 'TEL', 
                       'SLOVAKIA', 'RUZOMBEROK', 'CELLS', 'THIS', 'THAT', 'WHICH'];
        if (noise.includes(code.toUpperCase())) return false;
        
        const hasValidChar = /[A-Z0-9]/i.test(code);
        const hasNumber = /\d/.test(code);
        
        return hasValidChar && (hasNumber || code.length >= 8);
    },

    async checkConnection() {
        return new Promise((resolve) => {
            const options = {
                hostname: OLLAMA_HOST,
                port: OLLAMA_PORT,
                path: '/api/tags',
                method: 'GET',
                timeout: 5000
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const models = JSON.parse(data);
                        resolve({ connected: true, models: models.models || [] });
                    } catch (e) {
                        resolve({ connected: false });
                    }
                });
            });

            req.on('error', () => resolve({ connected: false }));
            req.on('timeout', () => resolve({ connected: false }));
            req.end();
        });
    }
};

module.exports = aiService;