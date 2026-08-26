/**
 * Convert one probability to the percentage precision used by Attack charts.
 * Chart presentation intentionally rounds to one decimal place in percent.
 */
export function toChartPercentage (probability) {
    return Math.round(probability * 1000) / 10;
}

/**
 * Convert a probability array without mutating or retaining the input array.
 * Array.from also normalizes typed arrays to an ordinary owned Array.
 */
export function toChartPercentages (probabilities) {
    if (!probabilities) {
        return probabilities;
    }
    return Array.from(probabilities, toChartPercentage);
}
