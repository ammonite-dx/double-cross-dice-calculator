const numberFormatter = new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: 3,
});

const percentFormatter = new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: 2,
});

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value) {
    return isFiniteNumber(value) ? numberFormatter.format(value) : '不明';
}

function formatProbability(value) {
    return isFiniteNumber(value)
        ? `${percentFormatter.format(value * 100)}%`
        : '不明';
}

export function formatCanonicalComboName(name, index) {
    return typeof name === 'string' && name.trim().length > 0
        ? name
        : `コンボ ${index + 1}`;
}

export function formatCanonicalExpectedValue(expectedValue) {
    if (!isRecord(expectedValue)) {
        return '期待値（不明）';
    }

    if (expectedValue.kind === 'exact') {
        return `期待値（正確値）: ${formatNumber(expectedValue.value)}`;
    }

    if (expectedValue.kind === 'bounded') {
        return `期待値（範囲）: ${formatNumber(expectedValue.lowerBound)} ～ ${formatNumber(expectedValue.upperBound)}`;
    }

    if (expectedValue.kind === 'lower-bound') {
        return `期待値（下限）: ${formatNumber(expectedValue.lowerBound)} 以上`;
    }

    return '期待値（不明な形式）';
}

export function formatCanonicalExplicitMax(explicitMax) {
    return `明示分布上限: ${formatNumber(explicitMax)}`;
}

export function formatCanonicalSupport(support) {
    if (!isRecord(support)) {
        return 'support: 不明';
    }

    if (support.kind === 'finite') {
        return `support: 有限（最大値 ${formatNumber(support.max)}）`;
    }

    if (support.kind === 'infinite') {
        return 'support: 無限';
    }

    return 'support: 不明';
}

export function formatCanonicalOverflow(overflow) {
    if (overflow === null) {
        return 'オーバーフロー: なし';
    }

    if (!isRecord(overflow)) {
        return 'オーバーフロー: 不明';
    }

    if (overflow.kind === 'exact') {
        return `オーバーフロー: 正確値（${formatNumber(overflow.lowerBound)}以上、確率 ${formatProbability(overflow.probability)}）`;
    }

    if (overflow.kind === 'upper-bound') {
        return `オーバーフロー: 上限値（${formatNumber(overflow.lowerBound)}以上、確率上限 ${formatProbability(overflow.probabilityUpperBound)}）`;
    }

    return 'オーバーフロー: 不明';
}

export function createCanonicalDistributionDisplay(presentation) {
    const source = isRecord(presentation) ? presentation : null;

    return {
        expectedValue: formatCanonicalExpectedValue(source?.expectedValue),
        explicitMax: formatCanonicalExplicitMax(source?.explicitMax),
        support: formatCanonicalSupport(source?.support),
        overflow: formatCanonicalOverflow(source?.overflow),
    };
}
