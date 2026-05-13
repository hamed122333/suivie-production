/**
 * Image Preprocessing Service
 *
 * Handles image enhancement for optimal OCR performance:
 * - Resize for consistent processing
 * - Grayscale conversion
 * - Contrast enhancement
 * - Sharpening
 * - Denoising
 * - Normalization
 *
 * Dependencies: Sharp (no GPU, works on all platforms)
 */

const sharp = require('sharp');

class PreprocessService {
  /**
   * Preprocess image for OCR
   * @param {Buffer|string} imageInput - Image buffer or file path
   * @param {Object} options - Preprocessing options
   * @returns {Promise<{processed: Buffer, metadata: Object}>}
   */
  static async preprocessForOCR(imageInput, options = {}) {
    const {
      maxWidth = 2400,           // Tesseract optimal width
      quality = 85,               // JPEG quality
      grayscale = true,           // Convert to grayscale
      contrast = 1.3,             // Contrast multiplier
      sharpen = true,             // Apply sharpening
      denoise = true,             // Apply denoising
      normalize = true,           // Normalize histogram
    } = options;

    try {
      let pipeline = sharp(imageInput);

      // Get metadata before processing
      const metadata = await pipeline.metadata();

      // Resize if too large (Tesseract works best with reasonable sizes)
      if (metadata.width > maxWidth) {
        const ratio = maxWidth / metadata.width;
        pipeline = pipeline.resize({
          width: Math.floor(metadata.width * ratio),
          height: Math.floor(metadata.height * ratio),
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        });
      }

      // Convert to grayscale for better OCR
      if (grayscale) {
        pipeline = pipeline.grayscale();
      }

      // Apply contrast enhancement (more visible text)
      if (contrast !== 1) {
        pipeline = pipeline.modulate({
          lightness: 100,
          saturation: 100,
          brightness: 1 + (contrast - 1) * 0.1, // Subtle brightness boost
          hue: 0,
        });
      }

      // Apply sharpening for crisper text
      if (sharpen) {
        pipeline = pipeline.sharpen({
          sigma: 1.5, // Sharpening strength
        });
      }

      // Normalize histogram (equalize contrast across image)
      if (normalize) {
        pipeline = pipeline.normalise();
      }

      // Denoise using median blur (reduces noise without losing text clarity)
      if (denoise) {
        // Use morphology: erode then dilate for better noise removal
        pipeline = pipeline.median(1);
      }

      // Convert to PNG for lossless storage of processed image
      const processed = await pipeline
        .png({ compression: 9 })
        .toBuffer();

      return {
        processed,
        metadata: {
          original: {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            colorspace: metadata.space,
          },
          preprocessing: {
            grayscale,
            contrast,
            sharpen,
            denoise,
            normalize,
            maxWidth,
          },
        },
      };
    } catch (error) {
      throw new Error(`Preprocessing failed: ${error.message}`);
    }
  }

  /**
   * Preprocess multiple formats (JPEG, PNG, WebP, TIFF, etc.)
   * @param {Buffer} imageBuffer - Raw image buffer
   * @returns {Promise<Buffer>} - Preprocessed PNG buffer
   */
  static async normalizeImageFormat(imageBuffer) {
    try {
      return await sharp(imageBuffer)
        .png({ compression: 9 })
        .toBuffer();
    } catch (error) {
      throw new Error(`Format normalization failed: ${error.message}`);
    }
  }

  /**
   * Enhance for specific label types
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} labelType - 'thermal', 'barcode', 'printed', 'handwritten'
   * @returns {Promise<Buffer>} - Optimized image
   */
  static async enhanceForLabelType(imageBuffer, labelType = 'printed') {
    const presets = {
      thermal: {
        contrast: 1.5,
        sharpen: true,
        grayscale: true,
        denoise: true,
      },
      barcode: {
        contrast: 1.8,
        sharpen: true,
        grayscale: true,
        denoise: false, // Preserve barcode patterns
      },
      printed: {
        contrast: 1.3,
        sharpen: true,
        grayscale: true,
        denoise: true,
      },
      handwritten: {
        contrast: 1.2,
        sharpen: false,
        grayscale: true,
        denoise: true,
      },
    };

    const options = presets[labelType] || presets.printed;
    const result = await this.preprocessForOCR(imageBuffer, options);
    return result.processed;
  }

  /**
   * Create thumbnail for preview
   * @param {Buffer} imageBuffer - Original image
   * @param {number} size - Thumbnail size (default 200)
   * @returns {Promise<Buffer>} - Thumbnail PNG
   */
  static async createThumbnail(imageBuffer, size = 200) {
    try {
      return await sharp(imageBuffer)
        .resize(size, size, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png({ compression: 9 })
        .toBuffer();
    } catch (error) {
      throw new Error(`Thumbnail creation failed: ${error.message}`);
    }
  }

  /**
   * Get image statistics (brightness, contrast, etc.)
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Object>} - Image statistics
   */
  static async getImageStats(imageBuffer) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const stats = await sharp(imageBuffer)
        .stats()
        .then(data => ({
          channels: data.channels.map(ch => ({
            min: ch.min,
            max: ch.max,
            mean: ch.mean,
            median: ch.median,
            std: ch.std,
          })),
        }));

      return {
        dimensions: {
          width: metadata.width,
          height: metadata.height,
          aspect: (metadata.width / metadata.height).toFixed(2),
        },
        format: metadata.format,
        stats,
      };
    } catch (error) {
      throw new Error(`Stats calculation failed: ${error.message}`);
    }
  }
}

module.exports = PreprocessService;
