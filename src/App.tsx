/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Coins, Package, ShoppingCart, History, Search, Plus, Trash2, TrendingDown, TrendingUp, X, Edit3, Save } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PartyData, InventoryItem, Item, Transaction, TransactionType, CoinsData, CityStats } from "./types";
import { lookupItemOnWiki, lookupCityStats, generateCityMagicInventory } from "./services/geminiService";

// Helper to convert coins to total GP
const calculateTotalGP = (coins: CoinsData) => {
  const pp = Number(coins?.pp || 0);
  const gp = Number(coins?.gp || 0);
  const sp = Number(coins?.sp || 0);
  const cp = Number(coins?.cp || 0);
  return (pp * 10) + gp + (sp * 0.1) + (cp * 0.01);
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"inventory" | "shop" | "history">("inventory");
  const [party, setParty] = useState<PartyData>({
    id: "rot-party-" + Math.random().toString(36).substr(2, 4),
    name: "Ritorno dei Signori delle Rune",
    coins: { pp: 0, gp: 0, sp: 0, cp: 0 },
    inventory: [],
    lastUpdate: Date.now()
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [searchResults, setSearchResults] = useState<Partial<Item>[] | null>(null);
  const [cityStats, setCityStats] = useState<CityStats | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  
  // New States
  const [showManualItemModal, setShowManualItemModal] = useState(false);
  const [multipleResultsModal, setMultipleResultsModal] = useState<{ items: Partial<Item>[], forManual: boolean } | null>(null);
  const [manualItem, setManualItem] = useState<Partial<InventoryItem>>({
    name: "",
    price: 0,
    weight: "",
    category: "Equipaggiamento",
    description: "",
    quantity: 1,
    salePercentage: 50
  });
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [cityInventoriesCache, setCityInventoriesCache] = useState<Record<string, { inventory: { minor: number, medium: number, major: number }, items: Partial<Item>[] }>>({});
  const [isSearchingManual, setIsSearchingManual] = useState(false);
  const [isEditingCoins, setIsEditingCoins] = useState(false);
  const [tempCoins, setTempCoins] = useState<CoinsData>(party.coins);
  const [notifications, setNotifications] = useState<{ id: string, message: string, type: 'success' | 'error' | 'info' }[]>([]);
  const [lastRoll, setLastRoll] = useState<{ roll: number, chance: number, success: boolean, itemName: string } | null>(null);
  const [failedCityItemSearches, setFailedCityItemSearches] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"name" | "price">("price");
  const [sortByCity, setSortByCity] = useState<"name" | "price">("price");

  const [numToDelete, setNumToDelete] = useState(10);
  const [daysToDelete, setDaysToDelete] = useState(7);

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const confirmRemove = () => {
    if (!itemToRemove) return;
    setParty(prev => ({
      ...prev,
      inventory: prev.inventory.filter(i => i.id !== itemToRemove),
      lastUpdate: Date.now()
    }));
    setItemToRemove(null);
  };

  const handleManualLookup = async () => {
    if (!manualItem.name) return;
    setIsSearchingManual(true);
    const results = await lookupItemOnWiki(manualItem.name);
    if (results && results.length > 0) {
      if (results.length > 1) {
        setMultipleResultsModal({ items: results, forManual: true });
      } else {
        setManualItem(prev => ({
          ...prev,
          ...results[0]
        }));
      }
    } else {
      alert("Oggetto non trovato nel database di Golarion. Inserisci i dettagli manualmente.");
    }
    setIsSearchingManual(false);
  };

  const handleAddManualItem = () => {
    if (!manualItem.name) return;

    const existingIndex = party.inventory.findIndex(i => i.name.toLowerCase() === manualItem.name?.toLowerCase());

    if (existingIndex >= 0) {
      alert(`L'oggetto "${manualItem.name}" è già presente nell'inventario. La quantità verrà aggiornata.`);
      const newInventory = [...party.inventory];
      newInventory[existingIndex].quantity += (manualItem.quantity || 1);
      
      setParty(prev => ({
        ...prev,
        inventory: newInventory.sort((a, b) => a.price - b.price),
        lastUpdate: Date.now()
      }));
    } else {
      const newItem: InventoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: manualItem.name!,
        price: manualItem.price || 0,
        weight: manualItem.weight || "0 kg",
        category: (manualItem.category as any) || "Altro",
        description: manualItem.description || "",
        quantity: manualItem.quantity || 1,
        salePercentage: manualItem.salePercentage || 50,
        addedAt: Date.now()
      };

      setParty(prev => ({
        ...prev,
        inventory: [...prev.inventory, newItem].sort((a, b) => a.price - b.price),
        lastUpdate: Date.now()
      }));
    }

    setShowManualItemModal(false);
    setManualItem({
      name: "",
      price: 0,
      weight: "",
      category: "Equipaggiamento",
      description: "",
      quantity: 1,
      salePercentage: 50
    });
  };

  const handleUpdateQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setParty(prev => ({
      ...prev,
      inventory: prev.inventory.map(i => i.id === itemId ? { ...i, quantity: newQuantity } : i),
      lastUpdate: Date.now()
    }));
  };

  const handleUpdateSalePercentage = (itemId: string, percentage: number) => {
    const val = Math.max(0, Math.min(100, percentage));
    setParty(prev => ({
      ...prev,
      inventory: prev.inventory.map(i => i.id === itemId ? { ...i, salePercentage: val } : i),
      lastUpdate: Date.now()
    }));
  };

  const saveCoins = () => {
    setParty(prev => ({ ...prev, coins: tempCoins }));
    setIsEditingCoins(false);
  };

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem("lootmaster_party");
    if (saved) {
      const { party: savedParty, transactions: savedTxs, cityCache } = JSON.parse(saved);
      
      // Sanitize coins to ensure no NaNs from old data
      if (savedParty && savedParty.coins) {
        savedParty.coins.pp = Number(savedParty.coins.pp) || 0;
        savedParty.coins.gp = Number(savedParty.coins.gp) || 0;
        savedParty.coins.sp = Number(savedParty.coins.sp) || 0;
        savedParty.coins.cp = Number(savedParty.coins.cp) || 0;
      }
      
      setParty(savedParty);
      setTransactions(savedTxs || []);
      if (cityCache) setCityInventoriesCache(cityCache);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("lootmaster_party", JSON.stringify({ party, transactions, cityCache: cityInventoriesCache }));
  }, [party, transactions, cityInventoriesCache]);

  const [cityInventory, setCityInventory] = useState<{ minor: number, medium: number, major: number } | null>(null);
  const [rolledCityItems, setRolledCityItems] = useState<Partial<Item>[] | null>(null);

  const rollDice = (diceStr: string) => {
    if (!diceStr || diceStr === "0" || !diceStr.includes('d')) return parseInt(diceStr) || 0;
    const match = diceStr.match(/(\d+)d(\d+)/);
    if (!match) return 0;
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    let total = 0;
    for (let i = 0; i < count; i++) {
        total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  };

  const handleBuy = (item: Item | Partial<Item>, quantity: number = 1) => {
    if (!item.price || !item.name) return;

    const itemNameLower = item.name.toLowerCase();

    // SETTLEMENT DISCOVERY LOGIC
    if (cityStats) {
      const cityInventoryMatch = rolledCityItems?.find(i => i.name?.toLowerCase().trim() === itemNameLower.trim());
      
      if (cityInventoryMatch) {
        // It's already in the city inventory, we can proceed to purchase
      } else {
        // Check if it already failed a roll in this city session
        if (failedCityItemSearches[itemNameLower.trim()]) {
          addNotification(`L'oggetto "${item.name}" non è più disponibile in questa città.`, 'error');
          return;
        }

        // If price > baseValue, it's NOT available (0% chance)
        if (item.price > cityStats.baseValue) {
          setFailedCityItemSearches(prev => ({ ...prev, [itemNameLower.trim()]: true }));
          addNotification(`L'oggetto "${item.name}" non è presente. Supera il Valore Base di ${cityStats.name} (${cityStats.baseValue} MO).`, 'error');
          return;
        }

        const roll = Math.floor(Math.random() * 100) + 1;
        const chance = 75; 
        const success = roll <= chance;
        setLastRoll({ roll, chance, success, itemName: item.name! });
        
        if (!success) {
          setFailedCityItemSearches(prev => ({ ...prev, [itemNameLower.trim()]: true }));
          addNotification(`Tiro: ${roll} / ${chance}%. L'oggetto "${item.name}" non è disponibile ed è stato segnato come esaurito.`, 'error');
          return;
        } else {
          const diceMsg = `Tiro: ${roll} / ${chance}%. Oggetto trovato! È stato aggiunto all'inventario di ${cityStats.name}.`;
          addNotification(diceMsg, 'success');
          const foundItem = { ...item };
          setRolledCityItems(prev => {
            const updated = prev ? [...prev, foundItem] : [foundItem];
            const sorted = updated.sort((a, b) => (a.price || 0) - (b.price || 0));
            // Update cache
            setCityInventoriesCache(cache => ({
              ...cache,
              [cityStats.name]: { ...cache[cityStats.name], items: sorted }
            }));
            return sorted;
          });
          setSearchResults(null);
          // Do not finish purchase yet, just add to city inventory
          return; 
        }
      }
    }

    const totalCost = item.price * quantity;
    const currentGold = calculateTotalGP(party.coins);
    
    // FUND CHECK AFTER DISCOVERY
    if (currentGold < totalCost) {
      addNotification(`Fondi insufficienti! Ti servono ${totalCost.toFixed(2)} MO.`, "error");
      return;
    }

    // Add to inventory
    let newInventory = [...party.inventory];
    const existingIndex = newInventory.findIndex(i => i.name.toLowerCase() === item.name?.toLowerCase());
    
    if (existingIndex >= 0) {
      newInventory[existingIndex].quantity += quantity;
    } else {
      newInventory.push({
        id: Math.random().toString(36).substr(2, 9),
        name: item.name!,
        price: item.price!,
        weight: item.weight || "0",
        category: (item.category as any) || "Altro",
        description: item.description || "",
        quantity: quantity,
        salePercentage: 50,
        addedAt: Date.now()
      });
    }

    // Sort inventory by price (lowest to highest)
    newInventory = newInventory.sort((a, b) => a.price - b.price);

    if (cityStats) {
      setRolledCityItems(prev => {
        if (!prev) return null;
        const newItems = prev.filter(i => i.name?.toLowerCase() !== item.name?.toLowerCase());
        const sorted = [...newItems].sort((a, b) => (a.price || 0) - (b.price || 0));
        // Update cache
        setCityInventoriesCache(cache => ({
          ...cache,
          [cityStats.name]: { ...cache[cityStats.name], items: sorted }
        }));
        return sorted;
      });
    }

    const newCoins = { 
      pp: Number(party.coins.pp || 0),
      gp: Number(party.coins.gp || 0),
      sp: Number(party.coins.sp || 0),
      cp: Number(party.coins.cp || 0)
    };
    const costInCp = Math.round((item.price! * quantity) * 100);
    const poolCp = (newCoins.gp * 100) + (newCoins.sp * 10) + newCoins.cp;
    
    if (poolCp >= costInCp) {
      let remainingPoolCp = poolCp - costInCp;
      newCoins.gp = Math.floor(remainingPoolCp / 100);
      remainingPoolCp %= 100;
      newCoins.sp = Math.floor(remainingPoolCp / 10);
      newCoins.cp = remainingPoolCp % 10;
    } else {
      let totalCpTotal = (newCoins.pp * 1000) + poolCp;
      totalCpTotal = Math.max(0, totalCpTotal - costInCp);
      newCoins.pp = Math.floor(totalCpTotal / 1000);
      totalCpTotal %= 1000;
      newCoins.gp = Math.floor(totalCpTotal / 100);
      totalCpTotal %= 100;
      newCoins.sp = Math.floor(totalCpTotal / 10);
      newCoins.cp = totalCpTotal % 10;
    }

    setParty(prev => ({ ...prev, coins: newCoins, inventory: newInventory, lastUpdate: Date.now() }));
    addTransaction(TransactionType.BUY, item.name!, item.price!, quantity);
    addNotification(`Acquisto completato: ${item.name}`, 'success');
  };

  const handleSell = (item: InventoryItem, quantity: number = 1) => {
    const percentage = item.salePercentage ?? 50;
    let sellPrice = item.price * (percentage / 100);

    // Purchase Limit Logic
    if (cityStats && sellPrice > cityStats.purchaseLimit) {
      const proceed = confirm(`Attenzione: Il prezzo di vendita (${sellPrice.toFixed(2)} MO) supera il limite di acquisto di ${cityStats.name} (${cityStats.purchaseLimit} MO). La città non può pagarti l'intero valore. Vuoi vendere comunque a ${cityStats.purchaseLimit} MO?`);
      if (!proceed) return;
      sellPrice = cityStats.purchaseLimit;
    }

    const totalGain = sellPrice * quantity;

    let newInventory = [...party.inventory];
    const itemIndex = newInventory.findIndex(i => i.id === item.id);
    
    if (itemIndex >= 0) {
      if (newInventory[itemIndex].quantity > quantity) {
        newInventory[itemIndex].quantity -= quantity;
      } else {
        newInventory = newInventory.filter(i => i.id !== item.id);
      }
    }

    const newCoins = { 
      pp: Number(party.coins.pp || 0),
      gp: Number(party.coins.gp || 0),
      sp: Number(party.coins.sp || 0),
      cp: Number(party.coins.cp || 0)
    };
    // Add gain primarily to GP/SP/CP (do not auto-convert to PP)
    const gainInCp = Math.round(totalGain * 100);
    let poolCp = (newCoins.gp * 100) + (newCoins.sp * 10) + newCoins.cp;
    poolCp += gainInCp;

    newCoins.gp = Math.floor(poolCp / 100);
    poolCp %= 100;
    newCoins.sp = Math.floor(poolCp / 10);
    newCoins.cp = poolCp % 10;
    // pp remains fixed unless manually edited

    setParty(prev => ({
      ...prev,
      coins: newCoins,
      inventory: newInventory,
      lastUpdate: Date.now()
    }));

    addTransaction(TransactionType.SELL, item.name, sellPrice, quantity);
  };

  const addTransaction = (type: TransactionType, itemName: string, price: number, quantity: number) => {
    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      itemId: "temp",
      itemName,
      price,
      quantity,
      timestamp: Date.now()
    };
    setTransactions(prev => [newTx, ...prev].slice(0, 100));
  };

  const clearHistory = (type: 'all' | 'count' | 'days') => {
    if (type === 'all') {
      if (confirm("Sei sicuro di voler svuotare l'intero registro?")) {
        setTransactions([]);
        addNotification("Registro transazioni svuotato", "info");
      }
    } else if (type === 'count') {
      setTransactions(prev => prev.slice(numToDelete));
      addNotification(`Eliminate le ultime ${numToDelete} transazioni`, "info");
    } else if (type === 'days') {
      const cutOff = Date.now() - (daysToDelete * 24 * 60 * 60 * 1000);
      setTransactions(prev => prev.filter(tx => tx.timestamp >= cutOff));
      addNotification(`Eliminate transazioni più vecchie di ${daysToDelete} giorni`, "info");
    }
  };

  const handleCitySelect = async (cityName: string) => {
    if (cityName === "NEW_CITY") {
      setCityStats(null);
      setCityQuery("");
      return;
    }

    if (cityInventoriesCache[cityName]) {
      setIsSearchingCity(true);
      setCityError(null);
      setSearchResults(null);
      setFailedCityItemSearches({});
      
      // We need the full stats object. If we don't have it cached separately, 
      // we might need to lookup stats again or store stats in the cache.
      // Let's modify the cache to store stats too.
      const cacheData = cityInventoriesCache[cityName] as any;
      if (cacheData.stats) {
        setCityStats(cacheData.stats);
        setCityInventory(cacheData.inventory);
        setRolledCityItems(cacheData.items);
        setCityQuery(cityName);
      } else {
        // Fallback if stats aren't in cache
        const stats = await lookupCityStats(cityName);
        if (stats) {
          setCityStats(stats as CityStats);
          setCityInventory(cacheData.inventory);
          setRolledCityItems(cacheData.items);
          setCityQuery(cityName);
          // Update cache with stats
          setCityInventoriesCache(prev => ({
            ...prev,
            [cityName]: { ...prev[cityName], stats }
          }));
        }
      }
      setIsSearchingCity(false);
    }
  };

  const handleSearch = async () => {
    // If no city selected or city changed, lookup city first
    if (cityQuery && (!cityStats || cityStats.name.toLowerCase() !== cityQuery.toLowerCase())) {
      setIsSearchingCity(true);
      setCityError(null);
      setRolledCityItems(null);
      setSearchResults(null);
      
      const stats = await lookupCityStats(cityQuery);
      if (stats && stats.name) {
        const cityName = stats.name;
        setCityStats(stats as CityStats);
        setFailedCityItemSearches({}); // Reset failed searches tracking for new city

        // Check cache before generating
        if (cityInventoriesCache[cityName]) {
          const cacheData = cityInventoriesCache[cityName] as any;
          setCityInventory(cacheData.inventory);
          setRolledCityItems(cacheData.items);
        } else {
          const minor = rollDice(stats.minorItems || "0");
          const medium = rollDice(stats.mediumItems || "0");
          const major = rollDice(stats.majorItems || "0");
          const inventory = { minor, medium, major };
          setCityInventory(inventory);
          
          const magicItems = await generateCityMagicInventory(stats.name, stats as CityStats, inventory);
          const sortedItems = magicItems ? [...magicItems].sort((a, b) => (a.price || 0) - (b.price || 0)) : [];
          setRolledCityItems(sortedItems);
          
          // Cache results including stats
          setCityInventoriesCache(prev => ({
            ...prev,
            [cityName]: { inventory, items: sortedItems, stats } as any
          }));
        }
      } else {
        setCityStats(null);
        setCityInventory(null);
        setRolledCityItems(null);
        setCityError("Città non presente");
      }
      setIsSearchingCity(false);
      return; 
    }

    // Item search ONLY if city exists
    if (searchQuery && cityStats) {
      setIsSearching(true);
      setSearchResults(null);
      const results = await lookupItemOnWiki(searchQuery);
      if (results && results.length > 0) {
        if (results.length > 1) {
          setMultipleResultsModal({ items: results, forManual: false });
        } else {
          setSearchResults(results);
        }
      } else {
        setSearchResults([]);
      }
      setIsSearching(false);
    }
  };

  const handleRefreshCityItems = async () => {
    if (!cityStats) return;
    setIsSearchingCity(true);
    setRolledCityItems(null);
    setFailedCityItemSearches({}); // Reset failed searches tracking
    
    // Re-roll inventory counts
    const minor = rollDice(cityStats.minorItems || "0");
    const medium = rollDice(cityStats.mediumItems || "0");
    const major = rollDice(cityStats.majorItems || "0");
    const inventory = { minor, medium, major };
    setCityInventory(inventory);

    const magicItems = await generateCityMagicInventory(cityStats.name, cityStats, inventory);
    const sortedItems = magicItems ? [...magicItems].sort((a, b) => (a.price || 0) - (b.price || 0)) : [];
    setRolledCityItems(sortedItems);
    
    // Update cache
    setCityInventoriesCache(prev => ({
      ...prev,
      [cityStats.name]: { ...prev[cityStats.name], items: sortedItems, inventory }
    }));
    
    setIsSearchingCity(false);
  };

  return (
    <div className="min-h-screen font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between px-8 py-6 border-b border-white/5 bg-surface/50 backdrop-blur-xl gap-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-arcane/30 to-transparent"></div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 bg-stone-900 border border-arcane/50 rounded-full flex items-center justify-center text-arcane shadow-lg shadow-arcane/20 animate-pulse-slow">
            <Package className="w-6 h-6" />
          </div>
          <div>
            {isEditingName ? (
              <input 
                autoFocus
                className="bg-black/40 border border-arcane rounded px-2 py-1 text-arcane font-serif italic text-xl outline-none"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={() => {
                  setParty(p => ({ ...p, name: tempName }));
                  setIsEditingName(false);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    setParty(p => ({ ...p, name: tempName }));
                    setIsEditingName(false);
                  }
                }}
              />
            ) : (
              <h1 
                className="text-2xl font-serif italic tracking-tight text-white cursor-pointer hover:text-arcane transition-colors"
                onClick={() => {
                  setTempName(party.name);
                  setIsEditingName(true);
                }}
              >
                {party.name}
              </h1>
            )}
            <p className="label-micro text-arcane/60 lowercase italic">Gestore del Bottino</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 relative z-10">
          <div className="flex items-center gap-4">
            {isEditingCoins ? (
              <div className="flex items-center gap-2 bg-black/60 p-2 rounded border border-arcane/30 backdrop-blur-md">
                {(["pp", "gp", "sp", "cp"] as const).map(c => (
                  <div key={c} className="flex flex-col items-center">
                    <label className="label-micro uppercase text-[8px] text-arcane/50">
                      {c === "pp" ? "MP" : c === "gp" ? "MO" : c === "sp" ? "MA" : "MB"}
                    </label>
                    <input 
                      type="number"
                      className="w-12 bg-transparent text-center font-mono font-bold text-arcane outline-none text-xs"
                      value={tempCoins[c]}
                      onChange={(e) => setTempCoins({ ...tempCoins, [c]: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                ))}
                <button onClick={saveCoins} className="text-arcane hover:text-white p-1"><Save size={16} /></button>
                <button onClick={() => setIsEditingCoins(false)} className="text-rose-500 p-1"><X size={16} /></button>
              </div>
            ) : (
              <div 
                className="flex items-center gap-4 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-all group border border-transparent hover:border-arcane/20"
                onClick={() => {
                  setTempCoins(party.coins);
                  setIsEditingCoins(true);
                }}
              >
                {(["pp", "gp", "sp", "cp"] as const).map(c => (
                  <div key={c} className="text-center">
                    <div className="label-micro block text-[8px] opacity-40">
                      {c === "pp" ? "MP" : c === "gp" ? "MO" : c === "sp" ? "MA" : "MB"}
                    </div>
                    <div className={`font-mono font-bold text-sm ${c === 'pp' ? 'text-blue-300' : c === 'gp' ? 'text-gold' : c === 'sp' ? 'text-gray-400' : 'text-amber-700'}`}>
                      {party.coins[c]}
                    </div>
                  </div>
                ))}
                <Edit3 size={12} className="opacity-0 group-hover:opacity-100 text-arcane transition-opacity" />
              </div>
            )}
          </div>
          <div className="h-10 w-px bg-white/10 hidden md:block"></div>
          <div className="text-right hidden sm:block">
            <div className="label-micro text-arcane/40">Oro posseduto</div>
            <div className="text-xl font-bold text-arcane font-mono tracking-tighter">
              {calculateTotalGP(party.coins).toFixed(2)} <span className="text-sm font-sans tracking-normal opacity-50">MO</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="flex justify-center gap-8 p-4 bg-surface-dim/90 sticky top-0 z-10 backdrop-blur-xl border-b border-white/5">
        {[
          { id: "inventory", label: "Inventario", icon: Package },
          { id: "shop", label: "Bazar", icon: ShoppingCart },
          { id: "history", label: "Antico Registro", icon: History },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`
              flex items-center gap-2 px-2 py-2 transition-all text-[10px] uppercase tracking-[0.2em] font-bold relative
              ${activeTab === tab.id 
                ? "text-arcane shadow-arcane/20" 
                : "text-gray-500 hover:text-gray-300"}
            `}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTab"
                className="absolute -bottom-4 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-arcane to-transparent"
              />
            )}
          </button>
        ))}
      </nav>

      <main className="max-w-5xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {activeTab === "inventory" && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
                <div>
                  <h2 className="text-3xl italic font-serif text-white">Inventario di Gruppo</h2>
                  <div className="flex gap-4 mt-2">
                    <div className="bg-surface/30 px-3 py-1.5 rounded border border-white/5">
                      <span className="label-micro block text-arcane/40 mb-0.5">Valore Mercato (100%)</span>
                      <span className="font-mono text-sm text-stone-300">
                        {party.inventory.reduce((acc, i) => acc + (i.price * i.quantity), 0).toFixed(2)} MO
                      </span>
                    </div>
                    <div className="bg-emerald-500/5 px-3 py-1.5 rounded border border-emerald-500/10">
                      <span className="label-micro block text-emerald-500/40 mb-0.5">Valore Vendita</span>
                      <span className="font-mono text-sm text-emerald-500 font-bold">
                        {party.inventory.reduce((acc, i) => acc + (i.price * ((i.salePercentage ?? 50) / 100) * i.quantity), 0).toFixed(2)} MO
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-surface rounded-lg p-1 border border-border">
                    <button 
                      onClick={() => setSortBy("name")}
                      className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-md transition-all ${sortBy === "name" ? "bg-arcane text-black" : "text-gray-500 hover:text-gray-300"}`}
                    >
                      Nome
                    </button>
                    <button 
                      onClick={() => setSortBy("price")}
                      className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-md transition-all ${sortBy === "price" ? "bg-arcane text-black" : "text-gray-500 hover:text-gray-300"}`}
                    >
                      Prezzo
                    </button>
                  </div>
                  <button 
                    onClick={() => setShowManualItemModal(true)}
                    className="flex items-center gap-2 bg-surface text-arcane border border-arcane/20 px-4 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-arcane hover:text-black transition-all shadow-lg shadow-arcane/5"
                  >
                    <Plus size={14} />
                    Aggiungi Oggetto
                  </button>
                  <div className="label-micro bg-surface px-4 py-2 rounded-lg border border-border">
                    {party.inventory.reduce((acc, i) => acc + i.quantity, 0)} oggetti
                  </div>
                </div>
              </div>

              {party.inventory.length === 0 ? (
                <div className="bg-surface-dim border border-border border-dashed p-16 text-center flex flex-col items-center gap-4 rounded-xl">
                  <Package className="w-12 h-12 text-gray-700" />
                  <p className="text-gray-500 italic font-serif">L'inventario è vuoto. Tempo di andare all'avventura!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="hidden md:flex px-6 py-2 label-micro border-b border-border mb-2 gap-4">
                    <div className="flex-1">Oggetto</div>
                    <div className="w-24">Quantità</div>
                    <div className="w-32">Valore Totale (MO)</div>
                    <div className="w-32">Peso (kg)</div>
                    <div className="w-32 text-right">Azioni</div>
                  </div>
                  {[...party.inventory].sort((a, b) => {
                    if (sortBy === "name") return a.name.localeCompare(b.name);
                    return a.price - b.price;
                  }).map((item) => (
                    <motion.div 
                      layout
                      key={item.id} 
                      className="bg-surface/40 border border-white/5 rounded-lg px-6 py-4 flex flex-col md:flex-row md:items-center gap-4 group hover:border-arcane/20 transition-all shadow-xl shadow-black/20"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-serif italic text-white group-hover:text-arcane transition-colors">{item.name}</h3>
                          <span className="text-[8px] bg-arcane/10 text-arcane px-1.5 py-0.5 rounded border border-arcane/20 leading-none font-bold tracking-tighter uppercase font-mono">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1 italic font-serif">“{item.description}”</p>
                      </div>

                      <div className="w-24 flex items-center gap-2">
                        <span className="md:hidden label-micro">Qtà:</span>
                        <div className="flex items-center gap-1 bg-black/20 rounded border border-white/5 p-1">
                          <button 
                            onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                            className="w-5 h-5 flex items-center justify-center text-xs hover:text-arcane transition-colors font-mono"
                          >-</button>
                          <input 
                            type="number"
                            className="w-8 bg-transparent text-center font-mono font-bold text-arcane text-xs outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={item.quantity}
                            onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                          />
                          <button 
                            onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                            className="w-5 h-5 flex items-center justify-center text-xs hover:text-arcane transition-colors font-mono"
                          >+</button>
                        </div>
                      </div>

                      <div className="w-32 flex items-center gap-2">
                        <span className="md:hidden label-micro">Valore:</span>
                        <div className="font-mono text-stone-400 text-sm">{(item.price * item.quantity).toFixed(2)} <span className="text-[10px]">MO</span></div>
                      </div>

                      <div className="w-32 flex items-center gap-2">
                        <span className="md:hidden label-micro text-[8px]">Peso (kg):</span>
                        <div className="text-gray-500 text-xs italic font-mono">{item.weight}</div>
                      </div>

                      <div className="w-32 flex justify-end gap-2">
                        <div className="flex items-center gap-1 bg-black/20 rounded border border-white/5 p-1 mr-2" title="Percentuale di vendita">
                          <input 
                            type="number"
                            className="w-8 bg-transparent text-center font-mono font-bold text-stone-400 text-[10px] outline-none"
                            value={item.salePercentage ?? 50}
                            onChange={(e) => handleUpdateSalePercentage(item.id, parseInt(e.target.value) || 0)}
                          />
                          <span className="text-[8px] text-stone-600">%</span>
                        </div>
                        <button
                          onClick={() => handleSell(item)}
                          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors p-2 bg-emerald-500/5 rounded hover:bg-emerald-500/10"
                          title={`Vendi al ${item.salePercentage ?? 50}%`}
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span className="hidden lg:inline text-[9px]">Vendi</span>
                        </button>
                        <button
                          onClick={() => setItemToRemove(item.id)}
                          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-colors p-2 bg-rose-500/5 rounded hover:bg-rose-500/10"
                          title="Rimuovi senza vendere"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "shop" && (
            <motion.div
              key="shop"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Bazar Header and City Selection */}
              <div className="bg-surface border border-border p-8 rounded-xl shadow-2xl flex flex-col gap-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h3 className="font-serif italic text-3xl text-white">Bazar</h3>
                    <p className="label-micro lowercase opacity-50 mt-1">Seleziona un insediamento per vederne la disponibilità</p>
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    {Object.keys(cityInventoriesCache).length > 0 && !cityError && (
                      <div className="relative flex-1 md:w-64">
                        <select
                          className="w-full bg-dark-bg border border-border rounded-lg py-3 px-4 text-[10px] font-bold uppercase tracking-widest text-stone-100 focus:outline-none focus:border-arcane transition-colors appearance-none cursor-pointer"
                          value={cityStats?.name || ""}
                          onChange={(e) => handleCitySelect(e.target.value)}
                        >
                          <option value="" disabled>Seleziona Insediamento</option>
                          {Object.keys(cityInventoriesCache).map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          <option value="NEW_CITY">+ Nuova Città...</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                          <Plus size={14} />
                        </div>
                      </div>
                    )}

                    {(!Object.keys(cityInventoriesCache).length || !cityStats || cityError) && (
                      <div className="relative flex-1 md:w-64">
                        <input
                          type="text"
                          placeholder="Inserisci nuova Città (es. Sandpoint)"
                          className={`w-full bg-dark-bg border rounded-lg py-3 px-4 text-sm text-stone-100 focus:outline-none focus:border-arcane transition-colors uppercase font-bold tracking-widest text-[10px] ${cityStats ? 'border-arcane/30' : 'border-border'}`}
                          value={cityQuery}
                          onChange={(e) => setCityQuery(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                      </div>
                    )}

                    {(!cityStats || cityError || !Object.keys(cityInventoriesCache).includes(cityQuery)) && (
                      <button
                        onClick={handleSearch}
                        disabled={isSearchingCity}
                        className="medieval-button flex items-center justify-center gap-2"
                      >
                        {isSearchingCity ? (
                          <div className="w-4 h-4 border-2 border-transparent border-t-black rounded-full animate-spin" />
                        ) : (
                          "Trova"
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {cityError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 text-xs font-bold uppercase tracking-widest text-center"
                  >
                    {cityError}
                  </motion.div>
                )}

                {cityStats && (
                  <div className="space-y-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch"
                  >
                    {/* City Info Card */}
                    <div className="lg:col-span-4 bg-black/40 border border-white/5 p-4 rounded-xl flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-arcane font-bold uppercase tracking-[0.2em]">{cityStats.name}</h4>
                          <span className="text-[9px] opacity-40 italic">{cityStats.type}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <div>
                            <div className="text-[8px] text-gray-500 uppercase font-bold">Valore Base</div>
                            <div className="text-sm font-mono text-stone-200">{cityStats.baseValue} MO</div>
                          </div>
                          <div>
                            <div className="text-[8px] text-gray-500 uppercase font-bold">Limite Acquisto</div>
                            <div className="text-sm font-mono text-stone-200">{cityStats.purchaseLimit} MO</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Magic Slots Card */}
                    <div className="lg:col-span-5 bg-black/40 border border-white/5 p-4 rounded-xl flex flex-col">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Tiro Dadi Oggetti</h4>
                        <div className="text-[8px] font-mono text-arcane/40 uppercase">Totale: {cityStats.minorItems} + {cityStats.mediumItems} + {cityStats.majorItems}</div>
                        <button 
                          onClick={handleRefreshCityItems}
                          disabled={isSearchingCity}
                          className="flex items-center gap-1.5 text-[9px] text-arcane hover:opacity-100 opacity-60 transition-all font-bold group disabled:opacity-40"
                        >
                          {isSearchingCity ? (
                            <div className="w-2.5 h-2.5 border border-transparent border-t-arcane rounded-full animate-spin" />
                          ) : (
                            <History size={10} className="group-hover:rotate-180 transition-transform duration-500" />
                          )}
                          {isSearchingCity ? "AGGIORNAMENTO..." : "REFRESH OGGETTI"}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        <div className="bg-white/5 p-2 rounded-lg flex flex-col items-center justify-center">
                          <div className="text-[8px] text-gray-600 uppercase font-bold mb-1">Minori ({cityStats.minorItems})</div>
                          <div className="text-lg font-mono text-stone-400 font-bold">{cityInventory?.minor}</div>
                        </div>
                        <div className="bg-white/5 p-2 rounded-lg flex flex-col items-center justify-center">
                          <div className="text-[8px] text-gray-600 uppercase font-bold mb-1">Medi ({cityStats.mediumItems})</div>
                          <div className="text-lg font-mono text-stone-400 font-bold">{cityInventory?.medium}</div>
                        </div>
                        <div className="bg-white/5 p-2 rounded-lg flex flex-col items-center justify-center">
                          <div className="text-[8px] text-gray-600 uppercase font-bold mb-1">Maggiori ({cityStats.majorItems})</div>
                          <div className="text-lg font-mono text-stone-400 font-bold">{cityInventory?.major}</div>
                        </div>
                      </div>
                    </div>

                    {/* Stats Detail or Action */}
                    <div className="lg:col-span-3 bg-arcane/5 border border-arcane/10 p-4 rounded-xl flex flex-col justify-center items-center text-center">
                      <p className="text-[9px] text-arcane/60 italic leading-relaxed">
                        Gli oggetti nell'inventario cittadino sono garantiti. Cercarne altri: 75% se entro Valore Base, altrimenti non sono presenti.
                      </p>
                      {lastRoll && (
                        <motion.div 
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`mt-2 p-2 rounded border text-[10px] w-full font-bold ${lastRoll.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-rose-500/10 border-rose-500/30 text-rose-500'}`}
                        >
                          D100 Roll: {lastRoll.roll} / {lastRoll.chance}% - {lastRoll.success ? 'SUCCESSO' : 'FALLITO'}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                  </div>
                )}
              </div>

              {/* Item Search - Only shown if city is selected AND inventory is visible */}
              {cityStats && rolledCityItems && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex gap-2 max-w-2xl mx-auto">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-arcane/40" />
                      <input
                        type="text"
                        placeholder={`Cerca un oggetto a ${cityStats.name}...`}
                        className="w-full bg-surface border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-base text-stone-100 focus:outline-none focus:border-arcane transition-all shadow-xl"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      />
                    </div>
                    <button
                      onClick={handleSearch}
                      disabled={isSearching}
                      className="bg-arcane text-black font-bold uppercase tracking-widest text-xs px-8 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50"
                    >
                      {isSearching ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin mx-auto" /> : "Cerca"}
                    </button>
                  </div>

                  {(searchResults || rolledCityItems) && (
                    <div className="space-y-8">
                      {/* Search Results Display */}
                      {searchResults && (
                        <div className="space-y-4">
                          <h4 className="text-[10px] uppercase tracking-[0.3em] font-bold text-gray-500 text-center mb-6">Risultati della Ricerca</h4>
                          {searchResults.map((item, idx) => (
                            <motion.div
                              key={`search-${idx}`}
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="bg-surface border border-white/5 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-6 group hover:border-arcane/30 transition-all"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="text-2xl font-serif italic text-white group-hover:text-arcane transition-colors">{item.name}</h4>
                                  <span className="text-[9px] bg-white/5 px-2 py-1 rounded text-stone-400 font-bold uppercase tracking-widest">{item.category}</span>
                                  {item.price && cityStats && (
                                    <span className={`text-[9px] font-bold uppercase ${item.price <= cityStats.baseValue ? 'text-emerald-500/60' : 'text-amber-500/60'}`}>
                                      Disponibilità: {item.price <= cityStats.baseValue ? '75%' : '0% (Non presente)'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-stone-400 text-sm max-w-2xl italic leading-relaxed">{item.description}</p>
                              </div>

                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">Prezzo</div>
                                  <div className="text-xl font-mono text-gold font-bold">{item.price} <span className="text-xs">MO</span></div>
                                </div>
                                <div className="h-10 w-px bg-white/5"></div>
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2 bg-black/20 rounded-lg p-1 border border-white/5">
                                    <input 
                                      id={`qty-search-${idx}`}
                                      type="number"
                                      min="1"
                                      defaultValue="1"
                                      disabled={!!(item.name && failedCityItemSearches[item.name.toLowerCase().trim()])}
                                      className="w-12 bg-transparent text-center font-mono font-bold text-arcane outline-none text-sm disabled:opacity-20"
                                    />
                                  </div>
                                    <button
                                      disabled={!!(item.name && failedCityItemSearches[item.name.toLowerCase().trim()])}
                                      onClick={() => {
                                        const qtyInput = document.getElementById(`qty-search-${idx}`) as HTMLInputElement;
                                        const qty = parseInt(qtyInput?.value) || 1;
                                        handleBuy(item, qty);
                                      }}
                                      className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all shadow-lg ${
                                        item.name && failedCityItemSearches[item.name.toLowerCase().trim()] 
                                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 opacity-50 cursor-not-allowed' 
                                          : rolledCityItems?.some(ri => ri.name?.toLowerCase().trim() === item.name?.toLowerCase().trim())
                                            ? 'bg-arcane text-black hover:scale-105 shadow-arcane/20 active:scale-95'
                                            : 'bg-stone-700 text-stone-200 hover:bg-stone-600 active:scale-95'
                                      }`}
                                    >
                                      {item.name && failedCityItemSearches[item.name.toLowerCase().trim()] 
                                        ? "Esaurito" 
                                        : (rolledCityItems?.some(ri => ri.name?.toLowerCase().trim() === item.name?.toLowerCase().trim()) ? "Acquista" : "Cerca Disponibilità")
                                      }
                                    </button>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                          {searchResults.length === 0 && (
                            <div className="text-center py-12 text-stone-600 italic">Nessun oggetto trovato nel database.</div>
                          )}
                        </div>
                      )}

                      {/* City Inventory Display */}
                      {rolledCityItems && (
                        <div className="space-y-6">
                          <div className="flex flex-col md:flex-row items-center gap-4 py-8">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-arcane/20"></div>
                            <div className="flex flex-col items-center gap-2">
                              <h4 className="text-[10px] uppercase tracking-[0.4em] font-bold text-arcane leading-none">Inventario di {cityStats.name}</h4>
                              <div className="flex bg-surface rounded-lg p-0.5 border border-white/5 mt-2">
                                <button 
                                  onClick={() => setSortByCity("name")}
                                  className={`px-2 py-1 text-[8px] font-bold uppercase tracking-widest rounded transition-all ${sortByCity === "name" ? "bg-arcane text-black" : "text-gray-500 hover:text-gray-300"}`}
                                >
                                  Nome
                                </button>
                                <button 
                                  onClick={() => setSortByCity("price")}
                                  className={`px-2 py-1 text-[8px] font-bold uppercase tracking-widest rounded transition-all ${sortByCity === "price" ? "bg-arcane text-black" : "text-gray-500 hover:text-gray-300"}`}
                                >
                                  Prezzo
                                </button>
                              </div>
                            </div>
                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-arcane/20"></div>
                          </div>

                          <div className="space-y-2">
                            {rolledCityItems.length === 0 ? (
                              <div className="text-center py-8 text-stone-600 italic border border-dashed border-white/5 rounded-xl">
                                Tutti gli oggetti della città sono stati acquistati o non ce ne sono.
                              </div>
                            ) : (
                              [...rolledCityItems].sort((a, b) => {
                                if (sortByCity === "name") return (a.name || "").localeCompare(b.name || "");
                                return (a.price || 0) - (b.price || 0);
                              }).map((item, idx) => (
                                <motion.div
                                  key={`rolled-${idx}`}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.01 }}
                                  className="bg-surface/40 border border-white/5 px-6 py-4 rounded-xl flex justify-between items-center group hover:bg-surface hover:border-arcane/20 transition-all shadow-sm"
                                >
                                  <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3">
                                        <h5 className="text-base font-serif text-stone-200 group-hover:text-arcane transition-colors">
                                          {item.name}
                                        </h5>
                                        {item.rarity && (
                                          <span className={`text-[7px] px-1.5 py-0.5 rounded uppercase font-bold tracking-widest ${
                                            item.rarity === 'Maggiore' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                            item.rarity === 'Medio' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                            'bg-stone-500/20 text-stone-400 border border-stone-500/30'
                                          }`}>
                                            {item.rarity}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-stone-600 italic line-clamp-1 mt-0.5">{item.description}</p>
                                    </div>
                                    <div className="flex gap-8 items-center w-48 text-right pr-4">
                                      <div className="flex-1">
                                        <div className="text-[8px] text-gray-500 uppercase font-bold">Peso (kg)</div>
                                        <div className="text-[10px] text-stone-500 font-mono italic">{item.weight}</div>
                                      </div>
                                      <div className="flex-1">
                                        <div className="text-[8px] text-gray-500 uppercase font-bold">Prezzo</div>
                                        <div className="text-sm font-mono text-gold font-bold">{item.price} <span className="opacity-50 text-[10px]">MO</span></div>
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleBuy(item, 1)}
                                    className="px-4 py-2 bg-arcane/5 text-arcane text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-arcane hover:text-black transition-all border border-arcane/10 flex items-center gap-2"
                                  >
                                    <ShoppingCart size={12} />
                                    Acquista
                                  </button>
                                </motion.div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-3xl italic font-serif text-white">Registro Transazioni</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-surface border border-border rounded p-0.5 gap-1">
                    <input 
                      type="number"
                      className="w-10 bg-transparent text-center font-mono text-[10px] text-arcane outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={daysToDelete}
                      onChange={(e) => setDaysToDelete(parseInt(e.target.value) || 0)}
                    />
                    <button 
                      onClick={() => clearHistory('days')}
                      className="text-gray-500 px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest hover:text-white transition-all border-l border-border hover:bg-white/5"
                    >
                      Giorni
                    </button>
                  </div>
                  <div className="flex items-center bg-surface border border-border rounded p-0.5 gap-1">
                    <input 
                      type="number"
                      className="w-10 bg-transparent text-center font-mono text-[10px] text-arcane outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={numToDelete}
                      onChange={(e) => setNumToDelete(parseInt(e.target.value) || 0)}
                    />
                    <button 
                      onClick={() => clearHistory('count')}
                      className="text-gray-500 px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest hover:text-white transition-all border-l border-border hover:bg-white/5"
                    >
                      Ultime N
                    </button>
                  </div>
                  <button 
                    onClick={() => clearHistory('all')}
                    className="flex items-center gap-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                  >
                    Svuota Tutto
                  </button>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="bg-surface-dim border border-border p-12 text-center rounded-xl text-gray-500 italic font-serif">
                  Nessuna transazione registrata ancora.
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(
                    transactions.reduce((groups: Record<string, Transaction[]>, tx) => {
                      const date = new Date(tx.timestamp).toLocaleDateString('it-IT', { 
                        day: 'numeric', 
                        month: 'long', 
                        year: 'numeric' 
                      });
                      if (!groups[date]) groups[date] = [];
                      groups[date].push(tx);
                      return groups;
                    }, {})
                  ).map(([date, groupTxs]) => (
                    <div key={date} className="space-y-3">
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/5"></div>
                        <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">{date}</h3>
                        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/5"></div>
                      </div>
                      {((groupTxs as any) as Transaction[]).map((tx) => (
                        <div key={tx.id} className="bg-surface border border-border p-4 rounded-lg flex items-center justify-between hover:border-gold/20 transition-all">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded flex items-center justify-center ${tx.type === TransactionType.BUY ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                              {tx.type === TransactionType.BUY ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-white">
                                {tx.type === TransactionType.BUY ? "Acquisto" : "Vendita"} {tx.itemName}
                              </div>
                              <div className="text-[10px] text-gray-500 font-mono">
                                {new Date(tx.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-mono font-bold ${tx.type === TransactionType.BUY ? "text-rose-500" : "text-emerald-500"}`}>
                              {tx.type === TransactionType.BUY ? "-" : "+"}{(tx.price * tx.quantity).toFixed(2)} MO
                            </div>
                            {tx.quantity > 1 && <div className="text-[9px] text-gray-600 uppercase tracking-tighter">{tx.quantity} unità @ {tx.price} MO</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Manual Item Modal */}
      <AnimatePresence>
        {showManualItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManualItemModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-surface border border-border p-8 rounded-2xl shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif italic text-white">Nuovo Oggetto</h3>
                <button onClick={() => setShowManualItemModal(false)} className="text-gray-500 hover:text-white p-2">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="label-micro uppercase">Nome Oggetto</label>
                  <div className="flex gap-2">
                    <input 
                      className="flex-1 bg-dark-bg border border-border rounded-lg p-3 text-stone-100 focus:border-gold outline-none"
                      placeholder="es. Spada lunga +1"
                      value={manualItem.name}
                      onChange={(e) => setManualItem({ ...manualItem, name: e.target.value })}
                    />
                    <button 
                      onClick={handleManualLookup}
                      disabled={isSearchingManual}
                      className="bg-gold/10 text-gold border border-gold/20 px-4 rounded-lg hover:bg-gold hover:text-black transition-all flex items-center justify-center"
                      title="Cerca dati automaticamente"
                    >
                      {isSearchingManual ? <div className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" /> : <Search size={18} />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="label-micro uppercase">Prezzo (MO)</label>
                    <input 
                      type="number"
                      className="w-full bg-dark-bg border border-border rounded-lg p-3 text-stone-100 focus:border-gold outline-none"
                      value={manualItem.price}
                      onChange={(e) => setManualItem({ ...manualItem, price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="label-micro uppercase">Quantità</label>
                    <input 
                      type="number"
                      min="1"
                      className="w-full bg-dark-bg border border-border rounded-lg p-3 text-stone-100 focus:border-gold outline-none"
                      value={manualItem.quantity}
                      onChange={(e) => setManualItem({ ...manualItem, quantity: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="label-micro uppercase">Vendi al (%)</label>
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    className="w-full bg-dark-bg border border-border rounded-lg p-3 text-stone-100 focus:border-gold outline-none font-mono"
                    value={manualItem.salePercentage}
                    onChange={(e) => setManualItem({ ...manualItem, salePercentage: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="label-micro uppercase">Peso (kg)</label>
                  <input 
                    placeholder="es. 2 kg"
                    className="w-full bg-dark-bg border border-border rounded-lg p-3 text-stone-100 focus:border-gold outline-none"
                    value={manualItem.weight}
                    onChange={(e) => setManualItem({ ...manualItem, weight: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="label-micro uppercase">Categoria</label>
                  <select 
                    className="w-full bg-dark-bg border border-border rounded-lg p-3 text-stone-100 focus:border-gold outline-none"
                    value={manualItem.category}
                    onChange={(e) => setManualItem({ ...manualItem, category: e.target.value as any })}
                  >
                    {["Equipaggiamento", "Armi", "Armature", "Oggetti Magici", "Altro"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label-micro uppercase">Descrizione</label>
                  <textarea 
                    rows={3}
                    className="w-full bg-dark-bg border border-border rounded-lg p-3 text-stone-100 focus:border-gold outline-none resize-none"
                    value={manualItem.description}
                    onChange={(e) => setManualItem({ ...manualItem, description: e.target.value })}
                  />
                </div>
              </div>

              <button 
                onClick={handleAddManualItem}
                className="medieval-button w-full py-4 text-sm"
              >
                Aggiungi all'Inventario
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Multiple Results Modal */}
      <AnimatePresence>
        {multipleResultsModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMultipleResultsModal(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-surface border border-border p-8 rounded-2xl shadow-2xl space-y-6 max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-serif italic text-white">Più risultati trovati</h3>
                  <p className="text-xs text-gray-500">Seleziona l'oggetto esatto che stai cercando</p>
                </div>
                <button onClick={() => setMultipleResultsModal(null)} className="text-gray-500 hover:text-white p-2">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {multipleResultsModal.items.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (multipleResultsModal.forManual) {
                        setManualItem(prev => ({ ...prev, ...item }));
                        setMultipleResultsModal(null);
                      } else {
                        setSearchResults([item]);
                        setMultipleResultsModal(null);
                      }
                    }}
                    className="w-full text-left bg-dark-bg border border-border p-4 rounded-xl hover:border-gold/50 transition-all group"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-white group-hover:text-gold transition-colors">{item.name}</h4>
                        <p className="text-[10px] text-gray-500 mt-1 line-clamp-1 italic">{item.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-gold font-mono font-bold">{item.price} MO</div>
                        <div className="text-[10px] text-gray-600">{item.weight}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Remove Confirmation Modal */}
      <AnimatePresence>
        {itemToRemove && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setItemToRemove(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-sm bg-surface border border-rose-500/20 p-8 rounded-2xl shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500 mx-auto">
                <Trash2 size={32} />
              </div>
              <div>
                <h3 className="text-xl font-serif italic text-white">Rimuovere Oggetto?</h3>
                <p className="text-xs text-gray-500 mt-2">Questa azione è irreversibile e non darà oro alla compagnia.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setItemToRemove(null)}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Annulla
                </button>
                <button 
                  onClick={confirmRemove}
                  className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Rimuovi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notifications Layer */}
      <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`
                pointer-events-auto p-4 rounded-xl border shadow-2xl backdrop-blur-md min-w-[300px] flex items-center justify-between gap-4
                ${n.type === 'success' ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-300' : 
                  n.type === 'error' ? 'bg-rose-900/40 border-rose-500/30 text-rose-300' : 
                  'bg-stone-900/40 border-white/10 text-stone-300'}
              `}
            >
              <span className="text-xs font-bold uppercase tracking-widest">{n.message}</span>
              <button onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} className="text-current opacity-50 hover:opacity-100">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <footer className="p-8 text-center text-stone-700 text-[10px] mt-12 border-t border-white/5 bg-black/40">
        <div className="max-w-xl mx-auto space-y-2 uppercase tracking-[0.2em] font-bold">
          <p>Valori di mercato basati su Wiki Golarion • Campagna: Return of the Runelords</p>
          <div className="flex justify-center gap-4 opacity-30">
            <span>Invidia</span>
            <span>Accidia</span>
            <span>Superbia</span>
            <span>Avarizia</span>
            <span>Gola</span>
            <span>Lussuria</span>
            <span>Ira</span>
          </div>
          <p className="mt-2 text-[8px] opacity-20 lowercase italic">Powered by Gemini AI Studio • Thassilonian Edition</p>
        </div>
      </footer>
    </div>
  );
}
