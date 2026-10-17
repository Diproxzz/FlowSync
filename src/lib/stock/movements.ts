import { MovementSource, MovementType } from "@prisma/client";

export const PURCHASE_MOVEMENT_SOURCE = MovementSource.PURCHASE_INVOICE;
export const SALE_MOVEMENT_SOURCE = MovementSource.INVOICE;

export const STOCK_MOVEMENT_SOURCES = {
  PURCHASE_INVOICE: MovementSource.PURCHASE_INVOICE,
  INVOICE: MovementSource.INVOICE,
  SEED_OPENING: MovementSource.SEED_OPENING,
  MANUAL: MovementSource.MANUAL,
  LEGACY_XLSX: MovementSource.LEGACY_XLSX,
} as const;

export const STOCK_MOVEMENT_TYPES = {
  OPENING: MovementType.OPENING,
  PURCHASE: MovementType.PURCHASE,
  SALE: MovementType.SALE,
  ADJUSTMENT: MovementType.ADJUSTMENT,
} as const;
