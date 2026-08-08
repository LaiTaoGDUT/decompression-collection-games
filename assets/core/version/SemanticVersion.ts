const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

interface SemanticVersion {
    readonly major: string;
    readonly minor: string;
    readonly patch: string;
    readonly prerelease: readonly string[];
}

function parseSemanticVersion(value: string): SemanticVersion | undefined {
    const match = SEMVER_PATTERN.exec(value);

    if (!match) {
        return undefined;
    }

    const prerelease = match[4]?.split('.') ?? [];
    const hasInvalidNumericIdentifier = prerelease.some((identifier) => (
        /^\d+$/.test(identifier)
        && identifier.length > 1
        && identifier.startsWith('0')
    ));

    if (hasInvalidNumericIdentifier) {
        return undefined;
    }

    return {
        major: match[1],
        minor: match[2],
        patch: match[3],
        prerelease,
    };
}

function compareNumericStrings(left: string, right: string): number {
    if (left.length !== right.length) {
        return left.length - right.length;
    }

    return left === right ? 0 : left < right ? -1 : 1;
}

export function isSemanticVersion(value: string): boolean {
    return parseSemanticVersion(value) !== undefined;
}

/** 比较语义版本：左侧较新返回正数，相同返回 0，较旧返回负数。 */
export function compareSemanticVersions(left: string, right: string): number {
    const leftVersion = parseSemanticVersion(left);
    const rightVersion = parseSemanticVersion(right);

    if (!leftVersion || !rightVersion) {
        throw new Error(`Cannot compare invalid semantic versions: "${left}", "${right}".`);
    }

    for (const key of ['major', 'minor', 'patch'] as const) {
        const difference = compareNumericStrings(
            leftVersion[key],
            rightVersion[key],
        );

        if (difference !== 0) {
            return difference;
        }
    }

    if (leftVersion.prerelease.length === 0) {
        return rightVersion.prerelease.length === 0 ? 0 : 1;
    }

    if (rightVersion.prerelease.length === 0) {
        return -1;
    }

    const length = Math.max(
        leftVersion.prerelease.length,
        rightVersion.prerelease.length,
    );

    for (let index = 0; index < length; index += 1) {
        const leftIdentifier = leftVersion.prerelease[index];
        const rightIdentifier = rightVersion.prerelease[index];

        if (leftIdentifier === undefined || rightIdentifier === undefined) {
            return leftIdentifier === undefined ? -1 : 1;
        }

        if (leftIdentifier === rightIdentifier) {
            continue;
        }

        const leftNumeric = /^\d+$/.test(leftIdentifier);
        const rightNumeric = /^\d+$/.test(rightIdentifier);

        if (leftNumeric && rightNumeric) {
            return compareNumericStrings(leftIdentifier, rightIdentifier);
        }

        if (leftNumeric !== rightNumeric) {
            return leftNumeric ? -1 : 1;
        }

        return leftIdentifier < rightIdentifier ? -1 : 1;
    }

    return 0;
}
