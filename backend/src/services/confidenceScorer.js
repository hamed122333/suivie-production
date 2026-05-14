class ConfidenceScorer {
    constructor() {
        this.THRESHOLDS = {
            HIGH: 0.8,
            MEDIUM: 0.5,
            LOW: 0
        };
    }

    calculateOverallConfidence(fields) {
        const fieldScores = Object.values(fields).filter(f => f.value !== null);
        
        if (fieldScores.length === 0) return 0;
        
        let totalWeight = 0;
        let weightedSum = 0;
        
        const weights = {
            reel_serial_number: 0.3,
            supplier: 0.25,
            weight: 0.25,
            width: 0.2
        };
        
        for (const [fieldName, fieldData] of Object.entries(fields)) {
            if (fieldData.value) {
                const weight = weights[fieldName] || 0.25;
                weightedSum += (fieldData.confidence || 0) * weight;
                totalWeight += weight;
            }
        }
        
        return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    getConfidenceLevel(confidence) {
        if (confidence >= this.THRESHOLDS.HIGH) return 'HIGH';
        if (confidence >= this.THRESHOLDS.MEDIUM) return 'MEDIUM';
        return 'LOW';
    }

    getConfidenceColor(confidence) {
        const level = this.getConfidenceLevel(confidence);
        const colors = {
            HIGH: '#22c55e',
            MEDIUM: '#f59e0b',
            LOW: '#ef4444'
        };
        return colors[level];
    }

    getConfidenceLabel(confidence) {
        const level = this.getConfidenceLevel(confidence);
        const labels = {
            HIGH: 'Haute confiance',
            MEDIUM: 'Vérification suggérée',
            LOW: 'Confiance basse'
        };
        return labels[level];
    }

    formatConfidence(confidence) {
        return {
            value: Math.round(confidence * 100),
            level: this.getConfidenceLevel(confidence),
            label: this.getConfidenceLabel(confidence),
            color: this.getConfidenceColor(confidence)
        };
    }

    boostConfidence(fieldData, context) {
        if (!fieldData.value) return fieldData;
        
        let boostedConfidence = fieldData.confidence;
        
        if (context.keywordAdjacent) {
            boostedConfidence += 0.1;
        }
        
        if (context.nearSupplierKeyword) {
            boostedConfidence += 0.15;
        }
        
        if (context.multiplePatternsMatch) {
            boostedConfidence += 0.1;
        }
        
        return {
            ...fieldData,
            confidence: Math.min(0.99, boostedConfidence)
        };
    }

    penalizeConfidence(fieldData, issues) {
        if (!fieldData.value) return fieldData;
        
        let penalizedConfidence = fieldData.confidence;
        
        if (issues.outOfRange) penalizedConfidence -= 0.2;
        if (issues.oddCharacters) penalizedConfidence -= 0.15;
        if (issues.tooShort) penalizedConfidence -= 0.1;
        if (issues.noisyPattern) penalizedConfidence -= 0.1;
        
        return {
            ...fieldData,
            confidence: Math.max(0, penalizedConfidence)
        };
    }
}

module.exports = ConfidenceScorer;