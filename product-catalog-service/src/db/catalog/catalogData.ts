import { ConfigurationOption, DietaryTag, ProductCategory } from "../../types/product";

/**
 * Hand-authored "base items". The generator (`generateCatalog.ts`) expands
 * each one across brands x sizes x varieties into individual SKUs, so ~200
 * lines here become ~2,000 products. Everything is fictional - invented brand
 * names, no real trademarks.
 */
export interface BaseItem {
  name: string;
  emoji: string;
  /** Subcategory display name ("Milk"); the slug is derived. */
  sub: string;
  /** Price in cents for the FIRST size (multiplier 1). */
  price: number;
  /** Unit of measure for sizes and unit pricing. */
  unit: "oz" | "lb" | "fl oz" | "gal" | "ct" | "pk" | "each" | "L";
  /** [quantity, price multiplier] per pack size. */
  sizes: [number, number][];
  varieties?: string[];
  tax: "grocery" | "prepared-food" | "candy" | "soft-drink" | "general";
  /** Extra national-brand variants alongside the store brand (default 1). */
  nb?: number;
  tags?: DietaryTag[];
  /** Where a variety goes in the name: before (default), after, or instead of the base name. */
  vpos?: "prefix" | "suffix" | "replace";
  /** Loose, priced per lb (sizes ignored). */
  weight?: boolean;
  /** Not SNAP-eligible (hot/prepared food, non-food). Defaults to eligible for food. */
  noSnap?: boolean;
  options?: ConfigurationOption[];
}

type Catalog = Record<ProductCategory, BaseItem[]>;

const V = ["Vanilla", "Strawberry", "Blueberry", "Peach", "Mixed Berry", "Lemon"];

export const CATALOG: Catalog = {
  produce: [
    { name: "Bananas", emoji: "🍌", sub: "Fruit", price: 59, unit: "lb", sizes: [[1, 1]], tax: "grocery", nb: 0, weight: true, tags: ["vegan", "gluten-free"] },
    { name: "Apples", emoji: "🍎", sub: "Fruit", price: 399, unit: "lb", sizes: [[3, 1], [5, 1.6]], varieties: ["Gala", "Fuji", "Honeycrisp", "Granny Smith", "Pink Lady"], tax: "grocery", nb: 0, tags: ["vegan", "gluten-free"] },
    { name: "Navel Oranges", emoji: "🍊", sub: "Fruit", price: 449, unit: "lb", sizes: [[4, 1], [8, 1.8]], tax: "grocery", nb: 0, tags: ["vegan", "gluten-free"] },
    { name: "Strawberries", emoji: "🍓", sub: "Fruit", price: 349, unit: "oz", sizes: [[16, 1], [32, 1.8]], tax: "grocery", nb: 1, tags: ["vegan", "gluten-free"] },
    { name: "Blueberries", emoji: "🫐", sub: "Fruit", price: 399, unit: "oz", sizes: [[11, 1], [18, 1.5]], tax: "grocery", nb: 1, tags: ["vegan", "gluten-free"] },
    { name: "Red Seedless Grapes", emoji: "🍇", sub: "Fruit", price: 199, unit: "lb", sizes: [[1, 1]], tax: "grocery", nb: 0, weight: true, tags: ["vegan", "gluten-free"] },
    { name: "Avocados", emoji: "🥑", sub: "Fruit", price: 79, unit: "ct", sizes: [[1, 1], [4, 3.4]], tax: "grocery", nb: 0, tags: ["vegan", "gluten-free", "keto"] },
    { name: "Lemons", emoji: "🍋", sub: "Fruit", price: 349, unit: "lb", sizes: [[2, 1], [4, 1.8]], tax: "grocery", nb: 0, tags: ["vegan", "gluten-free"] },
    { name: "Baby Carrots", emoji: "🥕", sub: "Vegetables", price: 199, unit: "oz", sizes: [[16, 1], [32, 1.7]], tax: "grocery", nb: 1, tags: ["vegan", "gluten-free"] },
    { name: "Russet Potatoes", emoji: "🥔", sub: "Vegetables", price: 399, unit: "lb", sizes: [[5, 1], [10, 1.7]], tax: "grocery", nb: 0, tags: ["vegan", "gluten-free"] },
    { name: "Yellow Onions", emoji: "🧅", sub: "Vegetables", price: 299, unit: "lb", sizes: [[3, 1], [5, 1.5]], tax: "grocery", nb: 0, tags: ["vegan", "gluten-free"] },
    { name: "Roma Tomatoes", emoji: "🍅", sub: "Vegetables", price: 99, unit: "lb", sizes: [[1, 1]], tax: "grocery", nb: 0, weight: true, tags: ["vegan", "gluten-free"] },
    { name: "Broccoli Crowns", emoji: "🥦", sub: "Vegetables", price: 149, unit: "lb", sizes: [[1, 1]], tax: "grocery", nb: 0, weight: true, tags: ["vegan", "gluten-free", "keto"] },
    { name: "Mushrooms", emoji: "🍄", sub: "Vegetables", price: 199, unit: "oz", sizes: [[8, 1], [16, 1.8]], varieties: ["White", "Baby Bella", "Sliced White"], tax: "grocery", nb: 1, tags: ["vegan", "gluten-free", "keto"] },
    { name: "Bell Peppers", emoji: "🫑", sub: "Vegetables", price: 99, unit: "ct", sizes: [[1, 1], [3, 2.6]], varieties: ["Red", "Green", "Yellow"], tax: "grocery", nb: 0, tags: ["vegan", "gluten-free", "keto"] },
    { name: "Romaine Hearts", emoji: "🥬", sub: "Salads", price: 399, unit: "ct", sizes: [[3, 1]], tax: "grocery", nb: 1, tags: ["vegan", "gluten-free", "keto"] },
    { name: "Baby Spinach", emoji: "🥬", sub: "Salads", price: 299, unit: "oz", sizes: [[5, 1], [10, 1.7]], varieties: ["Fresh", "Organic"], tax: "grocery", nb: 1, tags: ["vegan", "gluten-free", "keto"] },
    { name: "Salad Kit", emoji: "🥗", sub: "Salads", price: 349, unit: "oz", sizes: [[9, 1], [12, 1.3]], varieties: ["Caesar", "Garden", "Southwest", "Spinach & Cranberry", "Asian Sesame"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Fresh Herbs", emoji: "🌿", sub: "Herbs", price: 199, unit: "oz", sizes: [[0.75, 1]], varieties: ["Fresh Basil", "Fresh Cilantro", "Fresh Parsley", "Fresh Mint", "Fresh Thyme", "Fresh Rosemary"], vpos: "replace", tax: "grocery", nb: 1, tags: ["vegan", "gluten-free", "keto"] },
  ],
  "meat-seafood": [
    { name: "Ground Beef", emoji: "🥩", sub: "Beef", price: 599, unit: "lb", sizes: [[1, 1], [2, 1.9], [3, 2.7]], varieties: ["80/20", "85/15", "93/7"], vpos: "suffix", tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Ribeye Steak", emoji: "🥩", sub: "Beef", price: 1499, unit: "lb", sizes: [[1, 1], [2, 1.9]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Chuck Roast", emoji: "🥩", sub: "Beef", price: 899, unit: "lb", sizes: [[2.5, 1]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Boneless Chicken Breast", emoji: "🍗", sub: "Chicken", price: 799, unit: "lb", sizes: [[2, 1], [3, 1.45]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Chicken Thighs", emoji: "🍗", sub: "Chicken", price: 549, unit: "lb", sizes: [[2, 1], [4, 1.85]], varieties: ["Bone-In", "Boneless"], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Whole Chicken", emoji: "🐔", sub: "Chicken", price: 699, unit: "lb", sizes: [[4, 1]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Chicken Wings", emoji: "🍗", sub: "Chicken", price: 899, unit: "lb", sizes: [[2, 1], [4, 1.9]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Pork Chops", emoji: "🥓", sub: "Pork", price: 649, unit: "lb", sizes: [[1.5, 1], [3, 1.9]], varieties: ["Bone-In", "Boneless"], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Sliced Bacon", emoji: "🥓", sub: "Pork", price: 599, unit: "oz", sizes: [[12, 1], [16, 1.3]], varieties: ["Hickory Smoked", "Thick Cut", "Applewood"], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Breakfast Sausage", emoji: "🌭", sub: "Pork", price: 449, unit: "oz", sizes: [[12, 1]], varieties: ["Original", "Maple", "Spicy"], tax: "grocery", nb: 1 },
    { name: "Atlantic Salmon Fillet", emoji: "🐟", sub: "Seafood", price: 1099, unit: "lb", sizes: [[1, 1], [2, 1.9]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Large Raw Shrimp", emoji: "🍤", sub: "Seafood", price: 899, unit: "lb", sizes: [[1, 1], [2, 1.85]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Tilapia Fillets", emoji: "🐟", sub: "Seafood", price: 799, unit: "lb", sizes: [[1, 1]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Turkey Breast", emoji: "🦃", sub: "Turkey", price: 699, unit: "lb", sizes: [[2, 1]], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
  ],
  "dairy-eggs": [
    { name: "Milk", emoji: "🥛", sub: "Milk", price: 329, unit: "gal", sizes: [[0.5, 0.62], [1, 1]], varieties: ["Whole", "2% Reduced Fat", "1% Low Fat", "Skim"], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian"] },
    { name: "Oat Milk", emoji: "🥛", sub: "Milk", price: 399, unit: "fl oz", sizes: [[64, 1]], varieties: ["Original", "Vanilla", "Unsweetened", "Barista"], tax: "grocery", nb: 1, tags: ["vegan", "dairy-free", "vegetarian"] },
    { name: "Almond Milk", emoji: "🥛", sub: "Milk", price: 349, unit: "fl oz", sizes: [[64, 1]], varieties: ["Original", "Vanilla", "Unsweetened"], tax: "grocery", nb: 1, tags: ["vegan", "dairy-free", "vegetarian", "keto"] },
    { name: "Large Eggs", emoji: "🥚", sub: "Eggs", price: 349, unit: "ct", sizes: [[12, 1], [18, 1.45], [24, 1.9]], varieties: ["Grade A", "Cage-Free", "Organic"], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian", "keto"] },
    { name: "Butter", emoji: "🧈", sub: "Butter", price: 449, unit: "oz", sizes: [[16, 1], [32, 1.8]], varieties: ["Salted", "Unsalted", "Spreadable"], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian", "keto"] },
    { name: "Shredded Cheese", emoji: "🧀", sub: "Cheese", price: 349, unit: "oz", sizes: [[8, 1], [16, 1.8]], varieties: ["Cheddar", "Mozzarella", "Mexican Blend", "Parmesan", "Colby Jack"], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian", "keto"] },
    { name: "Sliced Cheese", emoji: "🧀", sub: "Cheese", price: 329, unit: "oz", sizes: [[8, 1], [12, 1.4]], varieties: ["Cheddar", "Swiss", "Provolone", "American", "Pepper Jack"], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian", "keto"] },
    { name: "Cream Cheese", emoji: "🧀", sub: "Cheese", price: 249, unit: "oz", sizes: [[8, 1], [16, 1.8]], varieties: ["Original", "Chive & Onion", "Strawberry"], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian"] },
    { name: "Greek Yogurt", emoji: "🥣", sub: "Yogurt", price: 549, unit: "oz", sizes: [[16, 1], [32, 1.8]], varieties: ["Plain", ...V], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian"] },
    { name: "Lowfat Yogurt Cups", emoji: "🥣", sub: "Yogurt", price: 99, unit: "oz", sizes: [[6, 1], [24, 3.4]], varieties: V, tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian"] },
    { name: "Sour Cream", emoji: "🥣", sub: "Cream", price: 229, unit: "oz", sizes: [[16, 1], [24, 1.4]], varieties: ["Regular", "Light"], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian"] },
    { name: "Heavy Whipping Cream", emoji: "🥛", sub: "Cream", price: 399, unit: "fl oz", sizes: [[16, 1], [32, 1.8]], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian", "keto"] },
    { name: "Coffee Creamer", emoji: "☕", sub: "Cream", price: 349, unit: "fl oz", sizes: [[32, 1]], varieties: ["French Vanilla", "Hazelnut", "Caramel", "Original"], tax: "grocery", nb: 1, tags: ["gluten-free", "vegetarian"] },
  ],
  deli: [
    { name: "Rotisserie Chicken", emoji: "🍗", sub: "Hot Foods", price: 699, unit: "each", sizes: [[1, 1]], tax: "prepared-food", nb: 0, noSnap: true },
    { name: "Deli Sandwich", emoji: "🥪", sub: "Sandwiches", price: 549, unit: "each", sizes: [[1, 1]], varieties: ["Turkey & Swiss", "Ham & Cheddar", "Italian Sub", "Chicken Caesar Wrap", "Veggie Wrap"], tax: "prepared-food", nb: 0, noSnap: true },
    { name: "Sliced Turkey Breast", emoji: "🥪", sub: "Lunch Meat", price: 599, unit: "oz", sizes: [[8, 1], [16, 1.8]], varieties: ["Oven Roasted", "Honey", "Smoked"], tax: "grocery", nb: 1, tags: ["gluten-free"] },
    { name: "Sliced Ham", emoji: "🥪", sub: "Lunch Meat", price: 549, unit: "oz", sizes: [[8, 1], [16, 1.8]], varieties: ["Black Forest", "Honey", "Virginia"], tax: "grocery", nb: 1, tags: ["gluten-free"] },
    { name: "Hummus", emoji: "🫘", sub: "Dips & Spreads", price: 349, unit: "oz", sizes: [[10, 1], [17, 1.6]], varieties: ["Classic", "Roasted Red Pepper", "Garlic", "Everything"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Fresh Salsa", emoji: "🍅", sub: "Dips & Spreads", price: 399, unit: "oz", sizes: [[16, 1]], varieties: ["Mild", "Medium", "Hot", "Pico de Gallo"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Guacamole", emoji: "🥑", sub: "Dips & Spreads", price: 449, unit: "oz", sizes: [[8, 1], [16, 1.8]], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free", "keto"] },
    { name: "Fresh Pizza", emoji: "🍕", sub: "Hot Foods", price: 799, unit: "each", sizes: [[1, 1]], varieties: ["Pepperoni", "Margherita", "Supreme", "Four Cheese"], tax: "prepared-food", nb: 0, noSnap: true },
    { name: "Pasta Salad", emoji: "🥗", sub: "Prepared Salads", price: 449, unit: "oz", sizes: [[16, 1]], varieties: ["Italian", "Greek", "Ranch Bacon"], tax: "prepared-food", nb: 0 },
  ],
  bakery: [
    { name: "Sandwich Bread", emoji: "🍞", sub: "Bread", price: 199, unit: "oz", sizes: [[20, 1], [24, 1.3]], varieties: ["White", "Whole Wheat", "Multigrain", "Honey Wheat", "Sourdough"], tax: "grocery", nb: 1, tags: ["vegetarian"], options: [{ name: "Slicing", choices: ["Sliced", "Unsliced"], defaultChoice: "Sliced" }] },
    { name: "Hamburger Buns", emoji: "🍔", sub: "Bread", price: 179, unit: "ct", sizes: [[8, 1]], varieties: ["Classic", "Brioche", "Whole Wheat"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Hot Dog Buns", emoji: "🌭", sub: "Bread", price: 169, unit: "ct", sizes: [[8, 1]], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Artisan Baguette", emoji: "🥖", sub: "Bread", price: 249, unit: "each", sizes: [[1, 1]], tax: "grocery", nb: 0, tags: ["vegan", "vegetarian"] },
    { name: "Bagels", emoji: "🥯", sub: "Bagels & Rolls", price: 279, unit: "ct", sizes: [[6, 1]], varieties: ["Plain", "Everything", "Cinnamon Raisin", "Blueberry"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Dinner Rolls", emoji: "🥐", sub: "Bagels & Rolls", price: 249, unit: "ct", sizes: [[12, 1]], varieties: ["Classic", "Hawaiian", "Wheat"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Butter Croissants", emoji: "🥐", sub: "Pastry", price: 449, unit: "ct", sizes: [[6, 1]], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Muffins", emoji: "🧁", sub: "Pastry", price: 449, unit: "ct", sizes: [[4, 1], [6, 1.4]], varieties: ["Blueberry", "Chocolate Chip", "Banana Nut", "Lemon Poppy"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Iced Cinnamon Rolls", emoji: "🥧", sub: "Pastry", price: 399, unit: "ct", sizes: [[5, 1]], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Layer Cake", emoji: "🍰", sub: "Cakes", price: 1299, unit: "each", sizes: [[1, 1]], varieties: ["Vanilla", "Chocolate", "Red Velvet", "Carrot"], tax: "grocery", nb: 0, tags: ["vegetarian"] },
    { name: "Cookies", emoji: "🍪", sub: "Cookies", price: 449, unit: "ct", sizes: [[12, 1]], varieties: ["Chocolate Chip", "Oatmeal Raisin", "Sugar", "Double Chocolate"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
  ],
  pantry: [
    { name: "Pasta", emoji: "🍝", sub: "Pasta", price: 129, unit: "oz", sizes: [[16, 1], [32, 1.8]], varieties: ["Spaghetti", "Penne", "Rotini", "Fettuccine", "Elbow Macaroni", "Angel Hair"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian"] },
    { name: "Pasta Sauce", emoji: "🍅", sub: "Pasta", price: 179, unit: "oz", sizes: [[24, 1], [45, 1.7]], varieties: ["Marinara", "Tomato Basil", "Garlic & Onion", "Vodka", "Alfredo"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Rice", emoji: "🍚", sub: "Rice & Grains", price: 349, unit: "lb", sizes: [[5, 1], [10, 1.8]], varieties: ["White", "Brown", "Jasmine", "Basmati"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Rolled Oats", emoji: "🥣", sub: "Rice & Grains", price: 449, unit: "oz", sizes: [[42, 1]], varieties: ["Old Fashioned", "Quick", "Steel Cut"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian"] },
    { name: "Cereal", emoji: "🥣", sub: "Breakfast", price: 349, unit: "oz", sizes: [[12, 1], [18, 1.35]], varieties: ["Honey Oat Rings", "Frosted Flakes", "Cocoa Puffs", "Bran Flakes", "Fruity Loops", "Toasted Oat Squares", "Granola Clusters"], tax: "grocery", nb: 2, tags: ["vegetarian"] },
    { name: "Pancake Mix", emoji: "🥞", sub: "Breakfast", price: 249, unit: "oz", sizes: [[32, 1]], varieties: ["Buttermilk", "Whole Grain"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Maple Syrup", emoji: "🍯", sub: "Breakfast", price: 599, unit: "fl oz", sizes: [[12, 1], [24, 1.8]], varieties: ["Pure", "Original"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Peanut Butter", emoji: "🥜", sub: "Spreads", price: 249, unit: "oz", sizes: [[16, 1], [40, 2.2]], varieties: ["Creamy", "Crunchy", "Natural"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Jam", emoji: "🍓", sub: "Spreads", price: 229, unit: "oz", sizes: [[18, 1]], varieties: ["Strawberry", "Grape", "Raspberry", "Apricot"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Wildflower Honey", emoji: "🍯", sub: "Spreads", price: 549, unit: "oz", sizes: [[12, 1], [24, 1.8]], tax: "grocery", nb: 1, tags: ["vegetarian", "gluten-free"] },
    { name: "Tomatoes", emoji: "🥫", sub: "Canned Goods", price: 99, unit: "oz", sizes: [[14.5, 1], [28, 1.7]], varieties: ["Diced", "Crushed", "Whole Peeled", "Fire Roasted"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Black Beans", emoji: "🫘", sub: "Canned Goods", price: 89, unit: "oz", sizes: [[15, 1]], varieties: ["Black Beans", "Pinto Beans", "Kidney Beans", "Chickpeas", "Cannellini Beans"], vpos: "replace", tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Soup", emoji: "🍲", sub: "Canned Goods", price: 129, unit: "oz", sizes: [[18.6, 1]], varieties: ["Chicken Noodle", "Tomato", "Cream of Mushroom", "Vegetable Beef", "Broccoli Cheddar"], tax: "grocery", nb: 1 },
    { name: "Canned Tuna", emoji: "🐟", sub: "Canned Goods", price: 109, unit: "oz", sizes: [[5, 1], [12, 2.1]], varieties: ["Chunk Light", "Albacore", "In Oil"], tax: "grocery", nb: 1, tags: ["gluten-free", "keto"] },
    { name: "Extra Virgin Olive Oil", emoji: "🫒", sub: "Oils & Vinegar", price: 899, unit: "fl oz", sizes: [[16.9, 1], [33.8, 1.8]], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free", "keto"] },
    { name: "Oil", emoji: "🛢️", sub: "Oils & Vinegar", price: 449, unit: "fl oz", sizes: [[48, 1]], varieties: ["Vegetable", "Canola"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Flour", emoji: "🌾", sub: "Baking", price: 349, unit: "lb", sizes: [[5, 1], [10, 1.8]], varieties: ["All-Purpose", "Bread", "Whole Wheat"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian"] },
    { name: "Sugar", emoji: "🍚", sub: "Baking", price: 349, unit: "lb", sizes: [[4, 1]], varieties: ["Granulated", "Brown", "Powdered"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Chocolate Chips", emoji: "🍫", sub: "Baking", price: 349, unit: "oz", sizes: [[12, 1]], varieties: ["Semi-Sweet", "Milk Chocolate", "Dark"], tax: "grocery", nb: 1, tags: ["vegetarian", "gluten-free"] },
    { name: "Ground Cinnamon", emoji: "🧂", sub: "Spices", price: 199, unit: "oz", sizes: [[2.5, 1]], varieties: ["Ground Cinnamon", "Black Pepper", "Garlic Powder", "Paprika", "Ground Cumin", "Chili Powder", "Oregano", "Onion Powder"], vpos: "replace", tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free", "keto"] },
    { name: "Ketchup", emoji: "🍅", sub: "Condiments", price: 199, unit: "oz", sizes: [[20, 1], [32, 1.5]], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Mayonnaise", emoji: "🥫", sub: "Condiments", price: 349, unit: "oz", sizes: [[30, 1]], varieties: ["Real", "Light", "Olive Oil"], tax: "grocery", nb: 1, tags: ["vegetarian", "gluten-free"] },
    { name: "Salad Dressing", emoji: "🥗", sub: "Condiments", price: 229, unit: "fl oz", sizes: [[16, 1]], varieties: ["Ranch", "Italian", "Caesar", "Balsamic", "Honey Mustard", "Thousand Island"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "BBQ Sauce", emoji: "🍖", sub: "Condiments", price: 199, unit: "oz", sizes: [[18, 1]], varieties: ["Original", "Hickory", "Honey", "Spicy"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian"] },
    { name: "Salsa", emoji: "🌶️", sub: "Condiments", price: 249, unit: "oz", sizes: [[16, 1]], varieties: ["Mild", "Medium", "Hot"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Macaroni & Cheese", emoji: "🧀", sub: "Boxed Meals", price: 99, unit: "oz", sizes: [[7.25, 1], [14.5, 1.8]], varieties: ["Original", "White Cheddar", "Shells"], tax: "grocery", nb: 2, tags: ["vegetarian"] },
  ],
  frozen: [
    { name: "Frozen Pizza", emoji: "🍕", sub: "Pizza", price: 449, unit: "oz", sizes: [[13, 1], [22, 1.6]], varieties: ["Pepperoni", "Cheese", "Supreme", "Margherita", "Sausage", "Hawaiian"], tax: "grocery", nb: 2, tags: ["vegetarian"] },
    { name: "Ice Cream", emoji: "🍦", sub: "Ice Cream", price: 449, unit: "fl oz", sizes: [[48, 1], [96, 1.9]], varieties: ["Vanilla", "Chocolate", "Strawberry", "Mint Chip", "Cookie Dough", "Butter Pecan", "Cookies & Cream"], tax: "grocery", nb: 2, tags: ["gluten-free", "vegetarian"] },
    { name: "Ice Cream Bars", emoji: "🍦", sub: "Ice Cream", price: 399, unit: "ct", sizes: [[6, 1], [12, 1.7]], varieties: ["Vanilla Almond", "Chocolate", "Caramel"], tax: "candy", nb: 1, tags: ["vegetarian"] },
    { name: "Frozen Broccoli", emoji: "🥦", sub: "Vegetables", price: 149, unit: "oz", sizes: [[12, 1], [32, 2.2]], varieties: ["Frozen Broccoli", "Frozen Mixed Vegetables", "Frozen Green Beans", "Frozen Sweet Corn", "Frozen Peas", "Frozen Cauliflower Rice"], vpos: "replace", tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Frozen Berries", emoji: "🫐", sub: "Fruit", price: 449, unit: "oz", sizes: [[16, 1], [48, 2.6]], varieties: ["Frozen Strawberries", "Frozen Mixed Berries", "Frozen Blueberries", "Frozen Mango Chunks"], vpos: "replace", tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Chicken Nuggets", emoji: "🍗", sub: "Meals & Entrees", price: 599, unit: "oz", sizes: [[32, 1]], varieties: ["Classic", "Spicy", "Breast Tenders"], tax: "grocery", nb: 1 },
    { name: "Lasagna", emoji: "🍝", sub: "Meals & Entrees", price: 699, unit: "oz", sizes: [[38, 1]], varieties: ["Beef", "Cheese", "Veggie"], tax: "grocery", nb: 1 },
    { name: "Burritos", emoji: "🌯", sub: "Meals & Entrees", price: 449, unit: "ct", sizes: [[6, 1]], varieties: ["Bean & Cheese", "Beef & Bean", "Chicken"], tax: "grocery", nb: 1 },
    { name: "Fish Sticks", emoji: "🐟", sub: "Meals & Entrees", price: 549, unit: "oz", sizes: [[20, 1]], tax: "grocery", nb: 1 },
    { name: "French Fries", emoji: "🍟", sub: "Potatoes", price: 249, unit: "oz", sizes: [[32, 1]], varieties: ["Crinkle Cut", "Shoestring", "Waffle"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian"] },
    { name: "Waffles", emoji: "🧇", sub: "Breakfast", price: 349, unit: "ct", sizes: [[10, 1]], varieties: ["Homestyle", "Blueberry", "Buttermilk"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Frozen Garlic Bread", emoji: "🥖", sub: "Bread", price: 249, unit: "oz", sizes: [[16, 1]], tax: "grocery", nb: 1, tags: ["vegetarian"] },
  ],
  beverages: [
    { name: "Cola", emoji: "🥤", sub: "Soda", price: 599, unit: "ct", sizes: [[12, 1], [24, 1.8]], varieties: ["Cola", "Diet Cola", "Lemon-Lime Soda", "Root Beer", "Orange Soda", "Ginger Ale"], vpos: "replace", tax: "soft-drink", nb: 2, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Sparkling Water", emoji: "🫧", sub: "Water", price: 499, unit: "ct", sizes: [[12, 1], [24, 1.8]], varieties: ["Lime", "Lemon", "Grapefruit", "Berry", "Plain"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Purified Water", emoji: "💧", sub: "Water", price: 449, unit: "ct", sizes: [[24, 1], [40, 1.6]], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Juice", emoji: "🧃", sub: "Juice", price: 349, unit: "fl oz", sizes: [[52, 1], [89, 1.6]], varieties: ["Orange", "Apple", "Grape", "Cranberry", "Pineapple"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Lemonade", emoji: "🍋", sub: "Juice", price: 249, unit: "fl oz", sizes: [[64, 1]], varieties: ["Lemonade", "Pink Lemonade", "Iced Tea Lemonade"], vpos: "replace", tax: "soft-drink", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Sports Drink", emoji: "🥤", sub: "Sports & Energy", price: 599, unit: "ct", sizes: [[8, 1], [12, 1.4]], varieties: ["Blue Raspberry", "Fruit Punch", "Lemon-Lime", "Orange"], tax: "soft-drink", nb: 2, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Energy Drink", emoji: "⚡", sub: "Sports & Energy", price: 599, unit: "ct", sizes: [[4, 1], [12, 2.6]], varieties: ["Original", "Sugar Free", "Tropical"], tax: "soft-drink", nb: 2, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Ground Coffee", emoji: "☕", sub: "Coffee & Tea", price: 799, unit: "oz", sizes: [[12, 1], [24, 1.8]], varieties: ["Medium Roast", "Dark Roast", "Breakfast Blend", "Decaf", "French Roast"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Coffee Pods", emoji: "☕", sub: "Coffee & Tea", price: 899, unit: "ct", sizes: [[12, 1], [24, 1.8]], varieties: ["Medium Roast", "Dark Roast", "Colombian", "Hazelnut"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Black Tea Bags", emoji: "🍵", sub: "Coffee & Tea", price: 299, unit: "ct", sizes: [[40, 1], [100, 2.2]], varieties: ["English Breakfast Tea", "Green Tea", "Chamomile Tea", "Earl Grey Tea", "Peppermint Tea"], vpos: "replace", tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Iced Tea", emoji: "🧋", sub: "Coffee & Tea", price: 229, unit: "fl oz", sizes: [[64, 1]], varieties: ["Sweet", "Unsweetened", "Peach"], tax: "soft-drink", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
  ],
  snacks: [
    { name: "Potato Chips", emoji: "🥔", sub: "Chips", price: 349, unit: "oz", sizes: [[8, 1], [13, 1.5]], varieties: ["Classic", "Sour Cream & Onion", "BBQ", "Salt & Vinegar", "Kettle Cooked", "Cheddar"], tax: "grocery", nb: 2, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Tortilla Chips", emoji: "🌮", sub: "Chips", price: 299, unit: "oz", sizes: [[11, 1], [16, 1.4]], varieties: ["Restaurant Style", "Lime", "Nacho Cheese", "Multigrain"], tax: "grocery", nb: 2, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Cheese Puffs", emoji: "🧀", sub: "Chips", price: 349, unit: "oz", sizes: [[8, 1]], varieties: ["Crunchy", "Puffed", "Flamin' Hot"], tax: "grocery", nb: 2, tags: ["vegetarian"] },
    { name: "Microwave Popcorn", emoji: "🍿", sub: "Popcorn & Pretzels", price: 399, unit: "ct", sizes: [[6, 1], [12, 1.8]], varieties: ["Butter", "Movie Theater", "Kettle Corn", "Light"], tax: "grocery", nb: 1, tags: ["vegetarian", "gluten-free"] },
    { name: "Pretzels", emoji: "🥨", sub: "Popcorn & Pretzels", price: 249, unit: "oz", sizes: [[16, 1]], varieties: ["Twists", "Sticks", "Rods", "Mini"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian"] },
    { name: "Granola Bars", emoji: "🍫", sub: "Bars", price: 349, unit: "ct", sizes: [[8, 1], [12, 1.4]], varieties: ["Oats & Honey", "Chocolate Chip", "Peanut Butter", "Fruit & Nut", "Cranberry Almond"], tax: "grocery", nb: 2, tags: ["vegetarian"] },
    { name: "Protein Bars", emoji: "💪", sub: "Bars", price: 899, unit: "ct", sizes: [[6, 1], [12, 1.8]], varieties: ["Chocolate", "Cookie Dough", "Peanut Butter", "Vanilla Almond"], tax: "grocery", nb: 2, tags: ["vegetarian", "gluten-free"] },
    { name: "Trail Mix", emoji: "🥜", sub: "Nuts & Seeds", price: 549, unit: "oz", sizes: [[16, 1], [26, 1.6]], varieties: ["Classic", "Fruit & Nut", "Chocolate", "Salted"], tax: "grocery", nb: 1, tags: ["vegetarian", "gluten-free"] },
    { name: "Almonds", emoji: "🥜", sub: "Nuts & Seeds", price: 599, unit: "oz", sizes: [[16, 1], [30, 1.7]], varieties: ["Salted", "Unsalted", "Smoked", "Honey Roasted"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free", "keto"] },
    { name: "Cashews", emoji: "🥜", sub: "Nuts & Seeds", price: 649, unit: "oz", sizes: [[16, 1]], varieties: ["Salted", "Unsalted", "Honey Roasted"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free", "keto"] },
    { name: "Chocolate Bar", emoji: "🍫", sub: "Chocolate & Candy", price: 129, unit: "oz", sizes: [[4, 1], [8, 1.7]], varieties: ["Milk", "Dark", "Almond", "Caramel", "Crisp"], tax: "candy", nb: 2, tags: ["vegetarian", "gluten-free"] },
    { name: "Gummy Candy", emoji: "🍬", sub: "Chocolate & Candy", price: 229, unit: "oz", sizes: [[8, 1], [16, 1.7]], varieties: ["Gummy Bears", "Gummy Worms", "Sour Gummies", "Peach Rings"], vpos: "replace", tax: "candy", nb: 2, tags: ["gluten-free"] },
    { name: "Sandwich Cookies", emoji: "🍪", sub: "Cookies & Crackers", price: 349, unit: "oz", sizes: [[14, 1], [20, 1.4]], varieties: ["Chocolate Creme", "Vanilla Creme", "Double Stuffed", "Mint"], tax: "grocery", nb: 2, tags: ["vegetarian"] },
    { name: "Buttery Crackers", emoji: "🧈", sub: "Cookies & Crackers", price: 299, unit: "oz", sizes: [[13.7, 1], [20, 1.4]], varieties: ["Buttery", "Cheddar", "Wheat", "Sea Salt", "Everything"], tax: "grocery", nb: 2, tags: ["vegetarian"] },
  ],
  household: [
    { name: "Paper Towels", emoji: "🧻", sub: "Paper Goods", price: 899, unit: "ct", sizes: [[6, 1], [12, 1.8]], varieties: ["Select-A-Size", "Full Sheet"], tax: "general", nb: 1, noSnap: true },
    { name: "Bath Tissue", emoji: "🧻", sub: "Paper Goods", price: 899, unit: "ct", sizes: [[12, 1], [24, 1.8]], varieties: ["Ultra Soft", "Strong", "Sensitive"], tax: "general", nb: 1, noSnap: true },
    { name: "Facial Tissue", emoji: "🤧", sub: "Paper Goods", price: 299, unit: "ct", sizes: [[3, 1], [6, 1.8]], tax: "general", nb: 1, noSnap: true },
    { name: "Paper Plates", emoji: "🍽️", sub: "Paper Goods", price: 399, unit: "ct", sizes: [[50, 1], [100, 1.7]], tax: "general", nb: 1, noSnap: true },
    { name: "Laundry Detergent", emoji: "🧺", sub: "Laundry", price: 1199, unit: "fl oz", sizes: [[64, 1], [100, 1.5]], varieties: ["Fresh Scent", "Unscented", "Lavender", "Sport"], tax: "general", nb: 1, noSnap: true },
    { name: "Laundry Pods", emoji: "🧺", sub: "Laundry", price: 1399, unit: "ct", sizes: [[42, 1], [81, 1.7]], varieties: ["Fresh Scent", "Lavender", "Free & Clear"], tax: "general", nb: 1, noSnap: true },
    { name: "Fabric Softener Sheets", emoji: "🧺", sub: "Laundry", price: 499, unit: "ct", sizes: [[120, 1], [240, 1.8]], tax: "general", nb: 1, noSnap: true },
    { name: "Dish Soap", emoji: "🧼", sub: "Cleaning", price: 249, unit: "fl oz", sizes: [[24, 1], [38, 1.5]], varieties: ["Lemon", "Fresh Rain", "Unscented"], tax: "general", nb: 1, noSnap: true },
    { name: "Dishwasher Pods", emoji: "🧼", sub: "Cleaning", price: 1099, unit: "ct", sizes: [[45, 1], [90, 1.8]], tax: "general", nb: 1, noSnap: true },
    { name: "All-Purpose Cleaner", emoji: "🧽", sub: "Cleaning", price: 299, unit: "fl oz", sizes: [[32, 1]], varieties: ["Lemon", "Lavender", "Fresh Linen"], tax: "general", nb: 1, noSnap: true },
    { name: "Disinfecting Wipes", emoji: "🧽", sub: "Cleaning", price: 449, unit: "ct", sizes: [[75, 1], [150, 1.8]], varieties: ["Citrus", "Fresh"], tax: "general", nb: 1, noSnap: true },
    { name: "Trash Bags", emoji: "🗑️", sub: "Storage & Trash", price: 899, unit: "ct", sizes: [[30, 1], [45, 1.4]], tax: "general", nb: 1, noSnap: true, options: [{ name: "Scent", choices: ["Unscented", "Lemon Fresh"], defaultChoice: "Unscented" }] },
    { name: "Aluminum Foil", emoji: "🎞️", sub: "Storage & Trash", price: 449, unit: "each", sizes: [[1, 1]], tax: "general", nb: 1, noSnap: true },
    { name: "Zip Storage Bags", emoji: "🛍️", sub: "Storage & Trash", price: 399, unit: "ct", sizes: [[40, 1], [90, 1.9]], varieties: ["Sandwich", "Gallon", "Quart"], tax: "general", nb: 1, noSnap: true },
    { name: "LED Light Bulbs", emoji: "💡", sub: "Home Essentials", price: 799, unit: "pk", sizes: [[4, 1]], varieties: ["Soft White", "Daylight"], tax: "general", nb: 1, noSnap: true },
  ],
  "health-beauty": [
    { name: "Shampoo", emoji: "🧴", sub: "Hair Care", price: 449, unit: "fl oz", sizes: [[12.6, 1], [25.4, 1.7]], varieties: ["Moisture", "Volume", "Anti-Dandruff", "Color Care"], tax: "general", nb: 1, noSnap: true },
    { name: "Conditioner", emoji: "🧴", sub: "Hair Care", price: 449, unit: "fl oz", sizes: [[12.6, 1]], varieties: ["Moisture", "Volume", "Repair"], tax: "general", nb: 1, noSnap: true },
    { name: "Body Wash", emoji: "🧼", sub: "Bath & Body", price: 549, unit: "fl oz", sizes: [[18, 1]], varieties: ["Lavender", "Fresh", "Sensitive", "Coconut"], tax: "general", nb: 1, noSnap: true },
    { name: "Bar Soap", emoji: "🧼", sub: "Bath & Body", price: 549, unit: "ct", sizes: [[6, 1], [12, 1.8]], varieties: ["Original", "Moisturizing", "Fresh"], tax: "general", nb: 1, noSnap: true },
    { name: "Toothpaste", emoji: "🪥", sub: "Oral Care", price: 349, unit: "oz", sizes: [[4.8, 1], [7.6, 1.5]], varieties: ["Cavity Protection", "Whitening", "Sensitive", "Fresh Mint"], tax: "general", nb: 1, noSnap: true },
    { name: "Soft Toothbrush", emoji: "🪥", sub: "Oral Care", price: 449, unit: "ct", sizes: [[4, 1]], tax: "general", nb: 1, noSnap: true },
    { name: "Mouthwash", emoji: "🫧", sub: "Oral Care", price: 449, unit: "fl oz", sizes: [[33.8, 1]], varieties: ["Mint", "Alcohol Free"], tax: "general", nb: 1, noSnap: true },
    { name: "Deodorant", emoji: "🧴", sub: "Bath & Body", price: 399, unit: "oz", sizes: [[2.6, 1]], varieties: ["Fresh", "Sport", "Unscented", "Cool Blue"], tax: "general", nb: 1, noSnap: true },
    { name: "Hand Lotion", emoji: "🧴", sub: "Skin Care", price: 499, unit: "fl oz", sizes: [[16, 1]], varieties: ["Unscented", "Shea", "Cocoa Butter"], tax: "general", nb: 1, noSnap: true },
    { name: "Sunscreen", emoji: "☀️", sub: "Skin Care", price: 899, unit: "fl oz", sizes: [[8, 1]], varieties: ["SPF 30", "SPF 50", "Kids SPF 50"], tax: "general", nb: 1, noSnap: true },
    { name: "Pain Reliever", emoji: "💊", sub: "Medicine", price: 799, unit: "ct", sizes: [[100, 1], [200, 1.7]], varieties: ["Ibuprofen", "Acetaminophen", "Aspirin"], tax: "general", nb: 1, noSnap: true },
    { name: "Allergy Relief", emoji: "💊", sub: "Medicine", price: 1299, unit: "ct", sizes: [[30, 1], [90, 2.4]], tax: "general", nb: 1, noSnap: true },
    { name: "Adhesive Bandages", emoji: "🩹", sub: "First Aid", price: 349, unit: "ct", sizes: [[100, 1]], tax: "general", nb: 1, noSnap: true },
  ],
  baby: [
    { name: "Baby Diapers", emoji: "👶", sub: "Diapers & Wipes", price: 2499, unit: "ct", sizes: [[72, 1], [144, 1.85]], varieties: ["Size 1", "Size 2", "Size 3", "Size 4", "Size 5"], tax: "general", nb: 1, noSnap: true },
    { name: "Baby Wipes", emoji: "🧻", sub: "Diapers & Wipes", price: 499, unit: "ct", sizes: [[80, 1], [320, 3.4]], varieties: ["Sensitive", "Unscented", "Aloe"], tax: "general", nb: 1, noSnap: true },
    { name: "Infant Formula", emoji: "🍼", sub: "Formula & Food", price: 2999, unit: "oz", sizes: [[20, 1], [30.8, 1.45]], varieties: ["Milk-Based", "Sensitive", "Soy"], tax: "grocery", nb: 1 },
    { name: "Baby Food Pouches", emoji: "🍼", sub: "Formula & Food", price: 149, unit: "oz", sizes: [[3.5, 1], [16, 3.9]], varieties: ["Apple & Sweet Potato", "Pear & Peach", "Banana & Blueberry", "Carrot & Pea"], tax: "grocery", nb: 1, tags: ["vegan", "vegetarian", "gluten-free"] },
    { name: "Baby Cereal", emoji: "🥣", sub: "Formula & Food", price: 349, unit: "oz", sizes: [[8, 1]], varieties: ["Oatmeal", "Rice", "Multigrain"], tax: "grocery", nb: 1, tags: ["vegetarian"] },
    { name: "Baby Shampoo & Wash", emoji: "🛁", sub: "Bath & Care", price: 599, unit: "fl oz", sizes: [[20, 1]], tax: "general", nb: 1, noSnap: true },
    { name: "Diaper Rash Cream", emoji: "🧴", sub: "Bath & Care", price: 699, unit: "oz", sizes: [[4, 1]], tax: "general", nb: 1, noSnap: true },
  ],
  pet: [
    { name: "Dry Dog Food", emoji: "🐶", sub: "Dog", price: 1799, unit: "lb", sizes: [[15, 1], [30, 1.8]], varieties: ["Chicken & Rice", "Beef & Vegetable", "Lamb & Oats", "Grain Free"], tax: "general", nb: 1, noSnap: true },
    { name: "Wet Dog Food", emoji: "🥫", sub: "Dog", price: 129, unit: "oz", sizes: [[13.2, 1]], varieties: ["Beef Stew", "Chicken Pate", "Turkey & Gravy"], tax: "general", nb: 1, noSnap: true },
    { name: "Dog Treats", emoji: "🦴", sub: "Dog", price: 449, unit: "oz", sizes: [[16, 1]], varieties: ["Biscuits", "Jerky", "Dental Chews"], tax: "general", nb: 1, noSnap: true },
    { name: "Dry Cat Food", emoji: "🐱", sub: "Cat", price: 1299, unit: "lb", sizes: [[7, 1], [16, 1.9]], varieties: ["Chicken", "Salmon", "Indoor", "Kitten"], tax: "general", nb: 1, noSnap: true },
    { name: "Wet Cat Food", emoji: "🐟", sub: "Cat", price: 79, unit: "oz", sizes: [[3, 1]], varieties: ["Tuna", "Chicken", "Salmon Pate", "Turkey"], tax: "general", nb: 1, noSnap: true },
    { name: "Clumping Cat Litter", emoji: "🐈", sub: "Cat", price: 1099, unit: "lb", sizes: [[14, 1], [28, 1.8]], varieties: ["Unscented", "Lavender"], tax: "general", nb: 1, noSnap: true },
  ],
};
