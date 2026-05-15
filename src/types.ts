/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Item {
  id: string;
  name: string;
  price: number; // in GP
  weight: string;
  description: string;
  category: "Armi" | "Armature" | "Equipaggiamento" | "Oggetti Magici" | "Altro";
  source?: string;
}

export interface CityStats {
  name: string;
  type: string;
  baseValue: number;
  purchaseLimit: number;
  minorItems: string; // e.g. "3d4"
  mediumItems: string; // e.g. "2d4"
  majorItems: string; // e.g. "1d6"
}

export interface InventoryItem extends Item {
  quantity: number;
  addedAt: number;
  salePercentage?: number; // percentage of price when selling, default 50
}

export interface CoinsData {
  pp: number; // Platinum
  gp: number; // Gold
  sp: number; // Silver
  cp: number; // Copper
}

export interface PartyData {
  id: string;
  name: string;
  coins: CoinsData;
  inventory: InventoryItem[];
  lastUpdate: number;
}

export enum TransactionType {
  BUY = "buy",
  SELL = "sell",
}

export interface Transaction {
  id: string;
  type: TransactionType;
  itemId: string;
  itemName: string;
  price: number;
  quantity: number;
  timestamp: number;
}
