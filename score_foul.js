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
    let currentHomePointSub = parseInt(totalHomePointElementAdd.textContent, 10);
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

//Calculate total home fouls
function incrementHomeTotalFouls(addHomeFoulsID, homeFoulIncrement) {
    const totalHomeFoulElementAdd = document.getElementById(addHomeFoulsID);
    letcurrentHomeFoulAdd = parseInt(totalHomeFoulElementAdd.textContent, 10);
    currentHOmeFoulAdd += homeFoulIncrement;
    totalHomeFoulElementAdd.textContent = currentHOmeFoulAdd;
    addTotalHomeFouls();
}