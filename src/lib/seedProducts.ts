import { db } from './db';
import { createProduct } from './products';

export interface SeedProduct {
  name: string;
  unit: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
}

/** A reasonable starter catalog for a general shop/kiosk — not tailored to
 * any specific business, just enough to explore the POS and inventory
 * screens without typing in 20 products by hand first. Prices are rough
 * KES estimates and meant to be edited afterward, not treated as real. */
export const STARTER_PRODUCTS: SeedProduct[] = [
  { name: 'Sugar 1kg', unit: 'pcs', buyingPrice: 150, sellingPrice: 180, quantity: 20, minStock: 5 },
  { name: 'Cooking Oil 1L', unit: 'pcs', buyingPrice: 280, sellingPrice: 330, quantity: 15, minStock: 4 },
  { name: 'Maize Flour 2kg', unit: 'pcs', buyingPrice: 140, sellingPrice: 170, quantity: 20, minStock: 5 },
  { name: 'Wheat Flour 2kg', unit: 'pcs', buyingPrice: 160, sellingPrice: 190, quantity: 15, minStock: 4 },
  { name: 'Rice 1kg', unit: 'pcs', buyingPrice: 130, sellingPrice: 160, quantity: 20, minStock: 5 },
  { name: 'Milk 500ml', unit: 'pcs', buyingPrice: 55, sellingPrice: 65, quantity: 30, minStock: 8 },
  { name: 'Bread', unit: 'pcs', buyingPrice: 55, sellingPrice: 65, quantity: 15, minStock: 5 },
  { name: 'Tea Leaves 250g', unit: 'pcs', buyingPrice: 90, sellingPrice: 110, quantity: 15, minStock: 4 },
  { name: 'Salt 1kg', unit: 'pcs', buyingPrice: 30, sellingPrice: 45, quantity: 20, minStock: 5 },
  { name: 'Bar Soap', unit: 'pcs', buyingPrice: 60, sellingPrice: 80, quantity: 20, minStock: 5 },
  { name: 'Washing Powder 1kg', unit: 'pcs', buyingPrice: 150, sellingPrice: 190, quantity: 12, minStock: 3 },
  { name: 'Soda 500ml', unit: 'pcs', buyingPrice: 45, sellingPrice: 60, quantity: 30, minStock: 8 },
  { name: 'Bottled Water 500ml', unit: 'pcs', buyingPrice: 25, sellingPrice: 40, quantity: 40, minStock: 10 },
  { name: 'Eggs (tray of 30)', unit: 'pcs', buyingPrice: 360, sellingPrice: 420, quantity: 6, minStock: 2 },
  { name: 'Toothpaste', unit: 'pcs', buyingPrice: 90, sellingPrice: 120, quantity: 15, minStock: 4 }
];

/** Adds every starter product to the given business/branch that isn't
 * already there by name (case-insensitive) — safe to run more than once
 * without creating duplicates. Returns how many were actually added. */
export async function seedStarterProducts(businessId: string, branchId: string): Promise<number> {
  const existing = await db.products.where({ businessId, branchId }).toArray();
  const existingNames = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  let added = 0;
  for (const item of STARTER_PRODUCTS) {
    if (existingNames.has(item.name.toLowerCase())) continue;
    await createProduct({
      businessId, branchId, name: item.name, unit: item.unit,
      buyingPrice: item.buyingPrice, sellingPrice: item.sellingPrice,
      quantity: item.quantity, minStock: item.minStock
    });
    added++;
  }
  return added;
}
