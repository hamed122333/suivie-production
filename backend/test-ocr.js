const Tesseract = require('tesseract.js');
const fs = require('fs');

const imgPath = 'C:\\Users\\hamed\\.codex\\worktrees\\68a3\\Suivi-Production\\backend\\uploads\\scans\\scan_1778754605227_890534359.jpeg';

console.log('Testing OCR on:', imgPath);
console.log('File exists:', fs.existsSync(imgPath));

const imageBuffer = fs.readFileSync(imgPath);
console.log('Image size:', imageBuffer.length);

Tesseract.recognize(imageBuffer, 'eng+fra+spa', {
    logger: m => console.log('Progress:', m.status, m.progress)
})
.then(result => {
    console.log('\n=== OCR Result ===');
    console.log('Confidence:', result.data.confidence);
    console.log('\n=== Extracted Text ===');
    console.log(result.data.text);
})
.catch(err => {
    console.error('Error:', err.message);
});