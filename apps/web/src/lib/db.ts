import { SiftMarksDB } from '@siftmarks/db';

let _db: SiftMarksDB | null = null;

export function getDB(): SiftMarksDB {
  if (!_db) {
    _db = new SiftMarksDB();
    _db.initialize();
  }
  return _db;
}
