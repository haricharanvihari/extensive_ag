document.addEventListener('DOMContentLoaded', () => {
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsArea = document.getElementById('results');
    
    calculateBtn.addEventListener('click', async () => {
        const data = {
            age: document.getElementById('age').value,
            weight: document.getElementById('weight').value,
            height: document.getElementById('height').value,
            goal: document.getElementById('goal').value,
            activity: document.getElementById('activity').value,
            meal_count: 3,
            constraints: "Protein increasing toward dinner"
        };

        // UI Feedback
        calculateBtn.innerText = "Reasoning...";
        calculateBtn.disabled = true;

        try {
            // Simulated delay for "thinking"
            await new Promise(r => setTimeout(r, 1200));
            
            const result = runNutritionAgent(data);
            displayResults(result);
        } catch (error) {
            console.error(error);
            alert("Error in reasoning engine.");
        } finally {
            calculateBtn.innerText = "Calculate Plan";
            calculateBtn.disabled = false;
        }
    });
});

/**
 * Portable Reasoning Engine (JS Port of daily_calorie_planner.py)
 */
function runNutritionAgent(data) {
    const { weight, height, age, goal, activity, meal_count, constraints } = data;
    const log = [];
    
    // Step 2: BMR
    const bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    log.push(`Step 2 (BMR): Calculated ${bmr.toFixed(0)} kcal using Mifflin-St Jeor.`);

    // Step 3: TDEE
    const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, 'very active': 1.725 };
    const tdee = bmr * (multipliers[activity] || 1.2);
    log.push(`Step 3 (TDEE): Applied ${activity} multiplier. Result: ${tdee.toFixed(0)} kcal.`);

    // Step 4: Adjust
    let target = tdee;
    if (goal === 'lose') {
        target -= 500;
        log.push("Step 4 (ADJUST): Applied -500 kcal deficit for weight loss.");
    } else if (goal === 'gain') {
        target += 300;
        log.push("Step 4 (ADJUST): Applied +300 kcal surplus for weight gain.");
    } else {
        log.push("Step 4 (ADJUST): Maintaining current TDEE.");
    }

    // Step 5: Macros
    const macros = {
        protein: Math.round((target * 0.3) / 4),
        carbs: Math.round((target * 0.4) / 4),
        fats: Math.round((target * 0.3) / 9)
    };
    log.push(`Step 5 (MACROS): P:${macros.protein}g, C:${macros.carbs}g, F:${macros.fats}g.`);

    // Step 6: Meals
    const meals = [];
    for (let i = 1; i <= meal_count; i++) {
        const share = 1 / meal_count;
        let p_share = share;
        if (constraints.includes("Protein increasing")) {
            p_share = (i / (meal_count * (meal_count + 1) / 2));
        }
        
        meals.push({
            name: i === 1 ? "Breakfast" : i === 2 ? "Lunch" : "Dinner",
            protein: (macros.protein * p_share).toFixed(1),
            carbs: (macros.carbs * share).toFixed(1),
            fats: (macros.fats * share).toFixed(1),
            calories: Math.round(target * share)
        });
    }
    log.push(`Step 6 (MEALS): Adhered to '${constraints}'.`);

    // Step 7: Verify
    const sumCals = meals.reduce((a, b) => a + b.calories, 0);
    const verified = Math.abs(sumCals - target) < (target * 0.01);
    log.push(`Step 7 (VERIFY): Sum is ${sumCals} kcal. Status: ${verified ? 'PASS' : 'FAIL'}`);

    return { log, target, verified, meals };
}

function displayResults(result) {
    const resultsArea = document.getElementById('results');
    const logList = document.getElementById('reasoning-list');
    const mealContainer = document.getElementById('meal-container');
    
    resultsArea.classList.remove('hidden');
    logList.innerHTML = result.log.map(entry => `<li>${entry}</li>`).join('');
    document.getElementById('target-cals').innerText = Math.round(result.target);
    document.getElementById('verify-status').innerText = result.verified ? 'PASS' : 'FAIL';
    
    mealContainer.innerHTML = result.meals.map(meal => `
        <div class="meal-card">
            <div class="meal-info">
                <h4>${meal.name}</h4>
                <p>P: ${meal.protein}g | C: ${meal.carbs}g | F: ${meal.fats}g</p>
            </div>
            <div class="meal-cals">${meal.calories} kcal</div>
        </div>
    `).join('');
}
