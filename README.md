[data.js](https://github.com/user-attachments/files/26426552/data.js)
// Static content for the interactive prototype (prices + recommendations are simulated).
// Kept in a separate file so `app.js` can focus on state + interactions.

window.SMARTPLAN_DATA = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  mealTypes: ["Breakfast", "Lunch", "Dinner"],
  cuisines: ["Italian", "Mexican", "Asian", "Mediterranean", "American"],
  dietaryChips: ["Vegetarian", "Gluten-Free", "Halal", "Vegan"],
  cookTimeWindows: ["Any", "Morning", "Afternoon", "Evening"],
  restaurants: [
    { name: "Mama's Tacos", vibe: "Mexican", baseItem: "Bean & Cheese Burrito" },
    { name: "Green Eats", vibe: "Mediterranean", baseItem: "15% Off Total Salad Bowl" },
    { name: "Pasta House", vibe: "Italian", baseItem: "Garlic Herb Pasta" },
    { name: "Sakura Noodles", vibe: "Asian", baseItem: "Teriyaki Chicken Bowl" },
    { name: "Urban Deli", vibe: "American", baseItem: "Turkey & Avocado Sandwich" },
  ],
  recipeTemplates: [
    {
      name: "Sheet-Pan Chicken & Veggies",
      kind: "Cook",
      tags: ["Halal"],
      steps: [
        "Preheat oven to 425°F (220°C).",
        "Toss chicken and chopped veggies with olive oil, salt, and pepper.",
        "Roast 20–25 minutes until chicken is cooked through. Serve hot.",
      ],
      ingredients: [
        { item: "Chicken", qty: "1 lb" },
        { item: "Bell peppers", qty: "2" },
        { item: "Zucchini", qty: "1" },
        { item: "Olive oil", qty: "1 tbsp" },
      ],
      calories: 650,
      baseCost: 6.5,
    },
    {
      name: "Lemon Herb Chickpea Bowl",
      kind: "Cook",
      tags: ["Vegetarian", "Vegan", "Gluten-Free"],
      steps: [
        "Rinse chickpeas and warm them in a pan with a splash of water.",
        "Mix lemon juice, olive oil, and seasonings into a quick dressing.",
        "Assemble with cucumber and dressing. Serve immediately.",
      ],
      ingredients: [
        { item: "Chickpeas", qty: "1 can" },
        { item: "Lemon", qty: "1" },
        { item: "Cucumber", qty: "1" },
        { item: "Olive oil", qty: "1 tbsp" },
      ],
      calories: 620,
      baseCost: 4.8,
    },
    {
      name: "Gluten-Free Veggie Stir-Fry",
      kind: "Cook",
      tags: ["Gluten-Free", "Vegetarian", "Vegan"],
      steps: [
        "Slice vegetables and press tofu to remove excess moisture.",
        "Stir-fry vegetables, then add tofu and sauce until coated.",
        "Finish with sesame oil and serve hot.",
      ],
      ingredients: [
        { item: "Mixed vegetables", qty: "4 cups" },
        { item: "Tofu", qty: "8 oz" },
        { item: "Soy sauce", qty: "2 tbsp" },
        { item: "Sesame oil", qty: "1 tsp" },
      ],
      calories: 600,
      baseCost: 5.2,
    },
    {
      name: "Quick Turkey Chili (No-fuss)",
      kind: "Cook",
      tags: ["Halal"],
      steps: [
        "Brown ground turkey in a pot, then add onion until fragrant.",
        "Stir in beans and tomatoes. Simmer 15–20 minutes.",
        "Taste and adjust seasoning. Serve as a bowl meal.",
      ],
      ingredients: [
        { item: "Ground turkey", qty: "1 lb" },
        { item: "Beans", qty: "1 can" },
        { item: "Tomatoes", qty: "1 can" },
        { item: "Onion", qty: "1" },
      ],
      calories: 720,
      baseCost: 6.9,
    },
  ],
  // Prototype deals; the UI allows stacking them.
  deals: [
    {
      id: "freeDelivery",
      name: "Free delivery with Grubhub+",
      desc: "Avoid delivery fees on qualifying orders.",
      discountType: "feeAvoid",
      value: 3.99,
      requiresPlus: true,
    },
    {
      id: "15off",
      name: "$15 Off $40+",
      desc: "Apply when your cart meets the threshold (simulated).",
      discountType: "percent",
      value: 0.15,
      requiresPlus: true,
      minSubtotal: 40,
    },
    {
      id: "pickupCredit",
      name: "Pickup credits available",
      desc: "Extra savings when you switch to pickup.",
      discountType: "fixed",
      value: 2.0,
      requiresPlus: false,
    },
    {
      id: "promoStack",
      name: "Promo stack (student day)",
      desc: "A light gamified promo that stacks with deals.",
      discountType: "fixed",
      value: 1.0,
      requiresPlus: false,
    },
  ],
};

