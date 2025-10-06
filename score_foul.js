//Add home points
function incrementHomeTotalPoints(addHomePointsId, homePointIncrement) {
    const totalHomePointElementAdd = document.getElementById(addHomePointsId);
    let currentHomePointAdd = parseInt(totalHomePointElementAdd.textContent, 10);
    currentHomePointAdd += homePointIncrement;
    totalHomePointElementAdd.textContent = currentHomePointAdd;
    // update decrement button state
    updateScoreDecrementButton(addHomePointsId);
    addTotalHomePoints();
}

//Subtract home points
function decrementHomeTotalPoints(subHomePointsId, homePointDecrement) {
    const totalHomePointElementSub = document.getElementById(subHomePointsId);
    let currentHomePointSub = parseInt(totalHomePointElementSub.textContent, 10);
    currentHomePointSub -= homePointDecrement;
    // prevent negative
    if (currentHomePointSub < 0) currentHomePointSub = 0;
    totalHomePointElementSub.textContent = currentHomePointSub;
    // update decrement button state
    updateScoreDecrementButton(subHomePointsId);
    addTotalHomePoints();
}

//Calculate total home points
function addTotalHomePoints() {
    const addAllHomePoints = document.querySelectorAll('h3[id^="addHomeTotalPoints"]');
        let homeTotalPoints = 0;
    addAllHomePoints.forEach(homePoints => {
        homeTotalPoints += parseInt(homePoints.textContent, 10);
    })
    document.getElementById('homeTotalScore').value = homeTotalPoints;
}

//Add total home fouls
function incrementHomeTotalFouls(addHomeFoulsID, homeFoulIncrement) {
    const totalHomeFoulElementAdd = document.getElementById(addHomeFoulsID);
    let currentHomeFoulAdd = parseInt(totalHomeFoulElementAdd.textContent, 10);
    currentHomeFoulAdd += homeFoulIncrement;
    // cap at 5
    if (currentHomeFoulAdd > 5) currentHomeFoulAdd = 5;
    totalHomeFoulElementAdd.textContent = currentHomeFoulAdd;
    // toggle foul-max class when reaching 5
    toggleFoulMaxClass(totalHomeFoulElementAdd, currentHomeFoulAdd);
    // update foul decrement button state
    updateFoulDecrementButton(addHomeFoulsID);
    addTotalHomeFouls();
}

//Subtract total Home Fouls
function decrementHomeTotalFouls(subHomeFoulsId, homeFoulDecrement) {
    const totalHomeFoulElementSub = document.getElementById(subHomeFoulsId);
    let currentHomeFoulSub = parseInt(totalHomeFoulElementSub.textContent,10);
    currentHomeFoulSub -= homeFoulDecrement;
    // prevent negative
    if (currentHomeFoulSub < 0) currentHomeFoulSub = 0;
    totalHomeFoulElementSub.textContent = currentHomeFoulSub;
    toggleFoulMaxClass(totalHomeFoulElementSub, currentHomeFoulSub);
    // update foul decrement button state
    updateFoulDecrementButton(subHomeFoulsId);
    addTotalHomeFouls();
}

//Calculate Total Home Fouls
function addTotalHomeFouls() {
    const addAllHomeFouls = document.querySelectorAll('h3[id^="addHomeTotalFouls"]');
    let homeTotalFouls = 0;
    addAllHomeFouls.forEach(homeFouls => {
        homeTotalFouls += parseInt(homeFouls.textContent, 10);
    })
    document.getElementById('homeTotalFouls').value = homeTotalFouls;
}


// --------------------- Away

//Add away points
function incrementAwayTotalPoints(addAwayPointsId, awayPointIncrement) {
    const totalAwayPointElementAdd = document.getElementById(addAwayPointsId);
    let currentAwayPointAdd = parseInt(totalAwayPointElementAdd.textContent, 10);
    currentAwayPointAdd += awayPointIncrement;
    totalAwayPointElementAdd.textContent = currentAwayPointAdd;
    // update decrement button state
    updateScoreDecrementButton(addAwayPointsId);
    addTotalAwayPoints();
}

//Subtract away points
function decrementAwayTotalPoints(subAwayPointsId, awayPointDecrement) {
    const totalAwayPointElementSub = document.getElementById(subAwayPointsId);
    let currentAwayPointSub = parseInt(totalAwayPointElementSub.textContent, 10);
    currentAwayPointSub -= awayPointDecrement;
    // prevent negative
    if (currentAwayPointSub < 0) currentAwayPointSub = 0;
    totalAwayPointElementSub.textContent = currentAwayPointSub;
    // update decrement button state
    updateScoreDecrementButton(subAwayPointsId);
    addTotalAwayPoints();
}

//Calculate total Away Points
function addTotalAwayPoints() {
    const addAllAwayPoints = document.querySelectorAll('h3[id^="addAwayTotalPoints"]');
        let awayTotalPoints = 0;
    addAllAwayPoints.forEach(awayPoints => {
        awayTotalPoints += parseInt(awayPoints.textContent, 10);
    })
    document.getElementById('awayTotalScore').value = awayTotalPoints;
}

//Add total Away Fouls
function incrementAwayTotalFouls(addAwayFoulsID, awayFoulIncrement) {
    const totalAwayFoulElementAdd = document.getElementById(addAwayFoulsID);
    let currentAwayFoulAdd = parseInt(totalAwayFoulElementAdd.textContent, 10);
    currentAwayFoulAdd += awayFoulIncrement;
    // cap at 5
    if (currentAwayFoulAdd > 5) currentAwayFoulAdd = 5;
    totalAwayFoulElementAdd.textContent = currentAwayFoulAdd;
    toggleFoulMaxClass(totalAwayFoulElementAdd, currentAwayFoulAdd);
    // update foul decrement button state
    updateFoulDecrementButton(addAwayFoulsID);
    addTotalAwayFouls();
}

//Subtract total Away Fouls
function decrementAwayTotalFouls(subAwayFoulsId, awayFoulDecrement) {
    const totalAwayFoulElementSub = document.getElementById(subAwayFoulsId);
    let currentAwayFoulSub = parseInt(totalAwayFoulElementSub.textContent,10);
    currentAwayFoulSub -= awayFoulDecrement;
    // prevent negative
    if (currentAwayFoulSub < 0) currentAwayFoulSub = 0;
    totalAwayFoulElementSub.textContent = currentAwayFoulSub;
    toggleFoulMaxClass(totalAwayFoulElementSub, currentAwayFoulSub);
    // update foul decrement button state
    updateFoulDecrementButton(subAwayFoulsId);
    addTotalAwayFouls();
}

//Calculate Total Away Fouls
function addTotalAwayFouls() {
    const addAllAwayFouls = document.querySelectorAll('h3[id^="addAwayTotalFouls"]');
    let awayTotalFouls = 0;
    addAllAwayFouls.forEach(awayFouls => {
        awayTotalFouls += parseInt(awayFouls.textContent, 10);
    })
    document.getElementById('awayTotalFouls').value = awayTotalFouls;
}

// Toggle the visual class for fouls at max
function toggleFoulMaxClass(element, value) {
    if (!element) return;
    if (value === 5) {
        element.classList.add('foul-max');
    } else {
        element.classList.remove('foul-max');
    }
}

// Disable/enable decrement buttons for score h3 elements
function updateScoreDecrementButton(scoreElementId) {
    const el = document.getElementById(scoreElementId);
    if (!el) return;
    const row = el.closest('td') || el.parentElement;
    if (!row) return;
    const decBtn = row.querySelector('button.decrement-button-score');
    if (!decBtn) return;
    const val = parseInt(el.textContent, 10);
    decBtn.disabled = isNaN(val) || val <= 0;
}

// Disable/enable decrement buttons for foul h3 elements
function updateFoulDecrementButton(foulElementId) {
    const el = document.getElementById(foulElementId);
    if (!el) return;
    const row = el.closest('td') || el.parentElement;
    if (!row) return;
    const decBtn = row.querySelector('button.decrement-button-foul');
    if (!decBtn) return;
    const val = parseInt(el.textContent, 10);
    decBtn.disabled = isNaN(val) || val <= 0;
}

// Initialize decrement button states when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('h3[id^="addHomeTotalPoints"]').forEach(h3 => updateScoreDecrementButton(h3.id));
    document.querySelectorAll('h3[id^="addAwayTotalPoints"]').forEach(h3 => updateScoreDecrementButton(h3.id));
    // initialize foul decrement buttons
    document.querySelectorAll('h3[id^="addHomeTotalFouls"]').forEach(h3 => updateFoulDecrementButton(h3.id));
    document.querySelectorAll('h3[id^="addAwayTotalFouls"]').forEach(h3 => updateFoulDecrementButton(h3.id));
});