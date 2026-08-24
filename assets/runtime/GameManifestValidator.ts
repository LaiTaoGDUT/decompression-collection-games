import type { GameManifest } from './GameManifest';
import { isSemanticVersion } from '../core/version/SemanticVersion';

const SUPPORTED_SCHEMA_VERSION = 1;
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const COMPONENT_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ORIENTATIONS = ['portrait', 'landscape'] as const;
const RENDER_MODES = ['2d', '3d'] as const;
const DEVICE_TIERS = ['low', 'medium', 'high'] as const;
const VISIBILITIES = ['public', 'development'] as const;

export interface ManifestValidationError {
    readonly field: string;
    readonly reason: string;
}

export interface ManifestValidationResult {
    readonly valid: boolean;
    readonly manifests: readonly GameManifest[];
    readonly errors: readonly ManifestValidationError[];
}

type UnknownRecord = Readonly<Record<string, unknown>>;

interface ManifestEntryResult {
    readonly id?: string;
    readonly manifest?: GameManifest;
    readonly errors: readonly ManifestValidationError[];
}

function createResult(
    manifests: GameManifest[],
    errors: ManifestValidationError[],
): ManifestValidationResult {
    return Object.freeze({
        valid: errors.length === 0,
        manifests: Object.freeze(manifests),
        errors: Object.freeze(errors),
    });
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addError(
    errors: ManifestValidationError[],
    field: string,
    reason: string,
): void {
    errors.push(Object.freeze({ field, reason }));
}

function readString(
    source: UnknownRecord,
    key: string,
    field: string,
    errors: ManifestValidationError[],
): string | undefined {
    const value = source[key];

    if (typeof value !== 'string' || value.trim().length === 0) {
        addError(errors, field, 'must be a non-empty string');
        return undefined;
    }

    return value;
}

function readEnum<TValue extends string>(
    source: UnknownRecord,
    key: string,
    field: string,
    allowed: readonly TValue[],
    errors: ManifestValidationError[],
): TValue | undefined {
    const value = source[key];

    if (typeof value !== 'string' || allowed.indexOf(value as TValue) < 0) {
        addError(errors, field, `must be one of: ${allowed.join(', ')}`);
        return undefined;
    }

    return value as TValue;
}

function readBoolean(
    source: UnknownRecord,
    key: string,
    field: string,
    errors: ManifestValidationError[],
): boolean | undefined {
    const value = source[key];

    if (typeof value !== 'boolean') {
        addError(errors, field, 'must be a boolean');
        return undefined;
    }

    return value;
}

function readStringArray(
    source: UnknownRecord,
    key: string,
    field: string,
    errors: ManifestValidationError[],
    validateItem?: (value: string) => boolean,
): readonly string[] | undefined {
    const value = source[key];

    if (!Array.isArray(value)) {
        addError(errors, field, 'must be an array');
        return undefined;
    }

    const items: string[] = [];

    value.forEach((item: unknown, index: number) => {
        if (
            typeof item !== 'string'
            || item.trim().length === 0
            || (validateItem && !validateItem(item))
        ) {
            addError(errors, `${field}[${index}]`, 'has an invalid format');
            return;
        }

        items.push(item);
    });

    return items;
}

function isResourcePath(value: string): boolean {
    if (value.startsWith('/') || value.endsWith('/')) {
        return false;
    }

    const segments = value.split('/');

    return segments.every((segment) => (
        segment !== '.'
        && segment !== '..'
        && /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(segment)
    ));
}

function readResourcePath(
    source: UnknownRecord,
    key: string,
    field: string,
    errors: ManifestValidationError[],
): string | undefined {
    const value = readString(source, key, field, errors);

    if (value && !isResourcePath(value)) {
        addError(errors, field, 'must be a relative Bundle resource path');
        return undefined;
    }

    return value;
}

function readOptionalResourcePath(
    source: UnknownRecord,
    key: string,
    field: string,
    errors: ManifestValidationError[],
): string | null | undefined {
    const value = source[key];
    if (value === undefined || value === null) return value;
    if (typeof value !== 'string' || value.trim().length === 0) {
        addError(errors, field, 'must be null or a non-empty string');
        return undefined;
    }
    if (!isResourcePath(value)) {
        addError(errors, field, 'must be a relative Bundle resource path');
        return undefined;
    }
    return value;
}

function validateManifestEntry(value: unknown, index: number): ManifestEntryResult {
    const errors: ManifestValidationError[] = [];
    const prefix = `games[${index}]`;

    if (!isRecord(value)) {
        addError(errors, prefix, 'must be an object');
        return { errors };
    }

    const id = readString(value, 'id', `${prefix}.id`, errors);
    const version = readString(value, 'version', `${prefix}.version`, errors);
    const name = readString(value, 'name', `${prefix}.name`, errors);
    const description = readString(
        value,
        'description',
        `${prefix}.description`,
        errors,
    );
    const bundle = readString(value, 'bundle', `${prefix}.bundle`, errors);
    const scene = readResourcePath(value, 'scene', `${prefix}.scene`, errors);
    const entryComponent = readString(
        value,
        'entryComponent',
        `${prefix}.entryComponent`,
        errors,
    );
    const icon = readResourcePath(value, 'icon', `${prefix}.icon`, errors);
    const cover = readResourcePath(value, 'cover', `${prefix}.cover`, errors);
    const loadingCover = readOptionalResourcePath(
        value,
        'loadingCover',
        `${prefix}.loadingCover`,
        errors,
    );
    const orientation = readEnum(
        value,
        'orientation',
        `${prefix}.orientation`,
        ORIENTATIONS,
        errors,
    );
    const renderMode = readEnum(
        value,
        'renderMode',
        `${prefix}.renderMode`,
        RENDER_MODES,
        errors,
    );
    const minimumDeviceTier = readEnum(
        value,
        'minimumDeviceTier',
        `${prefix}.minimumDeviceTier`,
        DEVICE_TIERS,
        errors,
    );
    const minAppVersion = readString(
        value,
        'minAppVersion',
        `${prefix}.minAppVersion`,
        errors,
    );
    const enabled = readBoolean(value, 'enabled', `${prefix}.enabled`, errors);
    const visibility = readEnum(
        value,
        'visibility',
        `${prefix}.visibility`,
        VISIBILITIES,
        errors,
    );
    const preload = readStringArray(
        value,
        'preload',
        `${prefix}.preload`,
        errors,
        isResourcePath,
    );
    const tags = readStringArray(value, 'tags', `${prefix}.tags`, errors);

    if (id && !ID_PATTERN.test(id)) {
        addError(errors, `${prefix}.id`, 'must use lowercase letters, numbers, and hyphens');
    }

    if (version && !isSemanticVersion(version)) {
        addError(errors, `${prefix}.version`, 'must be a semantic version');
    }

    if (bundle && !ID_PATTERN.test(bundle)) {
        addError(errors, `${prefix}.bundle`, 'must use lowercase letters, numbers, and hyphens');
    }

    if (entryComponent && !COMPONENT_PATTERN.test(entryComponent)) {
        addError(errors, `${prefix}.entryComponent`, 'must be a valid component class name');
    }

    if (minAppVersion && !isSemanticVersion(minAppVersion)) {
        addError(errors, `${prefix}.minAppVersion`, 'must be a semantic version');
    }

    if (errors.length > 0) {
        return { id, errors };
    }

    const manifest: GameManifest = Object.freeze({
        id: id!,
        version: version!,
        name: name!,
        description: description!,
        bundle: bundle!,
        scene: scene!,
        entryComponent: entryComponent!,
        icon: icon!,
        cover: cover!,
        loadingCover,
        orientation: orientation!,
        renderMode: renderMode!,
        minimumDeviceTier: minimumDeviceTier!,
        minAppVersion: minAppVersion!,
        enabled: enabled!,
        visibility: visibility!,
        preload: Object.freeze([...(preload ?? [])]),
        tags: Object.freeze([...(tags ?? [])]),
    });

    return { id, manifest, errors };
}

/** 校验版本化游戏目录，并返回所有可用清单及字段级错误。 */
export function validateGameCatalog(value: unknown): ManifestValidationResult {
    const errors: ManifestValidationError[] = [];
    const manifests: GameManifest[] = [];

    if (!isRecord(value)) {
        addError(errors, '$', 'must be an object');
        return createResult(manifests, errors);
    }

    const schemaSupported = value.schemaVersion === SUPPORTED_SCHEMA_VERSION;

    if (!schemaSupported) {
        addError(
            errors,
            'schemaVersion',
            `must equal ${SUPPORTED_SCHEMA_VERSION}`,
        );
    }

    if (!Array.isArray(value.games)) {
        addError(errors, 'games', 'must be an array');
        return createResult(manifests, errors);
    }

    const seenIds = new Set<string>();

    value.games.forEach((entry: unknown, index: number) => {
        const result = validateManifestEntry(entry, index);
        errors.push(...result.errors);

        if (result.id && seenIds.has(result.id)) {
            addError(errors, `games[${index}].id`, `duplicates id "${result.id}"`);
            return;
        }

        if (result.id) {
            seenIds.add(result.id);
        }

        if (result.manifest) {
            manifests.push(result.manifest);
        }
    });

    return createResult(schemaSupported ? manifests : [], errors);
}
