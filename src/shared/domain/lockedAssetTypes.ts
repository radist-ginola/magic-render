export type LockedAssetMenu = 'intro' | 'overlay' | 'stickerSubscribe' | 'playlist';

export type LockedAssetMetadata = {
  originalName: string;
  sourcePath?: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type LockedAsset = {
  assetId: string;
  menu: LockedAssetMenu;
  path: string;
  metadata: LockedAssetMetadata;
  config: Record<string, unknown>;
  /** Earlier saved assets had no flag and are treated as locked. */
  pinned?: boolean;
  lockedAt: string;
};

export type LockedAssetValidation = {
  valid: boolean;
  exists: boolean;
  reason?: string;
};
