//Add home points
function incrementHomeTotalPoints(addHomePointsId, homePointIncrement) {
    const totalHomePointElementAdd = document.getElementById(addHomePointsId);
    let currentHomePointAdd = parseInt(totalHomePointElementAdd.textContent, 10);
    currentHomePointAdd += homePointIncrement;
    totalHomePointElementAdd.textContent = currentHomePointAdd;
    addTotalHomePoints();
}

//Subtract home points
function decrementHomeTotalPoints(subHomePointsId, homePointDecrement) {
    const totalHomePointElementSub = document.getElementById(subHomePointsId);
    let currentHomePointSub = parseInt(totalHomePointElementSub.textContent, 10);
    currentHomePointSub -= homePointDecrement;
    totalHomePointElementSub.textContent = currentHomePointSub;
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

//Allow ipad compatibility
document.querySelectorAll('button').forEach(button => {
    button.addEventListener('touchstart', function() {
        this.click();
    })
})


//Add total home fouls
function incrementHomeTotalFouls(addHomeFoulsID, homeFoulIncrement) {
    const totalHomeFoulElementAdd = document.getElementById(addHomeFoulsID);
    let currentHomeFoulAdd = parseInt(totalHomeFoulElementAdd.textContent, 10);
    currentHomeFoulAdd += homeFoulIncrement;
    totalHomeFoulElementAdd.textContent = currentHomeFoulAdd;
    addTotalHomeFouls();
}

//Subtract total Home Fouls
function decrementHomeTotalFouls(subHomeFoulsId, homeFoulDecrement) {
    const totalHomeFoulElementSub = document.getElementById(subHomeFoulsId);
    let currentHomeFoulSub = parseInt(totalHomeFoulElementSub.textContent,10);
    currentHomeFoulSub -= homeFoulDecrement;
    totalHomeFoulElementSub.textContent = currentHomeFoulSub;
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
    addTotalAwayPoints();
}

//Subtract away points
function decrementAwayTotalPoints(subAwayPointsId, awayPointDecrement) {
    const totalAwayPointElementSub = document.getElementById(subAwayPointsId);
    let currentAwayPointSub = parseInt(totalAwayPointElementSub.textContent, 10);
    currentAwayPointSub -= awayPointDecrement;
    totalAwayPointElementSub.textContent = currentAwayPointSub;
    addTotalAwayPoints();
}

//Calculate total away points
function addTotalAwayPoints() {
    const addAllAwayPoints = document.querySelectorAll('h3[id^="addAwayTotalPoints"]');
        let awayTotalPoints = 0;
    addAllAwayPoints.forEach(awayPoints => {
        awayTotalPoints += parseInt(awayPoints.textContent, 10);
    })
    document.getElementById('awayTotalScore').value = awayTotalPoints;
}
