const fs = require('fs');
const path = require('path');
const http = require('http');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = process.env.OLLAMA_PORT || 11434;
const MODEL_NAME = process.env.OLLAMA_MODEL || 'llava:latest';

const PROMPT_TEMPLATE = `You are an expert at reading labels on paper rolls/bobines. Analyze this image and extract ALL article codes and numbers you see.

Look for these types of codes:
1. Bobine codes (6-12 digits): like 426856004
2. Lot codes (letters+numbers): like GA25-1462, LOT 2
3. Barcodes (12+ digits): like 911152050267411096
4. Reference numbers (mixed): like 925071950503

Extract ONLY the codes/numbers. Format your response EXACTLY as:
CODE|TYPE|CONFIDENCE

Example output:
426856004|Bobine Code|95
GA25-1462|Lot Code|90
911152050267411096|Barcode|85

If you find multiple codes of the same type, list them all.
Only output the codes, nothing else.`;

const aiService = {
    async analyzeImage(imagePath) {
        const startTime = Date.now();
        
        try {
            const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
            const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;
            
            const result = await this.callOllamaVision(imageDataUrl);
            
            const codes = this.parseResponse(result);
            
            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                codes,
                rawResponse: result,
                processingTime,
                method: 'ollama_vision'
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
            const postData = JSON.stringify({
                model: MODEL_NAME,
                prompt: PROMPT_TEMPLATE,
                images: [imageDataUrl],
                stream: false,
                options: {
                    temperature: 0.1,
                    top_p: 0.9
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
                timeout: 120000
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
                        reject(new Error('Failed to parse Ollama response'));
                    }
                });
            });

            req.on('error', (e) => {
                reject(new Error(`Ollama connection failed: ${e.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Ollama request timeout'));
            });

            req.write(postData);
            req.end();
        });
    },

    parseResponse(text) {
        const codes = [];
        const lines = text.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            const parts = line.split('|').map(p => p.trim()).filter(p => p);
            
            if (parts.length >= 1) {
                const codeValue = parts[0];
                const codeType = parts[1] || 'Unknown';
                const confidence = parts[2] ? parseInt(parts[2]) : 80;
                
                if (this.isValidCode(codeValue)) {
                    codes.push({
                        code: codeValue.toUpperCase(),
                        type: codeType,
                        confidence: Math.min(100, Math.max(50, confidence))
                    });
                }
            }
        }
        
        if (codes.length === 0 && text.trim()) {
            const numericMatches = text.match(/\d{6,}/g);
            if (numericMatches) {
                numericMatches.forEach(match => {
                    codes.push({
                        code: match,
                        type: 'Numeric Code',
                        confidence: 75
                    });
                });
            }
        }
        
        return codes;
    },

    isValidCode(code) {
        if (!code || code.length < 5) return false;
        
        const noise = ['THE', 'AND', 'FOR', 'TOP', 'LOT', 'MONDI', 'TELE', 'TEL', 'SLOVAKIA', 'RUZOMBEROK'];
        if (noise.includes(code.toUpperCase())) return false;
        
        const hasValidChar = /[A-Z0-9]/i.test(code);
        const hasNumber = /\d/.test(code);
        
        return hasValidChar && (hasNumber || code.length >= 6);
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