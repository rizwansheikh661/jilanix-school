import type {
  StorageObjectLocation,
  StorageProvider,
  StoragePutInput,
  StoragePutResult,
  StorageReadResult,
} from '../file-storage.types';

/**
 * Re-exported from `file-storage.types` to give callers a stable import path
 * (`@core/file-storage/providers`). Add new providers next to this file.
 */
export type {
  StorageProvider,
  StoragePutInput,
  StoragePutResult,
  StorageReadResult,
  StorageObjectLocation,
};
