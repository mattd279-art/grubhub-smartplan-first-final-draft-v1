(function () {
  const LS_KEY = "smartplan_prototype_state_v1";
  const { days, mealTypes, dietaryChips, cookTimeWindows, restaurants, recipeTemplates, deals } =
    window.SMARTPLAN_DATA;

  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const fmtMoney = (n) => {
    const v = Number(n) || 0;
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
  };
  const fmtMoneyPlain = (n) => {
    const v = Number(n) || 0;
    return v.toFixed(2);
  };

  // Deterministic pseudo-random from a string (so "random" is stable per user/profile/day).
  const seedFrom = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const seeded = (seedStr, salt = "") => seedFrom(seedStr + "|" + salt);

  const defaultPreferences = () => ({
    calorieGoal: 1800,
    weeklyBudget: 50,
    mealsPerDay: 3,
    cookTimesPerWeek: 3,
    cookTimeWindow: "Any",
    dietaryRestrictions: [],
    allergies: "",
    cuisines: [],
  });

  const createDefaultState = () => ({
    currentProfileId: "m1",
    profiles: [
      { id: "m1", name: "Riley", role: "Student", preferences: defaultPreferences() },
      { id: "m2", name: "Josh", role: "Roommate", preferences: defaultPreferences() },
      { id: "m3", name: "Mom", role: "Parent", preferences: defaultPreferences() },
    ],
    sharedCredits: 240,
    grubhubPlusEnabled: true,
    plan: null, // { generatedAt, mealsByDay: {Mon:[meal,...],...}, groceryItems: [...] }
    selectedDayForCheckout: "Mon",
    fulfillmentForEstimate: "delivery", // affects dashboard budget progress estimate
    dealsSelected: deals.map((d) => d.id === "freeDelivery" || d.id === "15off" || d.id === "promoStack"),
    assistantMessages: [],
    week: {
      weekSpendEstimate: 0,
      weekSavingsEstimate: 0,
      streakDays: 0,
      monthSpendEstimate: 0,
    },
  });

  const loadState = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  let state = loadState() || createDefaultState();

  function persistState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  // -------------------------
  // Routing
  // -------------------------
  const ROUTES = ["onboarding", "dashboard", "checkout", "deals", "family"];
  function getRouteFromHash() {
    const h = (location.hash || "").replace("#", "").trim();
    if (!h) return "onboarding";
    return ROUTES.includes(h) ? h : "onboarding";
  }

  function navigate(route) {
    location.hash = "#" + route;
  }

  function setActiveView(route) {
    ROUTES.forEach((r) => {
      const v = $("view-" + r);
      if (!v) return;
      v.classList.toggle("hidden", r !== route);
    });
  }

  // -------------------------
  // Assistant messages
  // -------------------------
  function nowTimeLabel() {
    const d = new Date();
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function addAssistantMessage(text, role = "Student Support AI") {
    state.assistantMessages.push({
      id: Math.random().toString(16).slice(2),
      role,
      text,
      time: nowTimeLabel(),
    });
    if (state.assistantMessages.length > 18) state.assistantMessages.splice(0, state.assistantMessages.length - 18);
    persistState();
    renderAssistant();
  }

  function renderAssistant() {
    const box = $("assistantMessages");
    box.innerHTML = "";
    (state.assistantMessages || []).slice().reverse().forEach((m) => {
      const node = document.createElement("div");
      node.className = "msg kind-ai";
      node.innerHTML = `
        <div class="msg-head">
          <div class="msg-role">${m.role}</div>
          <div class="msg-time">${m.time}</div>
        </div>
        <div class="msg-text">${escapeHtml(m.text)}</div>
      `;
      box.appendChild(node);
    });

    $("gameSavings").textContent = fmtMoney(state.week.weekSavingsEstimate || 0);
    $("gameStreak").textContent = `${state.week.streakDays || 0} days`;
    const progressPct = state.plan && state.plan.weekBudget ? Math.round(((state.week.weekSpendEstimate || 0) / state.plan.weekBudget) * 100) : 0;
    $("gameProgress").textContent = `${clamp(progressPct, 0, 999)}%`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -------------------------
  // Chips & inputs
  // -------------------------
  function initChips(chipsRootId, modelKey) {
    const root = $(chipsRootId);
    root.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.getAttribute("data-chip");
        const profile = getCurrentProfile();
        const prefs = profile.preferences;
        if (!prefs[modelKey]) prefs[modelKey] = [];
        const idx = prefs[modelKey].indexOf(value);
        if (idx >= 0) {
          prefs[modelKey].splice(idx, 1);
          btn.classList.remove("active");
        } else {
          prefs[modelKey].push(value);
          btn.classList.add("active");
        }
        persistState();
      });
    });
  }

  function setChipActive(rootId, valueArr, chipKey) {
    const root = $(rootId);
    root.querySelectorAll(".chip").forEach((btn) => {
      const v = btn.getAttribute("data-chip");
      btn.classList.toggle("active", (valueArr || []).includes(v));
    });
  }

  // -------------------------
  // Profile
  // -------------------------
  function getCurrentProfile() {
    return state.profiles.find((p) => p.id === state.currentProfileId) || state.profiles[0];
  }

  function setCurrentProfile(profileId) {
    state.currentProfileId = profileId;
    persistState();
    syncProfileSelects();
    loadPreferencesIntoOnboardingInputs();
    renderFamilySnapshot();
    renderFamilyMemberList();
  }

  function syncProfileSelects() {
    // Onboarding profile select
    if ($("profileSelect")) {
      $("profileSelect").value = state.currentProfileId;
    }
    // Family profile switch
    if ($("familyProfileSwitch")) {
      $("familyProfileSwitch").value = state.currentProfileId;
    }
  }

  // -------------------------
  // Plan generation + rendering
  // -------------------------
  function mealsForUi(prefsMealsPerDay) {
    // Prototype supports 2-3 meal display cleanly; 4 collapses to 3 for layout.
    if (Number(prefsMealsPerDay) <= 2) return ["Breakfast", "Dinner"];
    return ["Breakfast", "Lunch", "Dinner"];
  }

  function chooseCuisine(prefs) {
    const preferred = prefs.cuisines && prefs.cuisines.length ? prefs.cuisines : ["Italian", "Mexican"];
    const t = seeded(prefs.allergies + prefs.weeklyBudget, "cuisine");
    return preferred[Math.floor(t * preferred.length)] || preferred[0];
  }

  function pickRecipeFor(prefs, seedStr) {
    const restrictions = new Set(prefs.dietaryRestrictions || []);
    const allergy = (prefs.allergies || "").trim();
    const filtered = recipeTemplates.filter((rt) => {
      if (!restrictions.size) return true;
      // Keep recipes that match at least one dietary restriction tag.
      const tags = new Set(rt.tags || []);
      for (const r of restrictions) {
        if (tags.has(r)) return true;
      }
      return false;
    });

    const pool = filtered.length ? filtered : recipeTemplates;
    const t = seeded(seedStr, allergy || "noallergy");
    return pool[Math.floor(t * pool.length)] || pool[0];
  }

  function pickRestaurant(prefs, seedStr) {
    const cuisine = chooseCuisine(prefs);
    const pool = restaurants.filter((r) => (r.vibe || "").toLowerCase() === cuisine.toLowerCase());
    const list = pool.length ? pool : restaurants;
    const t = seeded(seedStr, cuisine);
    return list[Math.floor(t * list.length)] || list[0];
  }

  function buildMeal(prefs, dayLabel, mealType, mealIndex, dinnersCookedSet) {
    const baseSeed = `${state.currentProfileId}|${dayLabel}|${mealType}|${mealIndex}`;
    const hasDinnerCookChoice = mealType === "Dinner";
    const wantCook = hasDinnerCookChoice && dinnersCookedSet.has(dayLabel);

    if (wantCook) {
      const recipe = pickRecipeFor(prefs, baseSeed);
      const calorieJitter = lerp(-35, 35, seeded(baseSeed, "cal"));
      const cookedCalories = Math.round(recipe.calories + calorieJitter);

      const costFactor = lerp(0.9, 1.15, seeded(baseSeed, "cookCost"));
      const cookCost = Math.round(recipe.baseCost * costFactor * 100) / 100;

      return {
        day: dayLabel,
        mealType,
        kind: "Cook",
        name: recipe.name,
        calories: cookedCalories,
        cost: {
          cookCost,
          orderDeliveryCost: null,
          orderPickupCost: null,
        },
        recipeIngredients: recipe.ingredients || [],
        recipeSteps: recipe.steps || [],
        meta: {
          cookTimeWindow: prefs.cookTimeWindow || "Any",
        },
      };
    }

    // Order mode
    const rest = pickRestaurant(prefs, baseSeed);
    const t = seeded(baseSeed, "orderPrice");
    const baseItemPrice = lerp(10.0, 16.0, t);
    const deliveryFee = 3.99;
    const serviceFee = Math.round(baseItemPrice * 0.18 * 100) / 100; // simulated
    const pickupCost = Math.round(baseItemPrice * lerp(0.93, 1.02, seeded(baseSeed, "pickup"))) * 1;

    const deliverySubtotal = Math.round((baseItemPrice + serviceFee + deliveryFee) * 100) / 100;
    const orderPickupCost = Math.round((baseItemPrice + serviceFee * 0.35) * 100) / 100;

    const calorieJitter = lerp(-120, 120, seeded(baseSeed, "cal2"));
    const orderedCalories = Math.round(650 + calorieJitter);

    const estItemName = (() => {
      const allergy = (prefs.allergies || "").trim();
      if (allergy) return `${rest.baseItem} (customized)`;
      return rest.baseItem;
    })();

    return {
      day: dayLabel,
      mealType,
      kind: "Order",
      name: estItemName,
      calories: orderedCalories,
      cost: {
        cookCost: null,
        orderDeliveryCost: deliverySubtotal,
        orderPickupCost,
      },
      meta: {
        restaurant: rest.name,
      },
    };
  }

  function generatePlanFromPreferences() {
    const profile = getCurrentProfile();
    const prefs = profile.preferences;

    const weekBudget = Number(prefs.weeklyBudget) || 0;
    const dinnersCookCount = clamp(Number(prefs.cookTimesPerWeek) || 0, 0, 7);

    // Deterministically select which dinner days are cooked.
    const sortedDays = days.slice();
    const salt = state.currentProfileId + "|" + String(prefs.calorieGoal);
    sortedDays.sort((a, b) => seeded(salt, a) - seeded(salt, b));
    const dinnersCookedDays = new Set(sortedDays.slice(0, dinnersCookCount));

    const mealsPerDayUi = mealsForUi(prefs.mealsPerDay);
    const mealsByDay = {};
    const groceryAgg = new Map(); // name -> {item, qty, entries}

    let cookingMeals = 0;
    let orderingMeals = 0;

    let mealIndex = 0;
    days.forEach((d) => {
      mealsByDay[d] = [];
      mealsPerDayUi.forEach((mType) => {
        const meal = buildMeal(prefs, d, mType, mealIndex, dinnersCookedDays);
        mealsByDay[d].push(meal);

        if (meal.kind === "Cook") {
          cookingMeals++;
          meal.recipeIngredients.forEach((ing) => {
            const key = ing.item;
            const existing = groceryAgg.get(key);
            if (!existing) {
              groceryAgg.set(key, { item: ing.item, qtys: [ing.qty] });
            } else {
              existing.qtys.push(ing.qty);
            }
          });
        } else {
          orderingMeals++;
        }
        mealIndex++;
      });
    });

    const groceryItems = Array.from(groceryAgg.entries()).map(([item, v]) => ({
      item,
      qty: v.qtys.join(", "),
    }));

    // Budget estimate: assume delivery for ordered meals (dashboard progress uses delivery assumption).
    const weekSpendEstimate = computeWeekSpend(mealsByDay, "delivery");
    const weekSavingsEstimate = estimateSavings(mealsByDay, weekBudget);

    state.plan = {
      generatedAt: new Date().toISOString(),
      weekBudget,
      mealsByDay,
      groceryItems,
      meta: {
        cookingMeals,
        orderingMeals,
        cookTimeWindow: prefs.cookTimeWindow,
        dietaryRestrictions: prefs.dietaryRestrictions || [],
        cuisines: prefs.cuisines || [],
      },
    };
    state.fulfillmentForEstimate = "delivery";
    state.week.weekSpendEstimate = weekSpendEstimate;
    state.week.weekSavingsEstimate = weekSavingsEstimate;
    state.selectedDayForCheckout = state.selectedDayForCheckout || "Mon";
    persistState();

    addAssistantMessage(
      `Plan generated! You’ll have ${cookingMeals} cooked meal(s) and ${orderingMeals} restaurant meal(s). SmartPlan will keep an eye on your weekly budget.`,
      "Student Support AI"
    );
    if (weekBudget > 0) {
      const pct = Math.round((weekSpendEstimate / weekBudget) * 100);
      if (pct >= 90) addAssistantMessage(`Heads up: you’re projected to use about ${pct}% of your weekly budget this week.`, "Student Support AI");
      else addAssistantMessage(`Good news: you’re projected to stay within budget (around ${pct}% used).`, "Student Support AI");
    }

    updatePrototypeStatus();
    renderDashboard();
    renderAssistant();

    updateCheckoutAvailability();
  }

  function computeWeekSpend(mealsByDay, fulfillment) {
    let sum = 0;
    days.forEach((d) => {
      (mealsByDay[d] || []).forEach((meal) => {
        if (meal.kind === "Cook") sum += meal.cost.cookCost || 0;
        else if (meal.kind === "Order") {
          sum += fulfillment === "pickup" ? meal.cost.orderPickupCost || 0 : meal.cost.orderDeliveryCost || 0;
        }
      });
    });
    return Math.round(sum * 100) / 100;
  }

  function estimateSavings(mealsByDay, weekBudget) {
    // Simple savings heuristic: assume cooking dinners replaces ordering dinners and avoids higher costs.
    // We simulate that cooking is cheaper on average.
    let saving = 0;
    days.forEach((d) => {
      (mealsByDay[d] || []).forEach((meal) => {
        if (meal.kind === "Cook") {
          // Compare to typical "if ordered" delivery cost range.
          const estOrderIfCooked = 13.5 + seeded(d + meal.mealType, "alts") * 5.5; // 13.5..19
          saving += estOrderIfCooked - (meal.cost.cookCost || 0);
        }
      });
    });
    saving = Math.max(0, Math.round(saving * 100) / 100);
    // Bound savings so UI doesn't go crazy.
    if (weekBudget > 0) saving = Math.min(saving, weekBudget * 0.35);
    return Math.round(saving * 100) / 100;
  }

  function updatePrototypeStatus() {
    $("prototypeStatus").textContent = state.plan ? "Plan generated" : "Not generated";
  }

  function updateCheckoutAvailability() {
    const planExists = Boolean(state.plan);
    if ($("goCheckoutBtn")) $("goCheckoutBtn").disabled = !planExists;
    document.querySelectorAll('[data-route="checkout"], #navCheckout').forEach((btn) => {
      btn.disabled = !planExists;
      btn.title = planExists ? "" : "Generate a weekly plan first";
    });
  }

  function renderDashboard() {
    if (!state.plan) return;

    const prefsForStats = getCurrentProfile().preferences;
    $("statDailyCalories").textContent = Number(prefsForStats.calorieGoal || 0).toLocaleString();
    $("statWeeklyBudget").textContent = "$" + Number(state.plan.weekBudget || 0).toFixed(0);
    $("statSpendSoFar").textContent = fmtMoney(state.week.weekSpendEstimate || 0).replace(".00", "");
    $("statSavings").textContent = fmtMoney(state.week.weekSavingsEstimate || 0);
    $("statSavingsSub").textContent = state.grubhubPlusEnabled ? "From cooking + deals" : "From cooking";

    const pct = state.plan.weekBudget > 0 ? (state.week.weekSpendEstimate / state.plan.weekBudget) * 100 : 0;
    const pctClamped = clamp(pct, 0, 130);
    $("budgetProgressBar").style.width = Math.round(pctClamped) + "%";
    $("budgetProgressBar").style.background = pct >= 100 ? "linear-gradient(135deg, #ef4444, #f97316)" : "linear-gradient(135deg, var(--gh-green), #22c55e)";

    // Render weekly grid
    const grid = $("weeklyGrid");
    grid.innerHTML = "";
    const uiMealTypes = mealsForUi(Number(prefsForStats.mealsPerDay || 3));

    days.forEach((d) => {
      const dayCol = document.createElement("div");
      dayCol.className = "day-col";

      const t = document.createElement("div");
      t.className = "day-title";
      t.textContent = d;
      dayCol.appendChild(t);

      uiMealTypes.forEach((mType) => {
        const meal = (state.plan.mealsByDay[d] || []).find((m) => m.mealType === mType);
        if (!meal) return;

        const card = document.createElement("div");
        card.className = "meal-card";
        card.dataset.kind = meal.kind;

        card.innerHTML = `
          <div class="meal-meta">
            <div class="meal-type">${mType}</div>
            <div class="meal-cal">${meal.calories} cal</div>
          </div>
          <div class="meal-name">${escapeHtml(meal.name)}</div>
          <div class="meal-actions">
            <button class="mini-button ${meal.kind === "Cook" ? "primary" : ""}" type="button" data-action="cook" data-day="${d}" data-meal="${mType}">
              Cook
            </button>
            <button class="mini-button ${meal.kind === "Order" ? "primary" : ""}" type="button" data-action="order" data-day="${d}" data-meal="${mType}">
              Order
            </button>
            <button class="mini-button" type="button" data-action="details" data-day="${d}" data-meal="${mType}">
              Details
            </button>
          </div>
        `;

        const actionBtnCook = card.querySelector('button[data-action="cook"]');
        const actionBtnOrder = card.querySelector('button[data-action="order"]');
        actionBtnCook.addEventListener("click", () => setMealKind(d, mType, "Cook"));
        actionBtnOrder.addEventListener("click", () => setMealKind(d, mType, "Order"));
        const detailsBtn = card.querySelector('button[data-action="details"]');
        detailsBtn.addEventListener("click", () => showMealDetails(d, mType));

        dayCol.appendChild(card);
      });

      grid.appendChild(dayCol);
    });

    // Assist + buttons
    $("goCheckoutBtn").disabled = false;
  }

  function rebuildMealFromKind(oldMeal, prefs, newKind, seedStr) {
    // Keep name and ingredients coherent with newKind for user feedback.
    const mealIndex = `${oldMeal.day}|${oldMeal.mealType}|${seedStr}`;

    if (newKind === "Cook") {
      const recipe = pickRecipeFor(prefs, mealIndex);
      const calorieJitter = lerp(-35, 35, seeded(mealIndex, "cal"));
      const cookedCalories = Math.round(recipe.calories + calorieJitter);
      const costFactor = lerp(0.9, 1.15, seeded(mealIndex, "cookCost"));
      const cookCost = Math.round(recipe.baseCost * costFactor * 100) / 100;
      return {
        ...oldMeal,
        kind: "Cook",
        name: recipe.name,
        calories: cookedCalories,
        cost: { cookCost, orderDeliveryCost: null, orderPickupCost: null },
        recipeIngredients: recipe.ingredients || [],
        recipeSteps: recipe.steps || [],
        meta: { cookTimeWindow: prefs.cookTimeWindow || "Any" },
      };
    }

    const rest = pickRestaurant(prefs, mealIndex);
    const baseItemPrice = lerp(10.0, 16.0, seeded(mealIndex, "orderPrice"));
    const deliveryFee = 3.99;
    const serviceFee = Math.round(baseItemPrice * 0.18 * 100) / 100;
    const deliverySubtotal = Math.round((baseItemPrice + serviceFee + deliveryFee) * 100) / 100;
    const orderPickupCost = Math.round((baseItemPrice + serviceFee * 0.35) * 100) / 100;
    const calorieJitter = lerp(-120, 120, seeded(mealIndex, "cal2"));
    const orderedCalories = Math.round(650 + calorieJitter);

    const estItemName = (prefs.allergies || "").trim() ? `${rest.baseItem} (customized)` : rest.baseItem;
    return {
      ...oldMeal,
      kind: "Order",
      name: estItemName,
      calories: orderedCalories,
      cost: { cookCost: null, orderDeliveryCost: deliverySubtotal, orderPickupCost },
      meta: { restaurant: rest.name },
    };
  }

  function setMealKind(dayLabel, mealType, newKind) {
    if (!state.plan) return;
    const meal = (state.plan.mealsByDay[dayLabel] || []).find((m) => m.mealType === mealType);
    if (!meal) return;

    const prefs = getCurrentProfile().preferences;
    const prevKind = meal.kind;
    if (prevKind === newKind) return;

    const updated = rebuildMealFromKind(meal, prefs, newKind, `${prevKind}->${newKind}`);
    const idx = state.plan.mealsByDay[dayLabel].findIndex((m) => m.mealType === mealType);
    state.plan.mealsByDay[dayLabel][idx] = updated;

    // Regenerate grocery list items based on all cooked meals (prototype simplicity).
    const groceryItems = regenerateGroceryFromPlan(state.plan.mealsByDay);
    state.plan.groceryItems = groceryItems;

    // Update spend estimate
    state.week.weekSpendEstimate = computeWeekSpend(state.plan.mealsByDay, state.fulfillmentForEstimate);
    state.week.weekSavingsEstimate = estimateSavings(state.plan.mealsByDay, state.plan.weekBudget);
    persistState();

    const saveHint = estimateSwitchSavingsForMeal(meal, newKind);
    addAssistantMessage(
      newKind === "Cook"
        ? `Cook mode for ${dayLabel} ${mealType} selected. If you cook instead of ordering, SmartPlan estimates you save about ${fmtMoneyPlain(saveHint)}.`
        : `Order mode for ${dayLabel} ${mealType} selected. SmartPlan will compare delivery vs pickup and apply any Grubhub+ deals at checkout.`,
      "Student Support AI"
    );

    renderDashboard();
    renderAssistant();
  }

  function estimateSwitchSavingsForMeal(oldMeal, newKind) {
    // Compare current kind vs alternative for a "dinner-like" savings hint.
    if (oldMeal.kind === "Order" && newKind === "Cook") {
      const estOrder = state.fulfillmentForEstimate === "pickup" ? oldMeal.cost.orderPickupCost : oldMeal.cost.orderDeliveryCost;
      const altCook = oldMeal.cost.cookCost || 5.5; // fallback
      return Math.max(0, Math.round((estOrder - altCook) * 100) / 100);
    }
    if (oldMeal.kind === "Cook" && newKind === "Order") {
      // "negative savings" isn't as friendly; show expected extra cost.
      const altOrder = state.fulfillmentForEstimate === "pickup" ? oldMeal.cost.orderPickupCost : oldMeal.cost.orderDeliveryCost;
      return Math.max(0, Math.round((altOrder - oldMeal.cost.cookCost) * 100) / 100);
    }
    return 0;
  }

  function regenerateGroceryFromPlan(mealsByDay) {
    const groceryAgg = new Map();
    days.forEach((d) => {
      (mealsByDay[d] || []).forEach((meal) => {
        if (meal.kind !== "Cook") return;
        (meal.recipeIngredients || []).forEach((ing) => {
          const key = ing.item;
          if (!groceryAgg.has(key)) groceryAgg.set(key, []);
          groceryAgg.get(key).push(ing.qty);
        });
      });
    });
    return Array.from(groceryAgg.entries()).map(([item, qtys]) => ({
      item,
      qty: qtys.join(", "),
    }));
  }

  // -------------------------
  // Grocery modal
  // -------------------------
  function openGroceryModal() {
    if (!state.plan) return;
    const modal = $("groceryModal");
    modal.classList.remove("hidden");
    renderGroceryList();
  }

  function closeGroceryModal() {
    $("groceryModal").classList.add("hidden");
  }

  function renderGroceryList() {
    const list = $("groceryList");
    list.innerHTML = "";
    const items = state.plan?.groceryItems || [];
    if (!items.length) {
      list.innerHTML = `<div class="fineprint">No cooked meals selected for this week yet.</div>`;
      return;
    }

    items.forEach((it) => {
      const node = document.createElement("div");
      node.className = "g-item";
      node.innerHTML = `
        <label style="display:flex; gap:10px; align-items:flex-start;">
          <input type="checkbox" class="g-check" data-item="${escapeHtml(it.item)}" />
          <div>
            <div class="g-name">${escapeHtml(it.item)}</div>
            <div class="g-qty">${escapeHtml(it.qty)}</div>
          </div>
        </label>
      `;
      list.appendChild(node);
    });
  }

  function clearGroceryChecks() {
    document.querySelectorAll(".g-check").forEach((c) => (c.checked = false));
  }

  // -------------------------
  // Meal details modal
  // -------------------------
  function showMealDetails(dayLabel, mealType) {
    if (!state.plan) return;
    const meal = (state.plan.mealsByDay[dayLabel] || []).find((m) => m.mealType === mealType);
    if (!meal) return;

    const modal = $("mealDetailsModal");
    modal.classList.remove("hidden");

    $("mealDetailsTitle").textContent = `${mealType} • ${meal.kind}`;
    if (meal.kind === "Cook") {
      $("mealDetailsSubtitle").textContent = `Cooking window: ${(meal.meta && meal.meta.cookTimeWindow) || "Any"}`;
    } else {
      $("mealDetailsSubtitle").textContent = `Restaurant: ${(meal.meta && meal.meta.restaurant) || "—"}`;
    }

    if (meal.kind === "Cook") {
      const ingredients = (meal.recipeIngredients || [])
        .map((ing) => `<li><strong>${escapeHtml(ing.item)}</strong> — ${escapeHtml(ing.qty)}</li>`)
        .join("");
      const steps = (meal.recipeSteps || [])
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join("");

      $("mealDetailsContent").innerHTML = `
        <div class="section-title" style="margin-top:0">Ingredients</div>
        <ul>${ingredients || "<li>—</li>"}</ul>
        <div class="section-title">Step-by-step instructions</div>
        <ol>${steps || "<li>—</li>"}</ol>
        <div class="fineprint">Estimated cost: ${fmtMoney(meal.cost.cookCost || 0)}</div>
      `;
    } else {
      const delivery = meal.cost.orderDeliveryCost || 0;
      const pickup = meal.cost.orderPickupCost || 0;
      const diff = Math.max(0, Math.round((delivery - pickup) * 100) / 100);
      $("mealDetailsContent").innerHTML = `
        <div class="section-title" style="margin-top:0">SmartPlan selection</div>
        <div class="fineprint" style="margin-top:6px">SmartPlan picked this to align with your calorie goal and dietary preferences (simulated).</div>

        <div class="section-title">Budget Intelligence</div>
        <ul>
          <li>Estimated delivery vs pickup difference: ${fmtMoney(diff)}</li>
          <li>Switching to pickup can avoid delivery fees.</li>
        </ul>
        <div class="fineprint">Estimated delivery: ${fmtMoney(delivery)} • Estimated pickup: ${fmtMoney(pickup)}</div>
      `;
    }
  }

  function closeMealDetailsModal() {
    $("mealDetailsModal").classList.add("hidden");
  }

  // -------------------------
  // Checkout view
  // -------------------------
  function getSelectedDay() {
    return state.selectedDayForCheckout || "Mon";
  }

  function renderCheckout() {
    if (!state.plan) return;

    const day = getSelectedDay();
    $("checkoutDayLabel").textContent = day;

    const checkoutList = $("checkoutList");
    checkoutList.innerHTML = "";
    const meals = state.plan.mealsByDay[day] || [];

    meals.forEach((m) => {
      const node = document.createElement("div");
      node.className = "checkout-item";
      node.innerHTML = `
        <div class="checkout-item-top">
          <div>
            <div class="checkout-item-name">${escapeHtml(m.name)}</div>
            <div class="fineprint" style="margin-top:6px">${m.mealType} • ${m.calories} cal</div>
          </div>
          <div class="checkout-item-kind">${m.kind}</div>
        </div>
        <div class="fineprint" style="margin-top:8px">
          ${m.kind === "Order" ? `Restaurant: ${(m.meta && m.meta.restaurant) || "—"}` : `Cooking window: ${(m.meta && m.meta.cookTimeWindow) || "Any"}`}
        </div>
      `;
      checkoutList.appendChild(node);
    });

    // Compute prices
    recalcCheckoutPrices();
  }

  function getFulfillmentFromForm() {
    const selected = document.querySelector('input[name="fulfillment"]:checked');
    return selected ? selected.value : "delivery";
  }

  function getSelectedDealIds() {
    const selected = new Set();
    deals.forEach((d, idx) => {
      if (state.dealsSelected && state.dealsSelected[idx]) selected.add(d.id);
    });
    return selected;
  }

  function recalcCheckoutPrices() {
    if (!state.plan) return;

    const day = getSelectedDay();
    const meals = state.plan.mealsByDay[day] || [];
    const fulfillment = getFulfillmentFromForm();
    state.fulfillmentForEstimate = fulfillment; // affects some messaging + budget progress later

    const selectedDealIds = getSelectedDealIds();
    const plusEnabled = Boolean(state.grubhubPlusEnabled);
    const sharedCredits = Number(state.sharedCredits || 0);

    // Base subtotal from meals (cooked meals have no delivery fees; ordered meals depend on fulfillment).
    let subtotal = 0;
    let estimatedDeliveryFee = 0;
    let estimatedServiceFee = 0;
    let itemsSubtotalFromOrders = 0; // used for percent discount threshold

    // We’ll treat ordered meal costs as "all-in except tax", then split fees heuristically for display.
    meals.forEach((m) => {
      if (m.kind === "Cook") {
        subtotal += m.cost.cookCost || 0;
        return;
      }
      if (m.kind === "Order") {
        if (fulfillment === "pickup") {
          subtotal += m.cost.orderPickupCost || 0;
          // For UI: assume service still partially applies, but no delivery fee.
          estimatedServiceFee += (m.cost.orderPickupCost || 0) * 0.35;
        } else {
          // Delivery: show delivery fee line and service fee line for transparency (heuristic split).
          const deliveryAllIn = m.cost.orderDeliveryCost || 0;
          // approximate split (base item + fees)
          const deliveryFee = 3.99;
          const serviceFee = Math.max(1.0, deliveryAllIn - (deliveryAllIn - deliveryFee) * 0.7); // heuristic
          estimatedDeliveryFee += deliveryFee;
          estimatedServiceFee += Math.max(1.0, serviceFee);
          subtotal += deliveryAllIn;
          itemsSubtotalFromOrders += deliveryAllIn;
        }
      }
    });

    // Deals / discounts:
    let discountTotal = 0;
    const discountLines = [];
    const addDiscountLine = (label, amount) => {
      const a = Math.round((amount || 0) * 100) / 100;
      if (a <= 0) return;
      discountTotal += a;
      discountLines.push({ label, amount: a });
    };

    // Apply deals in a predictable order.
    if (plusEnabled && selectedDealIds.has("freeDelivery") && fulfillment === "delivery") {
      // Avoid delivery fee portion (bounded by what we show).
      addDiscountLine("Free delivery (Grubhub+)", deals.find((d) => d.id === "freeDelivery").value);
      estimatedDeliveryFee = Math.max(0, estimatedDeliveryFee - deals.find((d) => d.id === "freeDelivery").value);
    }

    if (plusEnabled && selectedDealIds.has("15off")) {
      const threshold = deals.find((d) => d.id === "15off").minSubtotal || 40;
      if (subtotal >= threshold) {
        const percent = deals.find((d) => d.id === "15off").value;
        addDiscountLine("$15 off (simulated % promo)", subtotal * percent);
      }
    }

    if (selectedDealIds.has("pickupCredit") && fulfillment === "pickup") {
      addDiscountLine("Pickup credits", deals.find((d) => d.id === "pickupCredit").value);
    }

    if (selectedDealIds.has("promoStack")) {
      // This is light gamified stack.
      addDiscountLine("Student day promo stack", deals.find((d) => d.id === "promoStack").value);
    }

    // Shared credits: apply up to $10 (prototype-friendly).
    // In a real product this would be integrated via payment/loyalty.
    const useCredits = true;
    const creditsToApply = useCredits ? Math.min(10, sharedCredits, Math.max(0, subtotal - discountTotal)) : 0;
    if (creditsToApply > 0.01) {
      addDiscountLine("Shared credits", creditsToApply);
    }

    const afterDiscount = Math.max(0, subtotal - discountTotal);
    const tax = Math.round(afterDiscount * 0.075 * 100) / 100; // 7.5% simulated

    // Price lines for UI
    const linesBox = $("priceLines");
    linesBox.innerHTML = "";

    const addLine = (label, amount, muted = false) => {
      const node = document.createElement("div");
      node.className = "line" + (muted ? " muted" : "");
      const display = typeof amount === "number" ? fmtMoney(amount) : fmtMoney(0);
      node.innerHTML = `<div>${escapeHtml(label)}</div><div>${display}</div>`;
      linesBox.appendChild(node);
    };

    addLine("Subtotal", subtotal);
    if (fulfillment === "delivery") addLine("Delivery fee (est.)", estimatedDeliveryFee, true);
    if (estimatedServiceFee > 0.01) addLine("Service fee (est.)", estimatedServiceFee, true);
    discountLines.forEach((dl) => addLine(dl.label, -dl.amount, true));
    addLine("Tax (est.)", tax, true);

    const total = Math.round((afterDiscount + tax) * 100) / 100;
    $("totalPrice").textContent = fmtMoney(total);

    // Update assistant message in checkout context.
    const deliveryWindow = $("deliveryWindow")?.value || "ASAP";
    const savingsFromFulfillment = computeFulfillmentSavingsForAssistant(day);
    const plusMsg = plusEnabled ? `Your Grubhub+ benefits are enabled.` : `Grubhub+ benefits are off.`;

    const inbox = getContextualCheckoutAiText({
      day,
      fulfillment,
      deliveryWindow,
      savingsFromFulfillment,
      subtotal,
      total,
      discountTotal,
      plusEnabled,
    });
    // Avoid spamming: only add if the message meaningfully changed.
    const last = (state.assistantMessages || []).slice().reverse().find((m) => m.role === "Checkout AI Assistant");
    if (!last || last.text !== inbox) addAssistantMessage(inbox, "Checkout AI Assistant");
  }

  function computeFulfillmentSavingsForAssistant(day) {
    // Compare: delivery vs pickup for ordered items.
    if (!state.plan) return 0;
    const meals = state.plan.mealsByDay[day] || [];
    let delivery = 0;
    let pickup = 0;
    meals.forEach((m) => {
      if (m.kind !== "Order") return;
      delivery += m.cost.orderDeliveryCost || 0;
      pickup += m.cost.orderPickupCost || 0;
    });
    return Math.max(0, Math.round((delivery - pickup) * 100) / 100);
  }

  function getContextualCheckoutAiText({ day, fulfillment, deliveryWindow, savingsFromFulfillment, subtotal, total, discountTotal, plusEnabled }) {
    const addSavings = savingsFromFulfillment > 0.01 ? `Switching to pickup could save about ${fmtMoneyPlain(savingsFromFulfillment)}.` : "";
    const feeSavingsMsg =
      fulfillment === "pickup"
        ? `Great call: pickup avoids many delivery fees.`
        : `Ordering during the selected window helps keep fees efficient.`;

    const dealPart =
      discountTotal > 0.01
        ? `Nice choice. SmartPlan applied simulated discounts (about ${fmtMoneyPlain(discountTotal)}).`
        : `If you enable more deals, SmartPlan can highlight additional savings.`;

    if (plusEnabled && fulfillment === "delivery") {
      return `Nice choice. Grubhub+ optimization is on, and SmartPlan recommends this delivery window for savings. ${dealPart} ${addSavings}`.trim();
    }

    if (fulfillment === "pickup") {
      return `Nice choice. You’re picking up to reduce fees. ${dealPart} ${addSavings}`.trim();
    }

    // Delivery fallback
    const nearBudget = state.plan?.weekBudget ? Math.round((total / state.plan.weekBudget) * 100) : 0;
    if (nearBudget >= 20) {
      return `Checkout tip for ${day}: if you cook or switch to pickup next time, you’ll protect your weekly budget. ${feeSavingsMsg} ${dealPart}`.trim();
    }
    return `${feeSavingsMsg} ${dealPart}`.trim();
  }

  function placeOrder() {
    if (!state.plan) return;
    const day = getSelectedDay();
    const meals = state.plan.mealsByDay[day] || [];

    const fulfillment = getFulfillmentFromForm();
    const selectedDealIds = getSelectedDealIds();
    const plusEnabled = Boolean(state.grubhubPlusEnabled);

    // Compute total quickly using the same estimation model as recalc.
    let orderTotal = 0;
    meals.forEach((m) => {
      if (m.kind === "Cook") orderTotal += m.cost.cookCost || 0;
      else if (m.kind === "Order") {
        orderTotal += fulfillment === "pickup" ? m.cost.orderPickupCost || 0 : m.cost.orderDeliveryCost || 0;
      }
    });

    // Apply approximate discounts similarly (keep consistent with UI-ish).
    let discountTotal = 0;
    if (plusEnabled && selectedDealIds.has("freeDelivery") && fulfillment === "delivery") {
      discountTotal += deals.find((d) => d.id === "freeDelivery").value;
    }
    if (plusEnabled && selectedDealIds.has("15off") && orderTotal >= (deals.find((d) => d.id === "15off").minSubtotal || 40)) {
      discountTotal += orderTotal * deals.find((d) => d.id === "15off").value;
    }
    if (selectedDealIds.has("pickupCredit") && fulfillment === "pickup") {
      discountTotal += deals.find((d) => d.id === "pickupCredit").value;
    }
    if (selectedDealIds.has("promoStack")) {
      discountTotal += deals.find((d) => d.id === "promoStack").value;
    }
    // shared credits
    discountTotal += Math.min(10, Number(state.sharedCredits || 0), Math.max(0, orderTotal - discountTotal));

    const afterDiscount = Math.max(0, orderTotal - discountTotal);
    const tax = Math.round(afterDiscount * 0.075 * 100) / 100;
    const total = Math.round((afterDiscount + tax) * 100) / 100;

    state.sharedCredits = Math.max(0, Number(state.sharedCredits || 0) - discountTotal);

    // Update streak: keep it simple.
    const weekBudget = Number(state.plan.weekBudget || 0);
    if (weekBudget > 0 && total <= weekBudget * 0.45) {
      state.week.streakDays = (state.week.streakDays || 0) + 1;
    } else {
      state.week.streakDays = 0;
    }

    // Update gamification savings
    const saved = Math.round(discountTotal * 100) / 100;
    state.week.weekSavingsEstimate = Math.round((state.week.weekSavingsEstimate || 0) + saved * 0.65) / 100;

    // Assist message + update plan budget
    addAssistantMessage(
      `Order placed (prototype). You saved about ${fmtMoneyPlain(saved)} and you’re building a savings streak. Keep going.`,
      "Student Support AI"
    );

    // Navigate back to dashboard after a short delay so UI updates.
    persistState();
    renderAssistant();
    setTimeout(() => navigate("dashboard"), 350);
  }

  // -------------------------
  // Deals view
  // -------------------------
  function renderDeals() {
    const dealList = $("dealList");
    const plusEnabled = Boolean(state.grubhubPlusEnabled);
    dealList.innerHTML = "";

    deals.forEach((d, idx) => {
      const checked = Boolean(state.dealsSelected && state.dealsSelected[idx]);
      const disabled = d.requiresPlus && !plusEnabled;

      const node = document.createElement("div");
      node.className = "deal";
      node.innerHTML = `
        <div class="deal-top">
          <div>
            <div class="deal-name">${escapeHtml(d.name)}</div>
            <div class="deal-desc">${escapeHtml(d.desc)}</div>
          </div>
          <label class="toggle" style="gap:8px;">
            <input type="checkbox" data-deal="${d.id}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}/>
            <span class="toggle-ui" aria-hidden="true"></span>
          </label>
        </div>
      `;

      // Attach checkbox handler
      const input = node.querySelector('input[type="checkbox"]');
      input.addEventListener("change", (e) => {
        if (e.target.disabled) return;
        const index = deals.findIndex((x) => x.id === d.id);
        state.dealsSelected[index] = e.target.checked;
        persistState();
        renderDeals(); // refresh impact
        renderDealImpact();
      });

      dealList.appendChild(node);
    });

    renderDealImpact();
  }

  function renderDealImpact() {
    const plusEnabled = Boolean(state.grubhubPlusEnabled);
    const selectedDealIds = getSelectedDealIds();

    let discount = 0;
    let feeAvoid = 0;

    deals.forEach((d) => {
      if (!selectedDealIds.has(d.id)) return;
      if (d.requiresPlus && !plusEnabled) return;
      if (d.discountType === "feeAvoid") feeAvoid += d.value;
      if (d.discountType === "fixed") discount += d.value;
      if (d.discountType === "percent") {
        // Use a representative subtotal to show impact.
        discount += (state.plan?.weekBudget ? 40 : 0) * d.value;
      }
    });

    $("impactDiscount").textContent = fmtMoneyPlain(discount);
    $("impactFee").textContent = fmtMoneyPlain(feeAvoid);

    const recBox = $("dealRecommendations");
    const rec = [];
    if (plusEnabled) rec.push("SmartPlan will favor delivery options with Grubhub+ free delivery when it saves fees.");
    if (selectedDealIds.has("pickupCredit")) rec.push("Switching to pickup is likely to reduce costs on your chosen meals.");
    if (selectedDealIds.has("15off")) rec.push("SmartPlan will highlight restaurants/orders that help you cross the $40+ threshold.");
    if (!rec.length) rec.push("Select a few deals to see smarter recommendations here.");
    recBox.textContent = rec.join(" ");
  }

  function applyDealsToPlanAndCheckout() {
    // This prototype already applies deals during checkout calculations.
    addAssistantMessage("Deals applied. SmartPlan will use your selected Grubhub+ optimizations during checkout.", "Student Support AI");
    persistState();
    navigate("dashboard");
  }

  // -------------------------
  // Family view
  // -------------------------
  function renderFamilyMemberList() {
    const box = $("familyList");
    box.innerHTML = "";
    state.profiles.forEach((p) => {
      const node = document.createElement("div");
      node.className = "family-member";
      const isActive = p.id === state.currentProfileId;
      node.innerHTML = `
        <div class="family-member-top">
          <div>
            <div class="family-member-name">${escapeHtml(p.name)}</div>
            <div class="family-member-role">${escapeHtml(p.role)}</div>
          </div>
          <button class="mini-button ${isActive ? "primary" : ""}" type="button" data-use="${p.id}">
            ${isActive ? "Active" : "Use"}
          </button>
        </div>
        <div class="fineprint" style="margin-top:8px">
          Cook times/week: ${Number(p.preferences.cookTimesPerWeek || 0)} • Dietary: ${(p.preferences.dietaryRestrictions || []).join(", ") || "None"}
        </div>
      `;
      node.querySelector("button[data-use]").addEventListener("click", () => setCurrentProfile(p.id));
      box.appendChild(node);
    });
  }

  function renderFamilySnapshot() {
    const snap = $("familySnapshot");
    if (!snap) return;
    const p = getCurrentProfile();
    const prefs = p.preferences;

    const weekBudget = Number(prefs.weeklyBudget || 0);
    snap.innerHTML = `
      <div class="snapshot-row">
        <div class="mini-label">Weekly budget</div>
        <div class="stat-value" style="margin-top:6px;font-size:18px;">$${Number(weekBudget || 0).toFixed(0)}</div>
        <div class="fineprint" style="margin-top:6px">Used for SmartPlan meal planning + budget warnings.</div>
      </div>
      <div class="snapshot-row">
        <div class="mini-label">Cooking frequency</div>
        <div class="stat-value" style="margin-top:6px;font-size:18px;">${Number(prefs.cookTimesPerWeek || 0)}×/week</div>
        <div class="fineprint" style="margin-top:6px">Drives cooked meals in the weekly plan.</div>
      </div>
    `;
  }

  function renderFamilyProfileSwitch() {
    const sel = $("familyProfileSwitch");
    sel.innerHTML = "";
    state.profiles.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.role})`;
      sel.appendChild(opt);
    });
    syncProfileSelects();
  }

  function addMember(name, role) {
    const id = "m" + Math.random().toString(16).slice(2, 7);
    state.profiles.push({
      id,
      name: name || "New member",
      role: role || "Student",
      preferences: defaultPreferences(),
    });
    persistState();
    renderFamilyProfileSwitch();
    renderFamilyMemberList();
    addAssistantMessage(`Added family member "${name}". Profiles keep separate preferences in this prototype.`, "Student Support AI");
  }

  // -------------------------
  // Onboarding form bindings
  // -------------------------
  function updateCookTimesSliderUi() {
    const v = Number($("prefCookTimesPerWeek").value || 0);
    $("prefCookTimesPerWeekVal").textContent = String(v);
  }

  function loadPreferencesIntoOnboardingInputs() {
    const prefs = getCurrentProfile().preferences;
    $("prefCalorieGoal").value = Number(prefs.calorieGoal || 1800);
    $("prefWeeklyBudget").value = Number(prefs.weeklyBudget || 50);
    $("prefMealsPerDay").value = String(Number(prefs.mealsPerDay || 3));
    $("prefCookTimesPerWeek").value = String(Number(prefs.cookTimesPerWeek || 3));
    $("prefCookTimesPerWeekVal").textContent = String(Number(prefs.cookTimesPerWeek || 3));
    $("prefCookTimeWindow").value = String(prefs.cookTimeWindow || "Any");
    $("prefAllergies").value = String(prefs.allergies || "");

    setChipActive("dietChips", prefs.dietaryRestrictions || [], "dietaryRestrictions");
    setChipActive("cuisineChips", prefs.cuisines || [], "cuisines");
  }

  function readPreferencesFromOnboardingForm() {
    const prefs = getCurrentProfile().preferences;
    prefs.calorieGoal = Number($("prefCalorieGoal").value || 1800);
    prefs.weeklyBudget = Number($("prefWeeklyBudget").value || 50);
    prefs.mealsPerDay = Number($("prefMealsPerDay").value || 3);
    prefs.cookTimesPerWeek = Number($("prefCookTimesPerWeek").value || 3);
    prefs.cookTimeWindow = $("prefCookTimeWindow").value || "Any";
    prefs.allergies = ($("prefAllergies").value || "").trim();

    // Chips model:
    const diet = Array.from($("dietChips").querySelectorAll(".chip.active")).map((b) => b.getAttribute("data-chip"));
    prefs.dietaryRestrictions = diet;

    const cuis = Array.from($("cuisineChips").querySelectorAll(".chip.active")).map((b) => b.getAttribute("data-chip"));
    prefs.cuisines = cuis;

    // If user left cuisines empty, pick defaults later; keep empty is fine.
    persistState();
  }

  // -------------------------
  // Event wiring
  // -------------------------
  function wireUi() {
    // Router nav buttons
    document.querySelectorAll("[data-route]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-route");
        if (r === "checkout") {
          if (!state.plan) return;
        }
        navigate(r);
      });
    });

    window.addEventListener("hashchange", () => {
      const route = getRouteFromHash();
      if (route === "checkout" && !state.plan) navigate("onboarding");
      setActiveView(route);
      if (route === "dashboard") renderDashboard();
      if (route === "checkout") renderCheckout();
      if (route === "deals") renderDeals();
      if (route === "family") {
        renderFamilyProfileSwitch();
        renderFamilySnapshot();
        renderFamilyMemberList();
      }
    });

    // Initial route
    setActiveView(getRouteFromHash());

    // Onboarding bindings
    $("prefCookTimesPerWeek").addEventListener("input", updateCookTimesSliderUi);
    updateCookTimesSliderUi();

    initChips("dietChips", "dietaryRestrictions");
    initChips("cuisineChips", "cuisines");

    $("profileSelect").addEventListener("change", () => {
      setCurrentProfile($("profileSelect").value);
    });

    $("generateBtn").addEventListener("click", () => {
      readPreferencesFromOnboardingForm();
      // When a new plan is generated, reset selected day and assistant context.
      state.assistantMessages = state.assistantMessages.slice(-6);
      persistState();
      generatePlanFromPreferences();
      navigate("dashboard");
    });

    // Dashboard bindings
    $("openGroceryBtn").addEventListener("click", openGroceryModal);
    $("goCheckoutBtn").addEventListener("click", () => {
      if (!state.plan) return;
      navigate("checkout");
    });

    $("checkoutDaySeg").querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const day = btn.getAttribute("data-day");
        state.selectedDayForCheckout = day;
        // UI state
        $("checkoutDaySeg").querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-checked", "false"));
        btn.setAttribute("aria-checked", "true");
        persistState();
        if (location.hash.replace("#", "") === "checkout") renderCheckout();
      });
    });

    $("plusToggle").addEventListener("change", (e) => {
      state.grubhubPlusEnabled = Boolean(e.target.checked);
      // Sync other toggles
      if ($("plusToggle2")) $("plusToggle2").checked = state.grubhubPlusEnabled;
      if ($("plusToggle3")) $("plusToggle3").checked = state.grubhubPlusEnabled;
      persistState();
      addAssistantMessage(
        state.grubhubPlusEnabled ? "Grubhub+ benefits enabled. SmartPlan will prioritize deliveries with fee savings." : "Grubhub+ benefits disabled. SmartPlan will rely more on cooking + non-member promos.",
        "Student Support AI"
      );
      if (location.hash.replace("#", "") === "dashboard") renderDashboard();
      if (location.hash.replace("#", "") === "deals") renderDeals();
    });

    $("backToPlanBtn").addEventListener("click", () => navigate("dashboard"));

    // Checkout bindings
    document.querySelectorAll('input[name="fulfillment"]').forEach((r) => r.addEventListener("change", () => recalcCheckoutPrices()));
    $("deliveryWindow").addEventListener("change", () => recalcCheckoutPrices());
    $("recalcBtn").addEventListener("click", () => recalcCheckoutPrices());
    $("placeOrderBtn").addEventListener("click", () => placeOrder());

    // Deals view bindings
    $("backToDashboardFromDealsBtn").addEventListener("click", () => navigate("dashboard"));
    $("applyDealsBtn").addEventListener("click", () => applyDealsToPlanAndCheckout());
    $("plusToggle2").addEventListener("change", (e) => {
      state.grubhubPlusEnabled = Boolean(e.target.checked);
      if ($("plusToggle")) $("plusToggle").checked = state.grubhubPlusEnabled;
      if ($("plusToggle3")) $("plusToggle3").checked = state.grubhubPlusEnabled;
      persistState();
      renderDeals();
    });

    // Family view bindings
    $("backToDashboardFromFamilyBtn").addEventListener("click", () => navigate("dashboard"));
    $("plusToggle3").addEventListener("change", (e) => {
      state.grubhubPlusEnabled = Boolean(e.target.checked);
      if ($("plusToggle")) $("plusToggle").checked = state.grubhubPlusEnabled;
      if ($("plusToggle2")) $("plusToggle2").checked = state.grubhubPlusEnabled;
      persistState();
    });

    $("saveFamilyCreditsBtn").addEventListener("click", () => {
      state.sharedCredits = Math.max(0, Number($("sharedCreditsInput").value || 0));
      persistState();
      addAssistantMessage(`Family credits saved. Shared credits pool is now ${fmtMoneyPlain(state.sharedCredits)}.`, "Student Support AI");
      renderDeals();
      renderFamilySnapshot();
    });

    $("addMemberBtn").addEventListener("click", () => {
      const name = ($("newMemberName").value || "").trim();
      const role = $("newMemberRole").value || "Student";
      if (!name) return;
      addMember(name, role);
      $("newMemberName").value = "";
    });

    $("useProfileBtn").addEventListener("click", () => {
      const id = $("familyProfileSwitch").value;
      setCurrentProfile(id);
      addAssistantMessage(`Using profile "${getCurrentProfile().name}" for the next SmartPlan generation.`, "Student Support AI");
      persistState();
      navigate("onboarding");
    });

    // Assistant quick actions
    $("askAiBtn").addEventListener("click", () => {
      const route = getRouteFromHash();
      if (route === "onboarding") {
        const prefs = getCurrentProfile().preferences;
        addAssistantMessage(
          `Quick check: with your weekly budget of ${fmtMoneyPlain(prefs.weeklyBudget || 0)}, consider setting cooking to ${clamp(prefs.cookTimesPerWeek || 3, 0, 7)}×/week to reduce delivery fee spikes.`,
          "Student Support AI"
        );
        return;
      }
      if (route === "dashboard") {
        if (!state.plan) return;
        const day = getSelectedDay();
        const meals = state.plan.mealsByDay[day] || [];
        const dinner = meals.find((m) => m.mealType === "Dinner");
        if (dinner && dinner.kind === "Order") {
          addAssistantMessage(`For ${day} dinner, SmartPlan suggests trying Cook mode next time. It’s usually cheaper and helps protect your budget.`, "Student Support AI");
        } else {
          addAssistantMessage(`You’re on track. Keep cooking on your dinner days and SmartPlan will surface savings automatically at checkout.`, "Student Support AI");
        }
        return;
      }
      if (route === "checkout") {
        const day = getSelectedDay();
        const fulfillment = getFulfillmentFromForm();
        const savings = computeFulfillmentSavingsForAssistant(day);
        addAssistantMessage(
          fulfillment === "delivery"
            ? `Switching to pickup could save about ${fmtMoneyPlain(savings)} on your ordered items.`
            : `Pickup is the fee-friendly option. If you’d like, SmartPlan can also apply your selected Grubhub+ deals.`,
          "Checkout AI Assistant"
        );
      }
    });

    // Grocery modal controls
    $("closeGroceryBtn").addEventListener("click", closeGroceryModal);
    $("doneGroceryBtn").addEventListener("click", closeGroceryModal);
    $("clearGroceryChecksBtn").addEventListener("click", () => clearGroceryChecks());

    // Meal details modal controls
    $("closeMealDetailsBtn").addEventListener("click", closeMealDetailsModal);
    $("doneMealDetailsBtn").addEventListener("click", closeMealDetailsModal);

    // Reset
    $("resetBtn").addEventListener("click", () => {
      localStorage.removeItem(LS_KEY);
      state = createDefaultState();
      setCurrentProfile("m1");
      state.assistantMessages = [];
      updatePrototypeStatus();
      closeGroceryModal();
      renderAssistant();
      // Reset views
      navigate("onboarding");
      updateCheckoutAvailability();
    });
  }

  // -------------------------
  // Initial render
  // -------------------------
  function init() {
    updatePrototypeStatus();
    syncProfileSelects();
    loadPreferencesIntoOnboardingInputs();
    renderFamilyProfileSwitch();
    renderFamilySnapshot();
    renderFamilyMemberList();

    // Setup defaults for dealsSelected array length
    if (!state.dealsSelected || state.dealsSelected.length !== deals.length) {
      state.dealsSelected = deals.map((d) => d.id === "freeDelivery" || d.id === "15off" || d.id === "promoStack");
    }

    // Sync toggles
    if ($("plusToggle")) $("plusToggle").checked = Boolean(state.grubhubPlusEnabled);
    if ($("plusToggle2")) $("plusToggle2").checked = Boolean(state.grubhubPlusEnabled);
    if ($("plusToggle3")) $("plusToggle3").checked = Boolean(state.grubhubPlusEnabled);

    // Initial assistant text
    if (!state.assistantMessages || state.assistantMessages.length === 0) {
      addAssistantMessage("Hi! I’m SmartPlan’s student support AI. Generate your weekly plan and I’ll guide planning + checkout.", "Student Support AI");
      // Persist after initial message
      persistState();
    } else {
      renderAssistant();
    }

    wireUi();
    // Trigger route rendering once wired.
    const route = getRouteFromHash();
    setActiveView(route);
    if (route === "dashboard" && state.plan) renderDashboard();
    if (route === "checkout" && state.plan) renderCheckout();
    if (route === "deals") renderDeals();
    if (route === "family") {
      renderFamilyProfileSwitch();
      renderFamilySnapshot();
      renderFamilyMemberList();
    }

    updateCheckoutAvailability();
  }

  // Start
  init();
})();

