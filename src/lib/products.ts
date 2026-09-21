import { touchActivity } from './activity';
import { db, newRecordBase, enqueueSync } from './db';
import type { Product } from './types';

export interface CreateProductInput {
  businessId: string;
  branchId: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  unit: string;
  buyingPrice: number;
  sellingPrice: number;
  wholesalePrice?: number | null;
  quantity: number;
  minStock: number;
  reorderLevel?: number;
}

/** The one place a new product record gets built, so Inventory's "Add
 * product" and the Suppliers "this product isn't in stock yet" flow can't
 * silently drift apart on which fields get set. */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const product = await createProductInner(input);
  touchActivity('inventory');
  return product;
}

async function createProductInner(input: CreateProductInput): Promise<Product> {
  if (!input.name.trim()) throw new Error('Product name is required');
  const record: Product = {
    ...newRecordBase(),
    businessId: input.businessId,
    branchId: input.branchId,
    categoryId: input.categoryId ?? null,
    supplierId: input.supplierId ?? null,
    name: input.name.trim(),
    sku: input.sku || null,
    barcode: input.barcode?.trim() || null,
    brand: input.brand || null,
    description: null,
    unit: input.unit,
    imageUrl: null,
    buyingPrice: input.buyingPrice,
    sellingPrice: input.sellingPrice,
    wholesalePrice: input.wholesalePrice ?? null,
    quantity: input.quantity,
    minStock: input.minStock,
    reorderLevel: input.reorderLevel ?? input.minStock,
    expiryDate: null,
    active: true
  } as Product;
  await db.products.add(record);
  await enqueueSync('products', record.id, 'create');
  return record;
}
