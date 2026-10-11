import {
  BagIcon,
  CarIcon,
  CartIcon,
  FuelIcon,
  GiftIcon,
  HeartPulseIcon,
  HomeIcon,
  PlaneIcon,
  SofaIcon,
  TagIcon,
  TicketIcon,
  TrophyIcon,
  UtensilsIcon,
  WineIcon,
  ZapIcon,
  type Icon,
} from "./components/icons";

/** Expense categories. Stored on the expense as the plain name, so renaming one
 *  orphans old rows — they fall back to "Other" styling. `hue` drives the tile tint. */
export type Category = { name: string; icon: Icon; hue: number; keywords: RegExp };

export const CATEGORIES: Category[] = [
  { name: "Food", icon: UtensilsIcon, hue: 40, keywords: /\b(dinner|lunch|breakfast|brunch|food|restaurant|cafe|coffee|pizza|burger|biryani|swiggy|zomato|snacks?|meal|chai|dosa|tea)\b/i },
  { name: "Groceries", icon: CartIcon, hue: 145, keywords: /\b(grocer(y|ies)|supermarket|vegetables?|veggies|fruits?|milk|bigbasket|blinkit|zepto|instamart|dmart|kirana)\b/i },
  { name: "Drinks", icon: WineIcon, hue: 350, keywords: /\b(drinks?|beer|wine|bar|pub|cocktails?|alcohol|liquor|whisky|vodka)\b/i },
  { name: "Rent", icon: HomeIcon, hue: 260, keywords: /\b(rent|lease|deposit|maintenance|society)\b/i },
  { name: "Utilities", icon: ZapIcon, hue: 85, keywords: /\b(electricity|power|water|gas|wi-?fi|internet|broadband|phone|mobile|recharge|bill|dth|cylinder)\b/i },
  { name: "Household", icon: SofaIcon, hue: 25, keywords: /\b(furniture|cleaning|supplies|maid|cook|household|repair|plumber|laundry|detergent|appliance)\b/i },
  { name: "Travel", icon: PlaneIcon, hue: 220, keywords: /\b(flights?|hotel|villa|airbnb|hostel|resort|trip|train|booking|visa|stay|tickets?)\b/i },
  { name: "Transport", icon: CarIcon, hue: 200, keywords: /\b(cab|taxi|uber|ola|rapido|auto|metro|bus|parking|toll|scooter|bike|rental)\b/i },
  { name: "Fuel", icon: FuelIcon, hue: 10, keywords: /\b(fuel|petrol|diesel|gas station|cng|ev charging)\b/i },
  { name: "Entertainment", icon: TicketIcon, hue: 300, keywords: /\b(movies?|cinema|concert|show|netflix|spotify|prime|games?|parasailing|party|club|event)\b/i },
  { name: "Shopping", icon: BagIcon, hue: 320, keywords: /\b(shopping|clothes|amazon|flipkart|myntra|shoes|mall|electronics)\b/i },
  { name: "Gifts", icon: GiftIcon, hue: 0, keywords: /\b(gifts?|birthday|present|anniversary|wedding)\b/i },
  { name: "Medical", icon: HeartPulseIcon, hue: 15, keywords: /\b(medical|medicine|pharmacy|doctor|hospital|clinic|chemist|dentist|tests?)\b/i },
  { name: "Sports", icon: TrophyIcon, hue: 120, keywords: /\b(cricket|football|turf|gym|badminton|tennis|sports?|swimming|court)\b/i },
  { name: "Other", icon: TagIcon, hue: 255, keywords: /$^/ },
];

const BY_NAME = new Map(CATEGORIES.map((c) => [c.name.toLowerCase(), c]));
const OTHER = CATEGORIES[CATEGORIES.length - 1];

export function categoryFor(name: string | null | undefined): Category {
  return (name && BY_NAME.get(name.toLowerCase())) || OTHER;
}

/** Best-guess category from a free-text description, or null. */
export function suggestCategory(description: string): string | null {
  if (description.trim().length < 3) return null;
  return CATEGORIES.find((c) => c.keywords.test(description))?.name ?? null;
}
